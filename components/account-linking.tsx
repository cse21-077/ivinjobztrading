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

// Trading pairs by category
const TRADING_PAIRS = {
  forex: [
    { value: "EURUSD", label: "EUR/USD" },
    { value: "GBPUSD", label: "GBP/USD" },
    { value: "USDJPY", label: "USD/JPY" },
    { value: "AUDUSD", label: "AUD/USD" },
    { value: "USDCAD", label: "USD/CAD" },
    { value: "NZDUSD", label: "NZD/USD" }
  ],
  synthetic_indices: [
    { value: "R_10", label: "Volatility 10 Index" },
    { value: "R_25", label: "Volatility 25 Index" },
    { value: "R_50", label: "Volatility 50 Index" },
    { value: "R_75", label: "Volatility 75 Index" },
    { value: "R_100", label: "Volatility 100 Index" }
  ],
  commodities: [
    { value: "XAUUSD", label: "Gold/USD" },
    { value: "XAGUSD", label: "Silver/USD" },
    { value: "WTICASH", label: "Oil/USD" }
  ],
  cryptocurrencies: [
    { value: "BTCUSD", label: "Bitcoin/USD" },
    { value: "ETHUSD", label: "Ethereum/USD" },
    { value: "LTCUSD", label: "Litecoin/USD" }
  ]
}

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
  const [selectedCategory, setSelectedCategory] = useState<string>("")

  useEffect(() => {
    const fetchUserConfig = async () => {
      if (user) {
        try {
          const docRef = doc(db, "derivConfigs", user.uid)
          const docSnap = await getDoc(docRef)
          if (docSnap.exists()) {
            const data = docSnap.data() as DerivConfig
            setApiToken(data.apiToken || "")
            setServer(data.server || "")
            setAccountId(data.accountId || "")
            setMarkets(data.markets || [])
            setLeverage(data.leverage || "")
            setIsConnected(data.isConnected || false)
            setSelectedSymbols(data.selectedSymbols || [])
          }
        } catch (error) {
          console.error("Error fetching config:", error)
          toast.error("Error retrieving configuration")
        }
      }
    }
    fetchUserConfig()
  }, [user])

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
          selectedSymbols: selectedSymbols
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
    window.location.href = oauthUrl;
  };

  const handleDisconnect = async () => {
    try {
      setIsLoading(true);
      
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
            lastDisconnected: new Date()
          }, { merge: true });
          
          setIsConnected(false);
          setApiToken("");
          setServer("");
          setAccountId("");
          setMarkets([]);
          setLeverage("");
          setSelectedSymbols([]);
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
            {isConnected 
              ? "Your account is connected and ready for trading. You can disconnect at any time."
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
              </div>
              
              <div className="rounded-lg bg-gray-700 p-4 mb-4">
                <h3 className="text-lg font-semibold mb-2">Trading Pairs</h3>
                <div className="space-y-4">
                  <Select
                    value={selectedCategory}
                    onValueChange={setSelectedCategory}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select market category" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(TRADING_PAIRS).map((category) => (
                        <SelectItem key={category} value={category}>
                          {category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedCategory && (
                    <div className="grid grid-cols-2 gap-2">
                      {TRADING_PAIRS[selectedCategory as keyof typeof TRADING_PAIRS].map((pair) => (
                        <div key={pair.value} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={pair.value}
                            checked={selectedSymbols.includes(pair.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSymbols([...selectedSymbols, pair.value]);
                              } else {
                                setSelectedSymbols(selectedSymbols.filter(s => s !== pair.value));
                              }
                            }}
                            className="rounded border-gray-600"
                          />
                          <label htmlFor={pair.value} className="text-sm">{pair.label}</label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <Button 
                onClick={handleDisconnect}
                className="w-full bg-red-600 hover:bg-red-700"
                disabled={isLoading}
              >
                {isLoading ? "Disconnecting..." : "Disconnect Account"}
              </Button>
            </>
          ) : (
            <Button 
              onClick={handleDerivConnect}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? "Connecting..." : "Connect Deriv Account"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
