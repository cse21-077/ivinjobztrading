"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAuthState } from "react-firebase-hooks/auth"
import { doc, setDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useDerivAccount } from "@/hooks/use-deriv"

interface TradingPair {
  symbol: string;
  display_name: string;
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

const EA_NAME = "The Arm"

export default function EAConfiguration() {
  const [user] = useAuthState(auth)
  const { activeAccount, isConnected } = useDerivAccount()
  const [selectedMarket, setSelectedMarket] = useState<string>("synthetic_indices")
  const [selectedPair, setSelectedPair] = useState<string>("1HZ75V")
  const [isLoading, setIsLoading] = useState(false)
  const [availableMarkets, setAvailableMarkets] = useState<string[]>([])

  useEffect(() => {
    if (!activeAccount || !isConnected) return

    // Set available markets based on account type
    const accountType = activeAccount.type
    switch(accountType) {
      case 'financial':
        setAvailableMarkets(['forex'])
        setSelectedMarket('forex')
        setSelectedPair('frxEURUSD')
        break
      case 'synthetic':
        setAvailableMarkets(['synthetic_indices'])
        setSelectedMarket('synthetic_indices')
        setSelectedPair('1HZ75V')
        break
      case 'standard':
        setAvailableMarkets(['forex', 'synthetic_indices'])
        break
      default:
        toast.error("Unknown account type")
        return
    }
  }, [activeAccount, isConnected])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !activeAccount || !isConnected) {
      toast.error("Please ensure your Deriv account is connected")
      return
    }

    setIsLoading(true)
    try {
      const eaConfig = {
        server: activeAccount.server,
        eaName: EA_NAME,
        pairs: [selectedPair],
        lotSize: 0.01
      }

      // Save to derivConfigs for VPS connection with real-time token
      const derivConfigRef = doc(db, "derivConfigs", user.uid)
      await setDoc(derivConfigRef, {
        eaConfig,
        lastUpdated: new Date(),
        status: 'ready_to_connect',
        derivToken: activeAccount.token
      })

      // Make the VPS connection request
      const response = await fetch('/api/vps/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          accountId: activeAccount.id,
          derivToken: activeAccount.token,
          eaConfig
        })
      })

      if (!response.ok) {
        throw new Error('Failed to connect to VPS')
      }

      // Only save to eaConfigs after successful VPS connection
      const eaConfigRef = doc(db, "eaConfigs", user.uid)
      await setDoc(eaConfigRef, {
        market: selectedMarket,
        pair: selectedPair,
        lotSize: 0.01,
        eaName: EA_NAME,
        server: activeAccount.server,
        lastUpdated: new Date(),
        status: 'connected'
      })

      toast.success("Trading configuration saved and connected to VPS!")
    } catch (error: any) {
      console.error("Error:", error)
      toast.error(error.message || "Failed to save configuration")
    } finally {
      setIsLoading(false)
    }
  }

  const getCurrentPairDisplay = () => {
    return TRADING_PAIRS[selectedMarket]?.find(p => p.symbol === selectedPair)?.display_name || "Select pair"
  }

  if (!isConnected || !activeAccount) {
    return (
      <Card className="bg-gray-800 text-gray-200">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-lg sm:text-xl">The Arm Configuration</CardTitle>
          <CardDescription>Please connect your Deriv account first</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          <div className="text-center py-6">
            Please connect and select a Deriv account to configure trading settings.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-gray-800 text-gray-200">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="text-lg sm:text-xl">The Arm Configuration</CardTitle>
        <CardDescription>Configure trading settings for your {activeAccount.type} account</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {availableMarkets.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="market">Market Type</Label>
              <Select 
                value={selectedMarket} 
                onValueChange={(value) => {
                  setSelectedMarket(value)
                  setSelectedPair(TRADING_PAIRS[value][0].symbol)
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

          <div className="pt-2">
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading ? "Connecting..." : "Connect EA"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

