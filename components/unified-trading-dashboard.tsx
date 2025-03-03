"use client"

import type React from "react"
import { useState, useCallback } from "react"
import { useAuthState } from "react-firebase-hooks/auth"
import { auth } from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AlertCircle, Check, Loader2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { getDerivOAuthUrl } from "@/lib/deriv-oauth"
import { useDerivAccount } from "@/hooks/use-deriv"

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

export default function UnifiedTradingDashboard() {
  const [user] = useAuthState(auth)
  const { 
    availableAccounts, 
    activeAccount,
    selectedAccountId,
    isConnected,
    isLoading: isLoadingAccounts,
    error: accountError,
    connectToAccount
  } = useDerivAccount()
  
  const [selectedMarket, setSelectedMarket] = useState<string>("synthetic_indices")
  const [selectedPair, setSelectedPair] = useState<string>("1HZ75V")
  const [lotSize, setLotSize] = useState<string>("0.01")
  const [isLoading, setIsLoading] = useState(false)
  const [availableMarkets, setAvailableMarkets] = useState<string[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [tradingActive, setTradingActive] = useState(false)

  // Update available markets based on account type
  const handleAccountSelect = useCallback(async (account: DerivAccount) => {
    try {
      await connectToAccount(account.accountId);
      setConnectionStatus('disconnected');
      setTradingActive(false);

      const accountType = account.type || 'standard';
      
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
    } catch (error) {
      toast.error("Failed to connect to account");
    }
  }, [connectToAccount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeAccount) {
      toast.error("Please select a Deriv account first");
      return;
    }

    setIsLoading(true);
    try {
      const eaConfig = {
        server: activeAccount.server || 'demo',
        eaName: EA_NAME,
        pairs: [selectedPair],
        lotSize,
        market: selectedMarket
      };

      // Make the VPS connection request with live data
      const response = await fetch('/api/vps/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          accountId: activeAccount.accountId,
          derivToken: activeAccount.token,
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

      setTradingActive(true);
      setConnectionStatus('connected');
      toast.success("Successfully connected to VPS and started trading!");
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to connect to VPS");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDerivConnect = useCallback(() => {
    const oauthUrl = getDerivOAuthUrl();
    window.location.href = oauthUrl;
  }, []);

  const getCurrentPairDisplay = () => {
    return TRADING_PAIRS[selectedMarket]?.find(p => p.symbol === selectedPair)?.display_name || "Select pair";
  };

  if (isLoadingAccounts) {
    return (
      <Card className="bg-gray-800 text-gray-200">
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </CardContent>
      </Card>
    );
  }

  if (accountError) {
    return (
      <Card className="bg-gray-800 text-gray-200">
        <CardContent className="p-8">
          <Alert className="bg-red-900/20 border-red-500">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertTitle>Error Loading Accounts</AlertTitle>
            <AlertDescription>{accountError}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!availableAccounts || availableAccounts.length === 0) {
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
                    selectedAccountId === account.accountId
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-700 hover:bg-gray-600'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="font-medium">Account ID: {account.accountId}</div>
                  <div className="text-sm text-gray-300">Currency: {account.currency}</div>
                  {account.type && (
                    <div className="text-sm text-gray-300">Type: {account.type}</div>
                  )}
                  {selectedAccountId === account.accountId && isConnected && (
                    <div className="text-sm text-green-400 mt-1">
                      <Check className="h-4 w-4 inline-block mr-1" />
                      Connected
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {activeAccount && (
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
                disabled={isLoading || !isConnected}
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
                ) : !isConnected ? (
                  "Connect Account First"
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