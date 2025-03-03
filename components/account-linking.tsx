"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuthState } from "react-firebase-hooks/auth"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"  // Importing Sonner's toast
import { getDerivOAuthUrl } from "@/lib/deriv-oauth";

// Deriv server options
const DERIV_SERVERS = [
  { id: "svg-demo", name: "SVG-Demo", description: "SVG Virtual Trading", endpoint: "green.binaryws.com" },
  { id: "svg-real", name: "SVG-Real", description: "SVG Real Money Trading", endpoint: "ws.binaryws.com" },
  { id: "svg-server-02", name: "SVG-Server 02", description: "SVG Alternative Server", endpoint: "ws.derivws.com" },
  { id: "svg-server-03", name: "SVG-Server 03", description: "SVG Backup Server", endpoint: "ws.derivws.com" }
]

const DERIV_MARKETS = [
  { value: "forex", label: "Forex" },
  { value: "synthetic_indices", label: "Synthetic Indices" },
  { value: "commodities", label: "Commodities" },
  { value: "cryptocurrencies", label: "Cryptocurrencies" }
]

// Leverage options
const LEVERAGE_OPTIONS = ["1:50", "1:100", "1:200", "1:500", "1:1000"]

const DERIV_APP_ID = '69299';

interface DerivConfig {
  apiToken: string;
  server: string;
  accountId: string;
  markets: string[];
  leverage: string;
  isConnected: boolean;
  lastConnected?: Date;
  selectedSymbols: string[];
  status: 'disconnected' | 'connecting' | 'connected';
  activeSymbols: string[];
  selectedAccountId?: string;
  tradingMode: 'manual' | 'automated' | null;
}

interface MT4Config {
  server: string;
  login: string;
  password: string;
  eaName: string;
}

interface MT5Config {
  server: string;
  login: string;
  password: string;
  eaName: string;
}

// Add interfaces for WebSocket responses
interface DerivSymbol {
  symbol: string;
  display_name: string;
  market: string;
  market_display_name: string;
  pip: number;
  submarket: string;
  submarket_display_name: string;
}

interface DerivAccountStatus {
  status: string;
  currency_config: {
    decimal_places: number;
  };
  balance: number;
  login_id: string;
}

interface DerivAccount {
  accountId: string;
  token: string;
  currency: string;
}

type ConnectionErrorType = 
  | 'network_error'
  | 'auth_error'
  | 'server_error'
  | 'timeout'
  | 'ea_config_error'
  | 'unknown';

