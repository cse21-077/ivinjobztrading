"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { handleOAuthRedirect, parseOAuthRedirect } from "@/lib/deriv-oauth";
import { toast } from "sonner";

export default function OAuthRedirect() {
  const router = useRouter();
  const [user] = useAuthState(auth);
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleRedirect = async () => {
      if (!user) {
        toast.error("Please log in first");
        router.push("/login");
        return;
      }

      try {
        const url = window.location.href;
        const accounts = parseOAuthRedirect(url);
        
        if (accounts.length === 0) {
          throw new Error("No accounts found in redirect URL");
        }

        const result = await handleOAuthRedirect(user.uid, accounts);
        
        if (result.success) {
          toast.success("Successfully connected your Deriv account!");
          router.push("/dashboard");
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error("Error handling OAuth redirect:", error);
        toast.error("Failed to connect your Deriv account");
        router.push("/dashboard");
      }
    };

    handleRedirect();
  }, [user, router, searchParams]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-white text-center">
        <h1 className="text-2xl mb-4">Connecting your Deriv account...</h1>
        <p className="text-gray-400">Please wait while we process your connection.</p>
      </div>
    </div>
  );
} 