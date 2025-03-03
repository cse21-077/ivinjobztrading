"use client"

import { useState, useEffect } from "react"
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
import { toast } from "sonner"  // Importing Sonner's toast
import { getDerivOAuthUrl } from "@/lib/deriv-oauth";

// Deriv server options
const DERIV_SERVERS = [
  { id: "svg-demo", name: "SVG-Demo", description: "SVG Virtual Trading" },
  { id: "svg-real", name: "SVG-Real", description: "SVG Real Money Trading" },
  { id: "svg-server-02", name: "SVG-Server 02", description: "SVG Alternative Server" },
  { id: "svg-server-03", name: "SVG-Server 03", description: "SVG Backup Server" }
]

const DERIV_MARKETS = [
  { value: "forex", label: "Forex" },
  { value: "synthetic_indices", label: "Synthetic Indices" },
  { value: "commodities", label: "Commodities" },
  { value: "cryptocurrencies", label: "Cryptocurrencies" }
]

// Leverage options
const LEVERAGE_OPTIONS = ["1:50", "1:100", "1:200", "1:500", "1:1000"]

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

  useEffect(() => {
    let mounted = true;

    const fetchUserConfig = async () => {
      if (user && mounted) {
        try {
          // First check for OAuth tokens
          const accountsRef = doc(db, "derivAccounts", user.uid);
          const accountsSnap = await getDoc(accountsRef);
          
          if (accountsSnap.exists()) {
            const accounts = accountsSnap.data().accounts;
            if (accounts && accounts.length > 0) {
              // Use the first account's token to establish WebSocket connection
              const token = accounts[0].token;
              if (token && !wsConnection) {
                const ws = establishWebSocketConnection(token);
                if (ws) {
                  setApiToken(token);
                  setAccountId(accounts[0].accountId);
                }
              }
            }
          }

          // Then fetch other config
          const docRef = doc(db, "derivConfigs", user.uid)
          const docSnap = await getDoc(docRef)
          if (docSnap.exists()) {
            const data = docSnap.data() as DerivConfig
            setServer(data.server || "")
            setMarkets(data.markets || [])
            setLeverage(data.leverage || "")
            setActiveSymbols(data.activeSymbols || [])
          }
        } catch (error) {
          console.error("Error fetching config:", error)
          if (mounted) {
            toast.error("Error retrieving configuration")
          }
        }
      }
    }

    fetchUserConfig()

    return () => {
      mounted = false;
      if (wsConnection) {
        wsConnection.close();
      }
    }
  }, [user, wsConnection])

  const establishWebSocketConnection = (token: string) => {
    try {
      setConnectionStatus('connecting');
      // Use SVG WebSocket endpoint
      const ws = new WebSocket('wss://ws.svg.deriv.com/websockets/v3');
      
      ws.onopen = () => {
        console.log('WebSocket connection established to SVG server');
        ws.send(JSON.stringify({
          authorize: token,
          passthrough: { userId: user?.uid }
        }));
      };

      ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        console.log('WebSocket message received:', response); // Add logging
        
        if (response.msg_type === 'authorize') {
          if (response.error) {
            console.error('Authorization error:', response.error);
            handleConnectionError(response.error.message);
          } else {
            console.log('Successfully authorized with SVG server');
            setConnectionStatus('connected');
            setIsConnected(true);
            toast.success('Successfully connected to Deriv SVG');
            
            // Request available symbols for SVG
            ws.send(JSON.stringify({
              active_symbols: "brief",
              product_type: "mt5"  // Changed to mt5 for SVG
            }));

            // Subscribe to account status
            ws.send(JSON.stringify({
              account_status: 1,
              subscribe: 1
            }));
          }
        }
        
        if (response.msg_type === 'active_symbols') {
          console.log('Received symbols:', response.active_symbols?.length);
          handleSymbolsResponse(response.active_symbols as DerivSymbol[]);
        }

        if (response.msg_type === 'account_status') {
          updateAccountStatus(response.status as DerivAccountStatus);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        handleConnectionError('Connection error occurred with SVG server');
      };

      ws.onclose = () => {
        console.log('WebSocket connection to SVG server closed');
        handleConnectionClose();
      };

      setWsConnection(ws);
      return ws;
    } catch (error) {
      console.error('Connection establishment error:', error);
      handleConnectionError('Failed to establish connection to SVG server');
      return null;
    }
  };

  const handleConnectionError = (message: string) => {
    toast.error(message);
    if (retryCount < MAX_RETRIES) {
      setRetryCount(prev => prev + 1);
      setTimeout(() => {
        toast.info('Retrying connection...');
        establishWebSocketConnection(apiToken);
      }, 2000 * Math.pow(2, retryCount)); // Exponential backoff
    } else {
      setConnectionStatus('disconnected');
      handleDisconnect();
    }
  };

  const handleConnectionClose = () => {
    setIsConnected(false);
    setConnectionStatus('disconnected');
    if (retryCount < MAX_RETRIES) {
      handleConnectionError('Connection closed unexpectedly');
    }
  };

  const handleSymbolsResponse = (symbols: DerivSymbol[]) => {
    const availableSyms = symbols.map(s => s.symbol);
    setAvailableSymbols(availableSyms);
    
    // Resubscribe to previously active symbols
    if (activeSymbols.length > 0) {
      activeSymbols.forEach(symbol => {
        if (availableSyms.includes(symbol)) {
          subscribeToSymbol(symbol);
        }
      });
    }
  };

  const subscribeToSymbol = (symbol: string) => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        ticks: symbol,
        subscribe: 1
      }));
    }
  };

  const updateAccountStatus = async (status: DerivAccountStatus) => {
    if (user) {
      await setDoc(doc(db, "derivConfigs", user.uid), {
        status: status.status,
        lastUpdated: new Date(),
        activeSymbols: activeSymbols,
        balance: status.balance,
        currency_config: status.currency_config
      }, { merge: true });
    }
  };

  const handleMarketToggle = (market: string) => {
    setMarkets(prev => 
      prev.includes(market) 
        ? prev.filter(m => m !== market) 
        : [...prev, market]
    )
  }

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
          activeSymbols: activeSymbols
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
    const oauthUrl = getDerivOAuthUrl();
    // Store connection attempt in Firestore
    if (user) {
      setDoc(doc(db, "derivConfigs", user.uid), {
        connectionAttempt: new Date(),
        status: 'connecting'
      }, { merge: true });
    }
    window.location.href = oauthUrl;
  };

  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      
      // Close WebSocket connection
      if (wsConnection) {
        wsConnection.close();
      }

      // Disconnect from AWS trading server
      const response = await fetch('/api/mt5/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: user?.uid })
      });

      const result = await response.json();
      
      if (result.success) {
        // Clear Firestore config
        if (user) {
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
  };

  return (
    <Card className="bg-gray-800 text-gray-200">
      <CardHeader className="px-4 sm:px-6 text-gray-200">
        <CardTitle className="text-lg sm:text-xl">Deriv Account Connection</CardTitle>
        <CardDescription>Connect your Deriv trading account to our automated system</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <Alert className="mb-6 bg-gray-700 border-amber-500">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <AlertTitle>Important</AlertTitle>
          <AlertDescription>
            {connectionStatus === 'connected' 
              ? "Your account is connected and ready for trading. You can disconnect at any time."
              : connectionStatus === 'connecting'
              ? "Establishing connection to your Deriv account..."
              : "Connect your Deriv account securely using OAuth. This is the recommended and most secure way to connect your account."}
          </AlertDescription>
        </Alert>
        
        <div className="space-y-4">
          {isConnected ? (
            <>
              <div className="rounded-lg bg-gray-700 p-4 mb-4">
                <h3 className="text-lg font-semibold mb-2">Connected Account Details</h3>
                <p className="text-sm text-gray-300">Server: {server}</p>
                <p className="text-sm text-gray-300">Account ID: {accountId}</p>
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
      </CardContent>
    </Card>
  )
}
