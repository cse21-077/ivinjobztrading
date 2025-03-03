"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { handleOAuthRedirect, parseOAuthRedirect } from "@/lib/deriv-oauth";
import { toast } from "sonner";

function LoadingComponent() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-white text-center">
        <h1 className="text-2xl mb-4">Connecting your Deriv account...</h1>
        <p className="text-gray-400">Please wait while we process your connection.</p>
      </div>
    </div>
  );
}

function OAuthRedirectContent() {
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
          // Update Firestore with connection status and default settings
          await setDoc(doc(db, "derivConfigs", user.uid), {
            isConnected: true,
            lastConnected: new Date(),
            server: "svg-real", // Default to SVG Real server
            accountId: accounts[0].accountId,
            selectedSymbols: [], // Initialize empty symbols array
            markets: ["forex", "synthetic_indices"], // Default markets
            leverage: "1:500" // Default leverage
          }, { merge: true });

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

  return <LoadingComponent />;
}

export default function OAuthRedirect() {
  return (
    <Suspense fallback={<LoadingComponent />}>
      <OAuthRedirectContent />
    </Suspense>
  );
} 