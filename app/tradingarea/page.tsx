"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useRouter } from "next/navigation";

export default function TradingArea() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [armConnected, setArmConnected] = useState(true);
  const [mtConnected, setMtConnected] = useState(true);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Get connection status from localStorage
    const storedInstanceId = localStorage.getItem('instanceId');
    const storedUserId = localStorage.getItem('userId');
    
    // If no stored connection details, redirect to login
    if (!storedInstanceId || !storedUserId) {
      router.push('/');
      return;
    }
    
    setIsLoaded(true);
    setArmConnected(true);
    setMtConnected(true);
  }, [router]);

  const handleDisconnect = async () => {
    try {
      setIsDisconnecting(true);
      
      const instanceId = localStorage.getItem('instanceId');
      const userId = localStorage.getItem('userId');
      
      if (!instanceId || !userId) {
        console.error('Missing instanceId or userId for disconnect');
        return;
      }
      
      const response = await fetch('/api/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId: parseInt(instanceId),
          userId: userId
        })
      });
      
      if (response.ok) {
        setArmConnected(false);
        setMtConnected(false);
        
        // Clear stored connection info
        localStorage.removeItem('instanceId');
        localStorage.removeItem('userId');
        
        // Redirect to home page after short delay
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        const errorData = await response.json();
        console.error('Disconnect failed:', errorData.message);
      }
    } catch (error) {
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
          <h2 className="text-xl font-semibold text-center mb-4">Relax I&apos;m chopping</h2>

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