"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAuthState } from "react-firebase-hooks/auth"
import { doc, getDoc, writeBatch } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { fetchDerivSymbols } from "@/lib/deriv-api"
import { toast } from "sonner"

interface DerivSymbol {
  symbol: string;
  market: string;
  display_name: string;
  pip: number;
  pip_value: number;
  min_stake: number;
  max_stake: number;
}

export default function EAConfiguration() {
  const [user] = useAuthState(auth)
  const [isEAEnabled, setIsEAEnabled] = useState(false)
  const [selectedMarket, setSelectedMarket] = useState<string>("")
  const [selectedSymbol, setSelectedSymbol] = useState<string>("")
  const [lotSize, setLotSize] = useState("0.01")
  const [symbols, setSymbols] = useState<{ forex: DerivSymbol[], synthetic_indices: DerivSymbol[] }>({ forex: [], synthetic_indices: [] })
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchConfig = async () => {
      if (user) {
        try {
          // Fetch EA config
          const eaConfigRef = doc(db, "eaConfigs", user.uid)
          const eaConfigSnap = await getDoc(eaConfigRef)
          if (eaConfigSnap.exists()) {
            const data = eaConfigSnap.data()
            setIsEAEnabled(data.isEAEnabled || false)
            setSelectedMarket(data.market || "")
            setSelectedSymbol(data.symbol || "")
            setLotSize(data.lotSize || "0.01")
          }

          // Fetch Deriv symbols
          const symbolsRef = doc(db, "system", "derivSymbols")
          const symbolsSnap = await getDoc(symbolsRef)
          if (symbolsSnap.exists()) {
            const data = symbolsSnap.data()
            setSymbols({
              forex: data.forex || [],
              synthetic_indices: data.synthetic_indices || []
            })
          }
        } catch (error) {
          console.error("Error fetching config:", error)
          toast.error("Failed to load configuration")
        }
      }
    }
    fetchConfig()
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsLoading(true)
    try {
      const batch = writeBatch(db)
      const eaConfigRef = doc(db, "eaConfigs", user.uid)
      
      batch.set(
        eaConfigRef,
        {
          isEAEnabled,
          market: selectedMarket,
          symbol: selectedSymbol,
          lotSize: parseFloat(lotSize),
          lastUpdated: new Date()
        },
        { merge: true }
      )

      await batch.commit()
      toast.success("EA Configuration saved successfully!")
    } catch (error) {
      console.error("Error saving config:", error)
      toast.error("Failed to save configuration")
    } finally {
      setIsLoading(false)
    }
  }

  const getAvailableSymbols = () => {
    if (!selectedMarket) return []
    return symbols[selectedMarket as keyof typeof symbols] || []
  }

  return (
    <Card className="bg-gray-800 text-gray-200">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="text-lg sm:text-xl">EA Configuration</CardTitle>
        <CardDescription>Configure your Expert Advisor settings</CardDescription>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="ea-toggle">Enable EA</Label>
            <Switch id="ea-toggle" checked={isEAEnabled} onCheckedChange={setIsEAEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="market">Market</Label>
            <Select value={selectedMarket} onValueChange={setSelectedMarket}>
              <SelectTrigger id="market" className="w-full">
                <SelectValue placeholder="Select market" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forex">Forex</SelectItem>
                <SelectItem value="synthetic_indices">Synthetic Indices</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbol">Trading Pair</Label>
            <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
              <SelectTrigger id="symbol" className="w-full">
                <SelectValue placeholder="Select trading pair" />
              </SelectTrigger>
              <SelectContent>
                {getAvailableSymbols().map((symbol) => (
                  <SelectItem key={symbol.symbol} value={symbol.symbol}>
                    {symbol.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lot-size">Lot Size</Label>
            <Input
              id="lot-size"
              type="number"
              min="0.01"
              step="0.01"
              value={lotSize}
              onChange={(e) => setLotSize(e.target.value)}
              placeholder="Enter lot size"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Configuration"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

