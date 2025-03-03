'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, AlertCircle, ArrowRight, ExternalLink, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { DerivAccount, parseOAuthResponse, handleOAuthRedirect } from '@/lib/deriv-oauth'

// Separate component that uses search params
function RedirectHandler() {
  const [user] = useAuthState(auth)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<DerivAccount[]>([])
  const [svgAccountFound, setSvgAccountFound] = useState(false)
  const [processingComplete, setProcessingComplete] = useState(false)
  
  // Processing steps for better visualization
  const [processingStep, setProcessingStep] = useState<
    'connecting' | 'fetching_accounts' | 'validating_accounts' | 'storing_accounts' | 'complete' | 'error'
  >('connecting')

  useEffect(() => {
    const processOAuthRedirect = async () => {
      try {
        setProcessingStep('connecting')
        
        if (!user) {
          console.log('No authenticated user found');
          setError('You must be logged in to connect your Deriv account');
          setProcessingStep('error')
          setLoading(false)
          return;
        }
        
        const token = searchParams?.get('token1');
        
        if (!token) {
          console.error('No token found in URL');
          setError('Authentication token missing. Please try connecting your account again.');
          setProcessingStep('error')
          setLoading(false)
          return;
        }
        
        // Parse OAuth response
        setProcessingStep('fetching_accounts')
        const oauthAccounts = await parseOAuthResponse(token);
        
        // Validate the accounts
        setProcessingStep('validating_accounts')
        if (!oauthAccounts || oauthAccounts.length === 0) {
          console.error('No accounts found');
          setError('No trading accounts found. Please create a Deriv trading account first.');
          setProcessingStep('error')
          setLoading(false)
          return;
        }
        
        console.log('Deriv accounts found:', oauthAccounts.length);
        
        // Check for SVG accounts
        const hasSvgAccount = oauthAccounts.some(account => 
          account.landingCompany.toLowerCase() === 'svg' || 
          account.landingCompany.toLowerCase().includes('svg')
        );
        
        setSvgAccountFound(hasSvgAccount);
        setAccounts(oauthAccounts);
        
        if (!hasSvgAccount) {
          console.warn('No SVG account found. Some trading features might be limited.');
          toast.warning('No SVG account detected. Some trading features may be limited.');
        }
        
        // Store the accounts
        setProcessingStep('storing_accounts')
        await handleOAuthRedirect(user.uid, oauthAccounts);
        
        setProcessingStep('complete')
        setProcessingComplete(true)
        setLoading(false)
        
        // Redirect after short delay
        setTimeout(() => {
          router.push('/dashboard')
        }, 3000)
      } catch (error) {
        console.error('Error processing OAuth response:', error);
        setError('Error connecting to Deriv. Please try again later.');
        setProcessingStep('error')
        setLoading(false)
      }
    }

    if (user) {
      processOAuthRedirect()
    } else {
      // Wait for user authentication
      const checkUser = setTimeout(() => {
        if (!user) {
          setError('Authentication timeout. Please log in again.');
          setLoading(false)
          setProcessingStep('error')
        }
      }, 10000)

      return () => clearTimeout(checkUser)
    }
  }, [user, searchParams, router])

  const getProgressPercentage = () => {
    switch (processingStep) {
      case 'connecting': return 20;
      case 'fetching_accounts': return 40;
      case 'validating_accounts': return 60;
      case 'storing_accounts': return 80;
      case 'complete': return 100;
      case 'error': return 100;
      default: return 0;
    }
  }

  const getProgressMessage = () => {
    switch (processingStep) {
      case 'connecting': return 'Connecting to Deriv...';
      case 'fetching_accounts': return 'Fetching your trading accounts...';
      case 'validating_accounts': return 'Validating account types...';
      case 'storing_accounts': return 'Storing your account information...';
      case 'complete': return 'Account connected successfully!';
      case 'error': return 'Connection error!';
      default: return 'Processing...';
    }
  }

  const getAccountTypeLabel = (account: DerivAccount) => {
    const isSvg = account.landingCompany.toLowerCase() === 'svg' || 
                  account.landingCompany.toLowerCase().includes('svg');
    const isDemo = account.isVirtual;
    
    if (isSvg && !isDemo) return 'SVG Real';
    if (isSvg && isDemo) return 'SVG Demo';
    if (!isSvg && !isDemo) return `${account.landingCompany} Real`;
    if (!isSvg && isDemo) return `${account.landingCompany} Demo`;
    return account.landingCompany;
  }
  
  const getAccountTypeColor = (account: DerivAccount) => {
    const isSvg = account.landingCompany.toLowerCase() === 'svg' || 
                  account.landingCompany.toLowerCase().includes('svg');
    const isDemo = account.isVirtual;
    
    if (isSvg && !isDemo) return 'bg-green-600';
    if (isSvg && isDemo) return 'bg-blue-600';
    if (!isSvg && !isDemo) return 'bg-yellow-600';
    if (!isSvg && isDemo) return 'bg-gray-600';
    return 'bg-gray-700';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-black p-4">
      <Card className="w-full max-w-2xl bg-slate-950 border-slate-800 text-white shadow-xl p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">Deriv Account Connection</h1>
          <div className="h-2 w-full bg-slate-800 rounded-full mb-4">
            <div 
              className={`h-full rounded-full transition-all duration-700 ease-in-out ${
                processingStep === 'error' ? 'bg-red-600' : 'bg-blue-600'
              }`} 
              style={{ width: `${getProgressPercentage()}%` }}
            ></div>
          </div>
          <p className="text-gray-400">{getProgressMessage()}</p>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
            <p className="text-gray-400 text-center max-w-md">
              Processing your Deriv account information. This will only take a moment...
            </p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-6">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold text-red-400 mb-2">Connection Error</h2>
            <p className="text-gray-400 text-center max-w-md mb-6">{error}</p>
            <div className="flex gap-4">
              <Button 
                variant="outline" 
                className="border-slate-700 hover:bg-slate-800"
                onClick={() => router.push('/dashboard')}
              >
                Back to Dashboard
              </Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => window.location.href = '/dashboard?reconnect=true'}
              >
                Try Again
              </Button>
            </div>
          </div>
        )}

        {processingComplete && (
          <div className="flex flex-col items-center justify-center py-6">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold text-green-400 mb-2">Successfully Connected!</h2>
            <p className="text-gray-400 text-center max-w-md mb-6">
              Your Deriv account has been connected successfully. 
              {svgAccountFound 
                ? ' SVG account detected for optimal trading experience!' 
                : ' Note: No SVG account detected. Some features may be limited.'}
            </p>
            
            {accounts.length > 0 && (
              <div className="w-full mb-6">
                <h3 className="text-lg font-medium text-gray-300 mb-3">Your Trading Accounts</h3>
                <div className="bg-slate-900 rounded-lg border border-slate-800 divide-y divide-slate-800">
                  {accounts.map((account, index) => (
                    <div key={index} className="flex items-center justify-between p-3">
                      <div className="flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-3 ${getAccountTypeColor(account)}`}></div>
                        <div>
                          <p className="font-medium text-gray-300">{account.accountId}</p>
                          <p className="text-sm text-gray-500">
                            {getAccountTypeLabel(account)} • {account.currency}
                          </p>
                        </div>
                      </div>
                      {account.landingCompany.toLowerCase().includes('svg') && !account.isVirtual && (
                        <div className="flex items-center text-green-500 text-sm">
                          <Shield className="h-4 w-4 mr-1" />
                          <span>Preferred</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <p className="text-gray-500 text-sm text-center mb-6">
              Redirecting you to the dashboard in a few seconds...
            </p>
            
            <Button 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => router.push('/dashboard')}
            >
              Go to Dashboard Now <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="mt-8 pt-4 border-t border-slate-800 text-center">
          <p className="text-sm text-slate-500">
            Having trouble? <a href="https://help.deriv.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 inline-flex items-center">Visit Deriv Help Center <ExternalLink className="ml-1 h-3 w-3" /></a>
          </p>
        </div>
      </Card>
    </div>
  );
}

// Main component with Suspense
export default function OAuthRedirectPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-900 to-black p-4">
        <Card className="w-full max-w-2xl bg-slate-950 border-slate-800 text-white shadow-xl p-8">
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
            <p className="text-gray-400 text-center max-w-md">
              Loading Deriv connection details...
            </p>
          </div>
        </Card>
      </div>
    }>
      <RedirectHandler />
    </Suspense>
  );
}