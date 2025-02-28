"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useAuthState } from "react-firebase-hooks/auth"
import { doc, getDoc, writeBatch } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"

export default function AccountLinking() {
  const [user] = useAuthState(auth)
  const [broker, setBroker] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [server, setServer] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [leverage, setLeverage] = useState("")

  useEffect(() => {
    const fetchUserConfig = async () => {
      if (user) {
        const docRef = doc(db, "userConfigs", user.uid)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          setBroker(data.broker || "")
          setUsername(data.username || "")
          setPassword(data.password || "")
          setServer(data.server || "")
          setApiKey(data.apiKey || "")
          setLeverage(data.leverage || "")
        }
      }
    }
    fetchUserConfig()
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (user) {
      const batch = writeBatch(db)

      const userConfigRef = doc(db, "userConfigs", user.uid)
      batch.set(
        userConfigRef,
        {
          broker,
          username,
          password,
          server,
          apiKey,
          leverage,
        },
        { merge: true },
      )

      // You can add more batch operations here if needed

      await batch.commit()
      alert("Account linked successfully!")
    }
  }

  return (
    <Card className="bg-gray-800">
      <CardHeader>
        <CardTitle>Account Linking</CardTitle>
        <CardDescription>Connect your broker account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="broker">Broker</Label>
            <Select value={broker} onValueChange={setBroker}>
              <SelectTrigger id="broker">
                <SelectValue placeholder="Select broker" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mt4">MetaTrader 4</SelectItem>
                <SelectItem value="mt5">MetaTrader 5</SelectItem>
                <SelectItem value="ctrader">cTrader</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="server">Server</Label>
            <Input
              id="server"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="Enter broker's server"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key (Optional)</Label>
            <Input
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key if applicable"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="leverage">Leverage</Label>
            <Select value={leverage} onValueChange={setLeverage}>
              <SelectTrigger id="leverage">
                <SelectValue placeholder="Select leverage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1:50">1:50</SelectItem>
                <SelectItem value="1:100">1:100</SelectItem>
                <SelectItem value="1:200">1:200</SelectItem>
                <SelectItem value="1:500">1:500</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full">
            Connect Account
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

