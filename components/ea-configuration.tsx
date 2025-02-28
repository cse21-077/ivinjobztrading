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

export default function EAConfiguration() {
  const [user] = useAuthState(auth)
  const [isEAEnabled, setIsEAEnabled] = useState(false)
  const [tradingPairs, setTradingPairs] = useState<string[]>([])
  const [lotSize, setLotSize] = useState("0.01")

  useEffect(() => {
    const fetchEAConfig = async () => {
      if (user) {
        const docRef = doc(db, "eaConfigs", user.uid)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          setIsEAEnabled(data.isEAEnabled || false)
          setTradingPairs(data.tradingPairs || [])
          setLotSize(data.lotSize || "0.01")
        }
      }
    }
    fetchEAConfig()
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (user) {
      const batch = writeBatch(db)

      const eaConfigRef = doc(db, "eaConfigs", user.uid)
      batch.set(
        eaConfigRef,
        {
          isEAEnabled,
          tradingPairs,
          lotSize,
        },
        { merge: true },
      )

      // You can add more batch operations here if needed

      await batch.commit()
      alert("EA Configuration saved successfully!")
    }
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
            <Label htmlFor="trading-pairs">Trading Pairs</Label>
            <Select value={tradingPairs.join(",")} onValueChange={(value) => setTradingPairs(value.split(","))}>
              <SelectTrigger id="trading-pairs" className="w-full">
                <SelectValue placeholder="Select trading pairs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EURUSD">EUR/USD</SelectItem>
                <SelectItem value="GBPUSD">GBP/USD</SelectItem>
                <SelectItem value="USDJPY">USD/JPY</SelectItem>
                <SelectItem value="AUDUSD">AUD/USD</SelectItem>
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
          <Button type="submit" className="w-full">
            Save Configuration
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

