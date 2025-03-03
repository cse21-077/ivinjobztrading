"use client";

import { Suspense } from "react";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
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
      console.log('Starting OAuth redirect handling...');
      console.log('Current URL:', window.location.href);
      console.log('Search params:', Object.fromEntries(searchParams.entries()));
      
      if (!user) {
        console.error('No user found, redirecting to login');
        toast.error("Please log in first");
        router.push("/login");
        return;
      }

      try {
        const url = window.location.href;
        console.log('Processing redirect URL:', url);
        
        // Check for error in OAuth response
        if (searchParams.get('error')) {
          console.error('OAuth error:', searchParams.get('error'));
          console.error('Error description:', searchParams.get('error_description'));
          throw new Error(searchParams.get('error_description') || 'OAuth error occurred');
        }
        
        const accounts = parseOAuthRedirect(url);
        console.log('Parsed accounts:', accounts);
        
        if (accounts.length === 0) {
          console.error('No accounts found in redirect URL');
          throw new Error("No accounts found in redirect URL");
        }

        console.log('Storing accounts in Firestore...');
        const result = await handleOAuthRedirect(user.uid, accounts);
        
        if (result.success) {
          console.log('Successfully stored Deriv accounts');
          toast.success("Successfully connected your Deriv account!");
          router.push("/dashboard");
        } else {
          console.error('Failed to store accounts:', result.error);
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