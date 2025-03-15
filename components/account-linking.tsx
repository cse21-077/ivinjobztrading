"use client";

import { useState, useEffect } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getMetaTraderServers, type MTServer } from "@/utils/server-utils";
import { Search, ServerIcon, CheckCircle2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";

// Import pairs data
import derivPairs from "@/hooks/derivpairs.json";
import weltrade from "@/hooks/weltrade.json";
import exness from "@/hooks/exness.json";
import { Dialog, DialogContent, DialogHeader } from "./ui/dialog";
import { DialogTitle } from "@radix-ui/react-dialog";

interface TradingPair {
  code: string;
  name: string;
}

const TRADING_PAIRS = {
  deriv: [
    ...derivPairs.syntheticIndices.volatility.symbols,
    ...derivPairs.syntheticIndices.crashBoom.symbols,
    ...derivPairs.syntheticIndices.jump.symbols,
    ...derivPairs.syntheticIndices.step.symbols,
    ...derivPairs.syntheticIndices.rangeBreak.symbols,
    ...derivPairs.syntheticIndices.dailyReset.symbols,
  ].map((symbol) => ({
    code: symbol.symbolCode,
    name: symbol.fullName,
  })),
  weltrade: weltrade.weltrade.instruments.map((instrument) => ({
    code: instrument.symbol,
    name: instrument.description,
  })),
  exness: [
    ...exness.instruments.forex.map((pair) => ({
      code: pair,
      name: pair.replace("/", " vs "),
    })),
    ...exness.instruments.exotics.map((pair) => ({
      code: pair,
      name: pair.replace("/", " vs "),
    })),
    ...exness.instruments.metals.map((pair) => ({
      code: pair,
      name: pair.replace("/", " vs "),
    })),
  ],
};

const TIMEFRAMES = [
  { value: "M1", label: "1 Minute" },
  { value: "M5", label: "5 Minutes" },
  { value: "M15", label: "15 Minutes" },
  { value: "H1", label: "1 Hour" },
  { value: "H4", label: "4 Hours" },
  { value: "D1", label: "Daily" },
];

export default function AccountLinking() {
  const router = useRouter();
  const [user, loading] = useAuthState(auth);
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [servers, setServers] = useState<MTServer[]>([]);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [timeframe, setTimeframe] = useState("M5");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [instanceId, setInstanceId] = useState<number | null>(null);
  const [serverSearch, setServerSearch] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [filteredPairs, setFilteredPairs] = useState<TradingPair[]>([]);

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const mtServers = await getMetaTraderServers();
        setServers(mtServers);
      } catch (error) {
        toast.error("Failed to load MetaTrader servers");
      }
    };
    fetchServers();
  }, []);

  useEffect(() => {
    const loadConnectionStatus = async () => {
      if (!user) {
        setLoadingConnection(false);
        return;
      }
      try {
        setLoadingConnection(true);
        const docRef = doc(db, "mtConnections", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsConnected(data.isConnected || false);
          setInstanceId(data.instanceId || null);
          setSelectedPair(data.tradingPair || null);
          setTimeframe(data.timeframe || "M5");
          setAccountId(data.accountId || "");
          setServer(data.server || "");
        }
      } catch (error) {
        toast.error("Failed to load connection status");
      } finally {
        setLoadingConnection(false);
      }
    };
    if (!loading) loadConnectionStatus();
  }, [user, loading]);

  useEffect(() => {
    if (server) {
      if (server.includes("Deriv")) {
        setFilteredPairs(TRADING_PAIRS.deriv);
      } else if (server.includes("Weltrade")) {
        setFilteredPairs(TRADING_PAIRS.weltrade);
      } else if (server.includes("Exness")) {
        setFilteredPairs(TRADING_PAIRS.exness);
      }
    }
  }, [server]);

  const handleConnect = async () => {
    toast("Attempting to connect to MetaTrader...");
    if (!accountId || !password || !server || !selectedPair) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const response = await fetch("/api/mt5/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          password,
          server,
          userId: user?.uid,
          symbol: selectedPair.name,
          timeframe,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setIsConnected(true);
        setInstanceId(data.instanceId);
        if (user) {
          await setDoc(
            doc(db, "mtConnections", user.uid),
            {
              isConnected: true,
              instanceId: data.instanceId,
              accountId,
              server,
              tradingPair: selectedPair,
              timeframe,
              lastConnected: new Date().toISOString(),
            },
            { merge: true }
          );
        }
        toast.success("Successfully connected to MetaTrader");
        router.push("/tradingarea");
      } else {
        if (response.status === 400) {
          setConnectionError("Missing required fields. Please fill in all fields.");
        } else if (response.status === 401) {
          setConnectionError("Login verification failed. Please check your credentials.");
        } else {
          setConnectionError("Connection failed. Please try again.");
        }
      }
    } catch (error) {
      setConnectionError("Internal server error. Please try again later.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/mt5/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, userId: user?.uid }),
      });
      setIsConnected(false);
      setInstanceId(null);
      setPassword("");
      setSelectedPair(null);
      if (user) {
        await setDoc(
          doc(db, "mtConnections", user.uid),
          {
            isConnected: false,
            instanceId: null,
            lastDisconnected: new Date().toISOString()
          },
          { merge: true }
        );
      }
      toast.success("Disconnected successfully");
    } catch (error) {
      toast.error("Error disconnecting");
    }
  };

  const filteredServers = servers.filter((s) =>
    s.name.toLowerCase().includes(serverSearch.toLowerCase()) ||
    s.company.toLowerCase().includes(serverSearch.toLowerCase())
  );

  if (loading || loadingConnection) {
    return (
      <Card className="w-full max-w-md mx-auto bg-gray-900 border-gray-800">
        <CardHeader>
          <Skeleton className="h-8 w-3/4 mx-auto bg-gray-800" />
          <Skeleton className="h-4 w-1/2 mx-auto mt-2 bg-gray-800" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-gray-800" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto bg-gray-900 text-white border-gray-800">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-blue-400">The Arm</CardTitle>
        <p className="text-gray-400 mt-2">Connect your MetaTrader account</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-300">Account ID</Label>
            <Input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="Enter account ID"
              disabled={isConnected}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={isConnected}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Server</Label>
            <Select value={server} onValueChange={setServer} disabled={isConnected}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Select server" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <div className="flex items-center px-3 pb-2">
                  <Search className="w-4 h-4 mr-2 text-gray-400" />
                  <Input
                    placeholder="Search servers..."
                    value={serverSearch}
                    onChange={(e) => setServerSearch(e.target.value)}
                    className="h-8 bg-gray-800 border-gray-700 text-white"
                  />
                </div>
                <ScrollArea className="h-[300px]">
                  {filteredServers.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={s.id}
                      className="hover:bg-gray-800 text-white"
                    >
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <ServerIcon className="w-4 h-4 text-gray-400" />
                          <span>{s.name}</span>
                        </div>
                        <span className="text-xs text-gray-400 ml-6">{s.company}</span>
                      </div>
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Trading Pair</Label>
            <Select
              value={selectedPair?.code || ""}
              onValueChange={(value) => {
                const pair = filteredPairs.find(p => p.code === value);
                setSelectedPair(pair || null);
              }}
              disabled={!server || isConnected}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Select pair">
                  {selectedPair ? selectedPair.name : "Select a pair"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                <ScrollArea className="h-[300px]">
                  {filteredPairs.map((pair) => (
                    <SelectItem
                      key={pair.code}
                      value={pair.code}
                      className="hover:bg-gray-800 text-white"
                    >
                      <div className="flex flex-col">
                        <span>{pair.name}</span>
                        <span className="text-xs text-gray-400">{pair.code}</span>
                      </div>
                    </SelectItem>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Timeframe</Label>
            <Select
              value={timeframe}
              onValueChange={setTimeframe}
              disabled={isConnected}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Select timeframe" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                {TIMEFRAMES.map((tf) => (
                  <SelectItem key={tf.value} value={tf.value} className="text-white">
                    {tf.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isConnected ? (
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700"
              onClick={handleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          ) : (
            <Button
              className="w-full bg-red-600 hover:bg-red-700"
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          )}

          {isConnected && (
            <div className="p-3 bg-green-900/50 text-green-300 rounded-md border border-green-800">
              <div className="flex items-start">
                <CheckCircle2 className="h-5 w-5 mr-2 mt-0.5" />
                <div>
                  <h4 className="font-medium">Connected</h4>
                  <p className="text-sm mt-1">
                    Trading {selectedPair?.name} on {TIMEFRAMES.find(tf => tf.value === timeframe)?.label}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={!!connectionError} onOpenChange={() => setConnectionError(null)}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-red-400">Connection Error</DialogTitle>
          </DialogHeader>
          <div className="p-3 bg-red-900/50 text-red-300 rounded-md border border-red-800">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
              <div>
                <p className="text-sm">{connectionError}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
