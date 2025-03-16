"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

export default function TradingArea() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [armConnected, setArmConnected] = useState(true);
  const [mtConnected, setMtConnected] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check connection status immediately on mount
    const checkConnection = () => {
      const storedInstanceId = localStorage.getItem('instanceId');
      const storedUserId = localStorage.getItem('userId');
      
      if (!storedInstanceId || !storedUserId) {
        router.replace('/');
        return;
      }
      
      setIsLoaded(true);
      setArmConnected(true);
      setMtConnected(true);
    };

    checkConnection();

    // Set up interval to check connection status
    const intervalId = setInterval(checkConnection, 5000);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, [router]);

  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true);
      
      const instanceId = localStorage.getItem('instanceId');
      const userId = localStorage.getItem('userId');
      const tradingSymbol = localStorage.getItem('tradingSymbol');
      const timeframe = localStorage.getItem('timeframe');
      
      if (!instanceId || !userId || !tradingSymbol || !timeframe) {
        console.error('Missing required disconnect information');
        toast.error('Missing connection information');
        return;
      }
      
      const response = await fetch('/api/mt5/disconnect', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId: parseInt(instanceId),
          userId,
          symbol: tradingSymbol,
          timeframe
        })
      });
      
      const data = await response.json();

      if (response.ok && data.success) {
        setArmConnected(false);
        setMtConnected(false);
        
        // Clear all stored data
        localStorage.clear();
        
        toast.success("Successfully disconnected");
        
        setTimeout(() => {
          router.replace('/');
        }, 1500);
      } else {
        toast.error(data.message || 'Disconnect failed');
        console.error('Disconnect failed:', data.message);
      }
    } catch (error) {
      toast.error('Error disconnecting');
      console.error('Error disconnecting:', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0ca9eb] flex flex-col justify-between">
      {/* Top Header Section */}
      <div className="pt-8 px-4 text-center">
        <h1 className="text-4xl font-bold text-white mb-2">The Arm</h1>
        <p className="text-lg text-white/90">by Ivin Jobz</p>
      </div>

      {/* Centered Lottie Animation */}
      <div className="flex-1 flex items-center justify-center">
        {isLoaded && (
          <DotLottieReact
            src="https://lottie.host/f643596b-88f1-4821-8d8f-3cba0469224f/3Q9URB40wl.lottie"
            loop
            autoplay
            style={{ height: "300px", width: "300px" }}
          />
        )}
      </div>

      {/* Bottom Card Section */}
      <div className="pb-8 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md mx-auto">
          <h2 className="text-xl font-semibold text-center mb-4">Relax I&apos;m chopping📈</h2>

          <Button 
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            className="w-full bg-black hover:bg-black/90 text-white rounded-full mb-4 h-12"
          >
            {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
          </Button>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Arm server:</span>
              <Button
                size="sm"
                className={`h-8 ${
                  armConnected ? 'bg-emerald-500' : 'bg-red-500'
                } text-white rounded-md text-sm hover:opacity-90`}
              >
                {armConnected ? 'Connected' : 'Disconnected'}
              </Button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Metatrader:</span>
              <Button
                size="sm"
                className={`h-8 ${
                  mtConnected ? 'bg-emerald-500' : 'bg-red-500'
                } text-white rounded-md text-sm hover:opacity-90`}
              >
                {mtConnected ? 'Connected' : 'Disconnected'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}