"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useAuthState } from "react-firebase-hooks/auth"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AlertCircle, Check, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { getDerivOAuthUrl } from "@/lib/deriv-oauth"

interface TradingPair {
  symbol: string;
  display_name: string;
}

interface DerivAccount {
  accountId: string;
  token: string;
  currency: string;
  type?: string;
  server?: string;
}

const TRADING_PAIRS: Record<string, TradingPair[]> = {
  synthetic_indices: [
    { symbol: "1HZ75V", display_name: "Volatility 75 Index" },
    { symbol: "1HZ100V", display_name: "Volatility 100 Index" },
    { symbol: "1HZ50V", display_name: "Volatility 50 Index" }
  ],
  forex: [
    { symbol: "frxEURUSD", display_name: "EUR/USD" },
    { symbol: "frxGBPUSD", display_name: "GBP/USD" },
    { symbol: "frxUSDJPY", display_name: "USD/JPY" }
  ]
}

const LOT_SIZES = [
  { value: "0.01", label: "0.01 (Micro)" },
  { value: "0.1", label: "0.1 (Mini)" },
  { value: "1.0", label: "1.0 (Standard)" }
]

const EA_NAME = "The Arm"

export default function EAConfiguration() {
  const [user] = useAuthState(auth)
  const [availableAccounts, setAvailableAccounts] = useState<DerivAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<DerivAccount | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<string>("synthetic_indices")
  const [selectedPair, setSelectedPair] = useState<string>("1HZ75V")
  const [lotSize, setLotSize] = useState<string>("0.01")
  const [isLoading, setIsLoading] = useState(false)
  const [availableMarkets, setAvailableMarkets] = useState<string[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [tradingActive, setTradingActive] = useState(false)
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null)

  // Fetch available accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      if (!user) return;
      
      try {
        setIsLoading(true);
        const accountsRef = doc(db, "derivAccounts", user.uid);
        const accountsSnap = await getDoc(accountsRef);
        
        if (accountsSnap.exists()) {
          const accounts = accountsSnap.data().accounts;
          if (accounts && accounts.length > 0) {
            setAvailableAccounts(accounts);
            
            // Check for saved configuration
            const configRef = doc(db, "derivConfigs", user.uid);
            const configSnap = await getDoc(configRef);
            const savedConfig = configSnap.exists() ? configSnap.data() : null;
            
            if (savedConfig?.selectedAccountId) {
              const savedAccount = accounts.find((acc: DerivAccount) => 
                acc.accountId === savedConfig.selectedAccountId
              );
              
              if (savedAccount) {
                setSelectedAccount(savedAccount);
                if (savedConfig.eaConfig) {
                  setSelectedMarket(savedConfig.eaConfig.market);
                  setSelectedPair(savedConfig.eaConfig.pairs[0]);
                  setLotSize(savedConfig.eaConfig.lotSize);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching accounts:", error);
        toast.error("Failed to load your Deriv accounts");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, [user]);

  // Update available markets based on account type
  useEffect(() => {
    if (!selectedAccount) return;

    const accountType = selectedAccount.type || 'standard';
    
    switch(accountType) {
      case 'financial':
        setAvailableMarkets(['forex']);
        setSelectedMarket('forex');
        setSelectedPair('frxEURUSD');
        break;
      case 'synthetic':
        setAvailableMarkets(['synthetic_indices']);
        setSelectedMarket('synthetic_indices');
        setSelectedPair('1HZ75V');
        break;
      case 'standard':
        setAvailableMarkets(['forex', 'synthetic_indices']);
        break;
      default:
        setAvailableMarkets(['synthetic_indices', 'forex']);
    }
  }, [selectedAccount]);

  const handleAccountSelect = useCallback((account: DerivAccount) => {
    setSelectedAccount(account);
    setConnectionStatus('disconnected');
    setTradingActive(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedAccount) {
      toast.error("Please select a Deriv account first");
      return;
    }

    setIsLoading(true);
    try {
      const eaConfig = {
        server: selectedAccount.server || 'demo',
        eaName: EA_NAME,
        pairs: [selectedPair],
          lotSize,
        market: selectedMarket
      };

      // Save to derivConfigs for VPS connection
      const derivConfigRef = doc(db, "derivConfigs", user.uid);
      await setDoc(derivConfigRef, {
        selectedAccountId: selectedAccount.accountId,
        eaConfig,
        lastUpdated: new Date(),
        status: 'ready_to_connect',
        derivToken: selectedAccount.token
      }, { merge: true });

      // Make the VPS connection request
      const response = await fetch('/api/vps/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          accountId: selectedAccount.accountId,
          derivToken: selectedAccount.token,
          eaConfig
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `VPS connection failed with status: ${response.status}`);
      }

      const vpsResult = await response.json();
      if (!vpsResult.success) {
        throw new Error(vpsResult.error || "Failed to connect to VPS");
      }

      // Save EA configuration
      await setDoc(doc(db, "eaConfigs", user.uid), {
        market: selectedMarket,
        pair: selectedPair,
        lotSize,
        eaName: EA_NAME,
        server: selectedAccount.server || 'demo',
        lastUpdated: new Date(),
        status: 'connected'
      });

      setTradingActive(true);
      setConnectionStatus('connected');
      toast.success("Trading configuration saved and connected to VPS!");
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to save configuration");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDerivConnect = useCallback(() => {
    const oauthUrl = getDerivOAuthUrl();
    if (user) {
      setDoc(doc(db, "derivConfigs", user.uid), {
        connectionAttempt: new Date(),
        status: 'connecting'
      }, { merge: true });
    }
    window.location.href = oauthUrl;
  }, [user]);

  const getCurrentPairDisplay = () => {
    return TRADING_PAIRS[selectedMarket]?.find(p => p.symbol === selectedPair)?.display_name || "Select pair";
  };

  if (availableAccounts.length === 0) {
    return (
      <Card className="bg-gray-800 text-gray-200">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-lg sm:text-xl">The Arm Configuration</CardTitle>
          <CardDescription>Connect your Deriv account to start trading</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <Alert className="bg-gray-700 border-amber-500 mb-6">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertTitle>No Trading Accounts Found</AlertTitle>
            <AlertDescription>
              Connect your Deriv account to start automated trading with The Arm EA.
            </AlertDescription>
          </Alert>
          
          <Button 
            onClick={handleDerivConnect}
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Deriv Account"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-800 text-gray-200">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="text-lg sm:text-xl">The Arm Configuration</CardTitle>
        <CardDescription>Configure your trading settings</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Select Trading Account</Label>
            <div className="space-y-2">
              {availableAccounts.map((account) => (
                <button
                  key={account.accountId}
                  type="button"
                  onClick={() => handleAccountSelect(account)}
                  disabled={isLoading}
                  className={`w-full p-4 rounded-lg text-left transition-colors ${
                    selectedAccount?.accountId === account.accountId
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-700 hover:bg-gray-600'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium">Account ID: {account.accountId}</div>
                  <div className="text-sm text-gray-300">Currency: {account.currency}</div>
                  {account.type && (
                    <div className="text-sm text-gray-300">Type: {account.type}</div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedAccount && (
            <>
              {availableMarkets.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="market">Market Type</Label>
                  <Select 
                    value={selectedMarket} 
                    onValueChange={(value) => {
                      setSelectedMarket(value);
                      setSelectedPair(TRADING_PAIRS[value][0].symbol);
                    }}
                  >
                    <SelectTrigger id="market" className="w-full bg-gray-700 border-gray-600">
                      <SelectValue placeholder="Select market type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMarkets.includes('synthetic_indices') && (
                        <SelectItem value="synthetic_indices">Synthetic Indices</SelectItem>
                      )}
                      {availableMarkets.includes('forex') && (
                        <SelectItem value="forex">Forex</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

          <div className="space-y-2">
                <Label htmlFor="pair">Trading Pair</Label>
                <Select 
                  value={selectedPair}
                  onValueChange={setSelectedPair}
                >
                  <SelectTrigger id="pair" className="w-full bg-gray-700 border-gray-600">
                    <SelectValue placeholder="Select trading pair">
                      {getCurrentPairDisplay()}
                    </SelectValue>
              </SelectTrigger>
              <SelectContent>
                    {TRADING_PAIRS[selectedMarket]?.map((pair) => (
                      <SelectItem key={pair.symbol} value={pair.symbol}>
                        {pair.display_name}
                      </SelectItem>
                    ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
                <Label htmlFor="lotSize">Lot Size</Label>
                <Select 
              value={lotSize}
                  onValueChange={setLotSize}
                >
                  <SelectTrigger id="lotSize" className="w-full bg-gray-700 border-gray-600">
                    <SelectValue placeholder="Select lot size" />
                  </SelectTrigger>
                  <SelectContent>
                    {LOT_SIZES.map((size) => (
                      <SelectItem key={size.value} value={size.value}>
                        {size.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
          </div>

              <Button 
                type="submit" 
                className="w-full bg-green-600 hover:bg-green-700" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting to VPS...
                  </>
                ) : connectionStatus === 'connected' ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Trading Active
                  </>
                ) : (
                  "Start Trading"
                )}
          </Button>
            </>
          )}
        </form>

        {tradingActive && (
          <div className="mt-6 rounded-lg bg-green-900/20 border border-green-500 p-4">
            <div className="flex items-center mb-2">
              <Check className="h-5 w-5 text-green-400 mr-2" />
              <h3 className="text-lg font-semibold text-green-400">
                Trading Active
              </h3>
            </div>
            <p className="text-sm text-gray-300">
              The Arm EA is now trading automatically with your configured settings.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