export default function DerivAccountLinking() {
  const [user] = useAuthState(auth)
  const [apiToken, setApiToken] = useState("")
  const [server, setServer] = useState("")
  const [accountId, setAccountId] = useState("")
  const [markets, setMarkets] = useState<string[]>([])
  const [leverage, setLeverage] = useState("")
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([])
  const [mt4Server, setMt4Server] = useState("")
  const [mt4Login, setMt4Login] = useState("")
  const [mt4Password, setMt4Password] = useState("")
  const [mt5Server, setMt5Server] = useState("")
  const [mt5Login, setMt5Login] = useState("")
  const [mt5Password, setMt5Password] = useState("")
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([])
  const [activeSymbols, setActiveSymbols] = useState<string[]>([])
  const [retryCount, setRetryCount] = useState(0)
  const MAX_RETRIES = 3
  const [isConnecting, setIsConnecting] = useState(false)
  const [availableAccounts, setAvailableAccounts] = useState<DerivAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<DerivAccount | null>(null)
  const [showAccountSelect, setShowAccountSelect] = useState(false)
  const [isAccountConfirmed, setIsAccountConfirmed] = useState(false)
  const [showSuccessScreen, setShowSuccessScreen] = useState(false)
  const [tradingMode, setTradingMode] = useState<'automated' | null>(null)
  const [showEaConfigDialog, setShowEaConfigDialog] = useState(false)
  const [errorType, setErrorType] = useState<ConnectionErrorType | null>(null);

  const getErrorMessage = (type: ConnectionErrorType): string => {
    switch(type) {
      case 'network_error':
        return 'Network connection error. Please check your internet connection and try again.';
      case 'auth_error':
        return 'Authentication failed. Your Deriv token may have expired.';
      case 'server_error':
        return 'Deriv server error. Please try again later or contact support.';
      case 'timeout':
        return 'Connection timed out. Please try again.';
      case 'ea_config_error':
        return 'EA configuration is missing or invalid. Please set up your EA configuration first.';
      case 'unknown':
      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  };

  const getErrorRecoverySteps = (type: ConnectionErrorType): string[] => {
    switch(type) {
      case 'network_error':
        return [
          'Check your internet connection',
          'Try refreshing the page',
          'Ensure your firewall isn\'t blocking the connection'
        ];
      case 'auth_error':
        return [
          'Reconnect your Deriv account',
          'Make sure you have the correct permissions'
        ];
      case 'server_error':
        return [
          'Try again in a few minutes',
          'Check Deriv system status',
          'Contact support if the issue persists'
        ];
      case 'timeout':
        return [
          'Check your internet speed',
          'Try again when your connection is more stable'
        ];
      case 'ea_config_error':
        return [
          'Go to EA Configuration page',
          'Set up your EA configuration properly',
          'Ensure you\'ve selected valid trading pairs'
        ];
      case 'unknown':
      default:
        return [
          'Refresh the page and try again',
          'Clear your browser cache',
          'Contact support with error details'
        ];
    }
  };

  const handleDisconnect = useCallback(async () => {
    try {
      console.log('=== Starting Disconnection Process ===');
      setIsLoading(true);
      setIsConnecting(false);
      
      if (wsConnection) {
        console.log('1. Closing WebSocket connection...');
        wsConnection.close();
      }

      console.log('2. Disconnecting from VPS...');
      const response = await fetch('/api/vps/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user?.uid })
      });

      const result = await response.json();
      
      if (result.success) {
        if (user) {
          console.log('3. Updating Firestore with disconnected status...');
          await setDoc(doc(db, "derivConfigs", user.uid), {
            isConnected: false,
            lastDisconnected: new Date(),
            status: 'disconnected',
            activeSymbols: []
          }, { merge: true });
          
          setIsConnected(false);
          setApiToken("");
          setServer("");
          setAccountId("");
          setMarkets([]);
          setLeverage("");
          setActiveSymbols([]);
          console.log('4. Disconnection completed successfully');
          toast.success("Successfully disconnected your trading account");
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error disconnecting:", error);
      toast.error("Failed to disconnect your account");
    } finally {
      setIsLoading(false);
    }
  }, [user, wsConnection]);

  const handleConnectionError = useCallback((message: string, token?: string) => {
    console.error('Connection error:', message);
    
    // Determine error type based on message content
    let errorType: ConnectionErrorType = 'unknown';
    
    if (message.includes('network') || message.includes('internet') || message.includes('WebSocket')) {
      errorType = 'network_error';
    } else if (message.includes('auth') || message.includes('token') || message.includes('authorize')) {
      errorType = 'auth_error';
    } else if (message.includes('server')) {
      errorType = 'server_error';
    } else if (message.includes('timeout') || message.includes('timed out')) {
      errorType = 'timeout';
    } else if (message.includes('EA configuration')) {
      errorType = 'ea_config_error';
    }
    
    setErrorType(errorType);
    
    // Show dialog for EA configuration errors
    if (errorType === 'ea_config_error') {
      setShowEaConfigDialog(true);
      return;
    }
    
    toast.error(message);
    setIsConnecting(false);
    
    if (retryCount < MAX_RETRIES) {
      const backoffTime = Math.min(2000 * Math.pow(2, retryCount), 10000);
      console.log(`Retrying connection in ${backoffTime}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      
      setRetryCount(prev => prev + 1);
      if (token) {
        setTimeout(() => {
          toast.info('Retrying connection...');
          setConnectionStatus('connecting');
          setApiToken(token);
          setIsConnecting(true);
        }, backoffTime);
      }
    } else {
      console.error('Max retry attempts reached');
      setConnectionStatus('disconnected');
      handleDisconnect();
    }
  }, [retryCount, MAX_RETRIES, handleDisconnect]);

  const handleConnectionClose = useCallback(() => {
    setIsConnected(false);
    setConnectionStatus('disconnected');
    if (retryCount < MAX_RETRIES && apiToken) {
      toast.error('Connection closed unexpectedly');
      handleConnectionError('Connection closed unexpectedly', apiToken);
    }
  }, [retryCount, MAX_RETRIES, handleConnectionError, apiToken]);

  const subscribeToSymbol = useCallback((symbol: string) => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        ticks: symbol,
        subscribe: 1
      }));
    }
  }, [wsConnection]);

  const handleSymbolsResponse = useCallback((symbols: DerivSymbol[]) => {
    const availableSyms = symbols.map(s => s.symbol);
    setAvailableSymbols(availableSyms);
    
    if (activeSymbols.length > 0) {
      activeSymbols.forEach(symbol => {
        if (availableSyms.includes(symbol)) {
          subscribeToSymbol(symbol);
        }
      });
    }
  }, [activeSymbols, subscribeToSymbol]);

  const updateAccountStatus = useCallback(async (status: DerivAccountStatus) => {
    if (user) {
      await setDoc(doc(db, "derivConfigs", user.uid), {
        status: status.status,
        lastUpdated: new Date(),
        activeSymbols: activeSymbols,
        balance: status.balance,
        currency_config: status.currency_config
      }, { merge: true });
    }
  }, [user, activeSymbols]);

  const establishWebSocketConnection = useCallback(async (token: string) => {
    // Define a single endpoint with the known app_id
    const endpoint = `wss://ws.binaryws.com/websockets/v3?app_id=${DERIV_APP_ID}`;
    console.log('Attempting connection to:', endpoint);

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(endpoint);
        
        ws.onopen = () => {
          console.log('WebSocket connection established');
          ws.send(JSON.stringify({ authorize: token }));
        };

        ws.onmessage = (event) => {
          const response = JSON.parse(event.data);
          if (response.error) {
            console.error('WebSocket error:', response.error);
            reject(response.error);
            return;
          }
          if (response.msg_type === 'authorize') {
            console.log('Authorization successful');
            resolve(ws);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        ws.onclose = () => {
          console.log('WebSocket connection closed');
          reject(new Error('WebSocket connection closed'));
        };

      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        reject(error);
      }
    });
  }, []);

  const handleConnection = useCallback(async () => {
    try {
      setIsConnecting(true);
      const ws = await establishWebSocketConnection(apiToken);
      setWsConnection(ws as WebSocket);
      setIsConnected(true);
      setConnectionStatus('connected');
      toast.success('Successfully connected to Deriv');
    } catch (error: unknown) {
      console.error('Connection error:', error);
      setIsConnecting(false);
      setConnectionStatus('disconnected');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to connect: ${errorMessage}`);
    }
  }, [apiToken, establishWebSocketConnection]);

  useEffect(() => {
    let mounted = true;
    const fetchUserConfig = async () => {
      if (!user || !mounted) {
        return;
      }

      try {
        console.log('=== Starting Configuration Fetch ===');
        console.log('1. Fetching user configuration from Firestore...');
        
        // Get saved configuration first
        const configRef = doc(db, "derivConfigs", user.uid);
        const configSnap = await getDoc(configRef);
        const savedConfig = configSnap.exists() ? configSnap.data() as DerivConfig : null;
        
        // Then get accounts
        console.log('2. Fetching Deriv accounts...');
        const accountsRef = doc(db, "derivAccounts", user.uid);
        const accountsSnap = await getDoc(accountsRef);
        
        if (accountsSnap.exists()) {
          const accounts = accountsSnap.data().accounts;
          console.log('3. Found Deriv accounts:', accounts?.length || 0);
          
          if (accounts && accounts.length > 0) {
            setAvailableAccounts(accounts);
            
            // If there's a saved account preference and it exists in accounts
            if (savedConfig?.selectedAccountId) {
              const savedAccount = accounts.find((acc: DerivAccount) => acc.accountId === savedConfig.selectedAccountId);
              if (savedAccount) {
                console.log('4. Found previously selected account:', savedAccount.accountId);
                setSelectedAccount(savedAccount);
                setIsAccountConfirmed(false); // Don't auto-confirm
              }
            }
            
            // Show account selection if there are multiple accounts or no saved preference
            if (accounts.length > 1 || !savedConfig?.selectedAccountId) {
              console.log('5. Showing account selection interface');
              setShowAccountSelect(true);
            }
          }
        } else {
          console.log('No Deriv accounts found in Firestore');
        }

        // Set other configuration if available
        if (savedConfig) {
          console.log('6. Setting up saved configuration');
          setServer(savedConfig.server || "");
          setMarkets(savedConfig.markets || []);
          setLeverage(savedConfig.leverage || "");
          setActiveSymbols(savedConfig.activeSymbols || []);
        }
        console.log('7. Configuration fetch completed');
        } catch (error) {
        console.error("Error fetching config:", error);
        if (mounted) {
          toast.error("Error retrieving configuration");
        }
      }
    };

    fetchUserConfig();

    return () => {
      mounted = false;
    };
  }, [user]);

  const handleAccountSelect = useCallback(async (account: DerivAccount) => {
    setSelectedAccount(account);
    setIsAccountConfirmed(false);
  }, []);

  const handleAccountConfirm = useCallback(async () => {
    if (!selectedAccount || !user) return;

    try {
      console.log('=== Starting Account Connection ===');
      console.log('Account ID:', selectedAccount.accountId);
      setIsAccountConfirmed(true);
      setShowAccountSelect(false);
      setIsConnecting(true);
      
      // Save selected account preference
      await setDoc(doc(db, "derivConfigs", user.uid), {
        selectedAccountId: selectedAccount.accountId,
        status: 'connecting',
        lastConnectionAttempt: new Date()
      }, { merge: true });
      
      // Establish connection with selected account
      handleConnection();
      setApiToken(selectedAccount.token);
      setAccountId(selectedAccount.accountId);
    } catch (error) {
      console.error("Error confirming account:", error);
      toast.error("Failed to confirm account");
      setIsConnecting(false);
      setIsAccountConfirmed(false);
    }
  }, [user, selectedAccount, handleConnection]);

  const handleChangeAccount = useCallback(() => {
    setShowAccountSelect(true);
    setIsAccountConfirmed(false);
    if (wsConnection) {
      wsConnection.close();
    }
    setConnectionStatus('disconnected');
    setIsConnected(false);
  }, [wsConnection]);

  const isMarketSupportedForAccount = useCallback((market: string, accountType: string): boolean => {
    // Synthetic accounts can only trade synthetic indices
    if (accountType.includes('demo') && market !== 'synthetic_indices') {
      return false;
    }
    
    // SVG accounts typically support forex, commodities and synthetic indices
    if (accountType.includes('svg')) {
      return ['forex', 'synthetic_indices', 'commodities'].includes(market);
    }
    
    // Default to allowing the market if we're not sure
    return true;
  }, []);

  const handleMarketToggle = useCallback((market: string) => {
    // If we have account information, validate the market is supported
    if (selectedAccount) {
      const accountType = selectedAccount.accountId.toLowerCase();
      if (!isMarketSupportedForAccount(market, accountType)) {
        toast.error(`${market.replace('_', ' ')} is not supported for this account type`);
        return;
      }
    }
    
    setMarkets(prev => 
      prev.includes(market) 
        ? prev.filter(m => m !== market) 
        : [...prev, market]
    );
  }, [selectedAccount, isMarketSupportedForAccount]);

  const validateForm = () => {
    if (!apiToken) return "API token is required"
    if (!server) return "Please select a server"
    if (!accountId) return "Account ID is required"
    if (markets.length === 0) return "Please select at least one market"
    if (!leverage) return "Please select leverage"
    return null
  }

  const testConnection = async () => {
    return new Promise<boolean>(resolve => {
      setTimeout(() => resolve(true), 1500)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const validationError = validateForm()
    if (validationError) {
      toast.error(validationError) // Using Sonner toast
      return
    }

    setIsLoading(true)
    try {
      const connectionSuccessful = await testConnection()
      
      if (!connectionSuccessful) {
        toast.error("Could not connect to Deriv with the provided details") // Using Sonner toast
        setIsLoading(false)
        return
      }
      
      if (user) {
        const configData: DerivConfig = {
          apiToken,
          server,
          accountId,
          markets,
          leverage,
          isConnected: true,
          lastConnected: new Date(),
          selectedSymbols: selectedSymbols,
          status: 'connected',
          activeSymbols: activeSymbols,
          tradingMode: null
        }
        
        await setDoc(doc(db, "derivConfigs", user.uid), configData)
        
        await fetch('https://your-aws-ea-server.com/api/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.uid,
            apiToken,
            server,
            accountId,
            markets,
            leverage
          })
        })
        
        setIsConnected(true)
        toast.success("Your Deriv account has been connected successfully!") // Using Sonner toast
      }
    } catch (error) {
      console.error("Error connecting account:", error)
      toast.error("There was an error connecting your account") // Using Sonner toast
    } finally {
      setIsLoading(false)
    }
  }

  const handleBrokerLogin = async (credentials: { server: string; login: string; password: string }) => {
    try {
      setIsLoading(true);

      const response = await fetch('/api/mt5/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials)
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Successfully connected to MT5 and activated The Arm EA!");
        // Save the connection status to Firestore
        if (user) {
          await setDoc(doc(db, "mt5Connections", user.uid), {
            server: credentials.server,
            login: credentials.login,
            eaName: 'The Arm',
            isConnected: true,
            lastConnected: new Date()
          });
        }
      } else {
        toast.error(result.error || "Failed to connect to MT5");
      }
    } catch (error) {
      console.error('Connection error:', error);
      toast.error("Failed to connect to MT5. Please check your credentials and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDerivConnect = () => {
    console.log('Initiating Deriv connection...');
    const oauthUrl = getDerivOAuthUrl();
    console.log('Redirecting to:', oauthUrl);
    // Store connection attempt in Firestore
    if (user) {
      setDoc(doc(db, "derivConfigs", user.uid), {
        connectionAttempt: new Date(),
        status: 'connecting'
      }, { merge: true }).then(() => {
        console.log('Connection attempt stored in Firestore');
      }).catch(error => {
        console.error('Failed to store connection attempt:', error);
      });
    }
    window.location.href = oauthUrl;
  };

  const handleTradingModeSelect = useCallback(async (mode: 'automated') => {
    if (!user || !selectedAccount) return;

    try {
      setTradingMode(mode);
      setIsLoading(true);

      // Save trading mode preference
      await setDoc(doc(db, "derivConfigs", user.uid), {
        tradingMode: mode,
        lastUpdated: new Date()
      }, { merge: true });
      
    } catch (error) {
      console.error("Error setting up trading mode:", error);
      toast.error("Failed to set up trading mode");
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedAccount]);

  // Add EA Configuration Dialog component
  const EaConfigDialog = () => (
    <Dialog open={showEaConfigDialog} onOpenChange={setShowEaConfigDialog}>
      <DialogContent className="bg-gray-800 text-gray-200">
        <DialogHeader>
          <DialogTitle>EA Configuration Required</DialogTitle>
          <DialogDescription>
            Before connecting to the trading server, you need to configure your EA settings first.
            This includes selecting your:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Trading Market (Synthetic Indices/Forex)</li>
              <li>Trading Pair (e.g., Volatility 75)</li>
              <li>Trading Server</li>
            </ul>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => setShowEaConfigDialog(false)}
            className="sm:order-1"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              window.location.href = '/dashboard/ea-configuration';
            }}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={isLoading}
          >
            Configure EA Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <Card className="bg-gray-800 text-gray-200">
      <CardHeader className="px-4 sm:px-6 text-gray-200">
        <CardTitle className="text-lg sm:text-xl">Deriv Account Connection</CardTitle>
        <CardDescription>Connect your Deriv trading account to our automated trading system</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <Alert className="mb-6 bg-gray-700 border-amber-500">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <AlertTitle>Important</AlertTitle>
          <AlertDescription>
            {connectionStatus === 'connected' 
              ? "Your account is connected and ready for automated trading."
              : connectionStatus === 'connecting'
              ? "Establishing connection to Deriv and our VPS server... This may take a few moments."
              : "Connect your Deriv account securely using OAuth to enable automated trading."}
          </AlertDescription>
        </Alert>
        
        {showSuccessScreen && isConnected ? (
          <div className="space-y-6">
            <div className="rounded-lg bg-green-900/20 border border-green-500 p-4">
              <h3 className="text-lg font-semibold text-green-400 mb-2">Connection Successful!</h3>
              <p className="text-sm text-gray-300">Your Deriv account is now connected to our automated trading system.</p>
            </div>
            
            {!tradingMode ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Start Automated Trading</h3>
                <p className="text-sm text-gray-300 mb-4">
                  Our AI-powered trading system will analyze market conditions and execute trades automatically based on your settings.
                </p>
                <Button
                  onClick={() => handleTradingModeSelect('automated')}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={isLoading}
                >
                  {isLoading ? "Setting up..." : "Start Automated Trading"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-blue-900/20 border border-blue-500 p-4">
                  <h3 className="text-lg font-semibold text-blue-400 mb-2">Automated Trading Active</h3>
                  <p className="text-sm text-gray-300">
                    The automated trading system is now active and monitoring the market.
            </p>
          </div>
          
                <div className="flex justify-between items-center">
                  <Button
                    onClick={() => window.location.href = '/dashboard/ea-configuration'}
                    className="bg-gray-600 hover:bg-gray-700"
                    disabled={isLoading}
                  >
                    Configure EA Settings
                  </Button>
                  <Button
                    onClick={handleDisconnect}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={isLoading}
                  >
                    Stop Trading & Disconnect
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {(showAccountSelect || !isAccountConfirmed) && availableAccounts.length > 0 && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Select Trading Account</h3>
                  {selectedAccount && !isAccountConfirmed && (
                    <Button
                      onClick={handleAccountConfirm}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={isConnecting}
                    >
                      {isConnecting ? "Connecting..." : "Confirm Selection"}
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {availableAccounts.map((account) => (
                    <button
                      key={account.accountId}
                      onClick={() => handleAccountSelect(account)}
                      disabled={isConnecting}
                      className={`w-full p-4 rounded-lg text-left transition-colors ${
                        selectedAccount?.accountId === account.accountId
                          ? 'bg-blue-600 hover:bg-blue-700'
                          : 'bg-gray-700 hover:bg-gray-600'
                      } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="font-medium">Account ID: {account.accountId}</div>
                      <div className="text-sm text-gray-300">Currency: {account.currency}</div>
                    </button>
              ))}
            </div>
          </div>
            )}
            
            <div className="space-y-4">
              {isConnected ? (
                <>
                  <div className="rounded-lg bg-gray-700 p-4 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-semibold">Connected Account Details</h3>
                      <Button
                        onClick={handleChangeAccount}
                        className="bg-blue-600 hover:bg-blue-700"
                        disabled={isLoading || connectionStatus === 'connecting'}
                      >
                        Change Account
                      </Button>
          </div>
                    <p className="text-sm text-gray-300">Account ID: {selectedAccount?.accountId || accountId}</p>
                    <p className="text-sm text-gray-300">Currency: {selectedAccount?.currency}</p>
                    <p className="text-sm text-gray-300">Server: {server}</p>
                    <p className="text-sm text-gray-300">Markets: {markets.join(", ")}</p>
                    <p className="text-sm text-gray-300">Leverage: {leverage}</p>
                    <p className="text-sm text-gray-300">Active Symbols: {activeSymbols.length}</p>
          </div>
          
          <Button 
                    onClick={handleDisconnect}
                    className="w-full bg-red-600 hover:bg-red-700"
                    disabled={isLoading || connectionStatus === 'connecting'}
                  >
                    {isLoading ? "Disconnecting..." : "Disconnect Account"}
          </Button>
                </>
              ) : (
          <Button 
                  onClick={handleDerivConnect}
            className="w-full" 
                  disabled={isLoading || connectionStatus === 'connecting'}
          >
                  {connectionStatus === 'connecting' ? "Connecting..." : "Connect Deriv Account"}
          </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
      {errorType && connectionStatus === 'disconnected' && (
        <div className="mt-6 p-4 bg-red-900/20 border border-red-700 rounded-lg">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Connection Error</h3>
          <p className="text-sm text-gray-300 mb-4">{getErrorMessage(errorType)}</p>
          
          <h4 className="text-sm font-medium text-gray-400 mb-2">Troubleshooting steps:</h4>
          <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
            {getErrorRecoverySteps(errorType).map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ul>
          
          <div className="mt-4 flex justify-end">
            <Button 
              variant="outline" 
              className="mr-2"
              onClick={() => setErrorType(null)}
            >
              Dismiss
            </Button>
            <Button 
              onClick={handleDerivConnect}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
      <EaConfigDialog />
    </Card>
  )
}
