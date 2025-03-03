"use client";

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth, db } from '@/lib/firebase'
import { doc, setDoc } from 'firebase/firestore'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react"

export default function OAuthRedirect() {
  const router = useRouter()
  const [user, loading] = useAuthState(auth)
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Processing your Deriv account connection...')
  const [accounts, setAccounts] = useState<any[]>([])
  const [svgAccountFound, setSvgAccountFound] = useState(false)

  useEffect(() => {
    const handleRedirect = async () => {
      if (!user) {
        console.log('No authenticated user, redirecting to login...')
        router.push('/login')
        return
      }

      console.log('Starting OAuth redirect handling...')
      
      if (typeof window !== 'undefined') {
        const url = window.location.href
        console.log('Current URL:', url)
        
        const searchParams = new URLSearchParams(window.location.search)
        console.log('Search params:', Object.fromEntries(searchParams))
        
        const parsedAccounts: any[] = []
        let index = 1
        
        while (searchParams.has(`acct${index}`)) {
          const accountId = searchParams.get(`acct${index}`) || ""
          // Parse account type from account ID prefix
          const accountTypePrefix = accountId.substring(0, 2)
          const isVirtual = accountTypePrefix === "VR"
          const isSvg = accountTypePrefix === "CR"
          
          const accountInfo = {
            accountId: accountId,
            token: searchParams.get(`token${index}`),
            currency: searchParams.get(`cur${index}`),
            isVirtual: isVirtual,
            isSvg: isSvg
          }
          
          parsedAccounts.push(accountInfo)
          
          // Check if we found a SVG account (CR prefix)
          if (isSvg) {
            setSvgAccountFound(true)
          }
          
          index++
        }
        
        setAccounts(parsedAccounts)
        console.log('Parsed accounts:', parsedAccounts)
        
        if (parsedAccounts.length > 0) {
          console.log('Storing accounts in Firestore...')
          try {
            // Check if we have SVG accounts in the parsed list
            const hasSvgAccounts = parsedAccounts.some(acc => acc.isSvg)
            
            if (!hasSvgAccounts) {
              console.warn('No SVG accounts found in the Deriv OAuth response')
              setMessage('Warning: No SVG accounts detected. For optimal trading, please use a Deriv SVG account.')
            }
            
            // Find SVG accounts first (CR prefix)
            const svgAccounts = parsedAccounts.filter(acc => acc.isSvg)
            const demoAccounts = parsedAccounts.filter(acc => acc.isVirtual)
            const otherAccounts = parsedAccounts.filter(acc => !acc.isVirtual && !acc.isSvg)
            
            // Prioritize accounts in this order: SVG Real > Other Real > Demo
            const sortedAccounts = [...svgAccounts, ...otherAccounts, ...demoAccounts]
            
            await setDoc(doc(db, "derivAccounts", user.uid), {
              accounts: sortedAccounts,
              lastUpdated: new Date(),
              preferredAccountId: sortedAccounts.length > 0 ? sortedAccounts[0].accountId : null
            })
            
            console.log('Successfully stored Deriv accounts')
            setStatus('success')
            setMessage(`Successfully connected ${parsedAccounts.length} Deriv account${parsedAccounts.length !== 1 ? 's' : ''}`)
            
            // Redirect to dashboard after a short delay
            setTimeout(() => {
              router.push('/dashboard')
            }, 2000)
          } catch (error) {
            console.error('Error storing accounts:', error)
            setStatus('error')
            setMessage('Failed to save your Deriv account information. Please try again.')
            setTimeout(() => {
              router.push('/dashboard?error=storage')
            }, 3000)
          }
        } else {
          console.log('No accounts found in redirect URL')
          setStatus('error')
          setMessage('No Deriv accounts found in the response. Please try connecting again.')
          setTimeout(() => {
            router.push('/dashboard?error=no-accounts')
          }, 3000)
        }
      }
    }

    if (!loading) {
      handleRedirect()
    }
  }, [user, loading, router])

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="max-w-md w-full p-6 bg-gray-800 rounded-lg shadow-lg">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold text-white mb-4">
            {status === 'processing' ? 'Processing Deriv Connection' :
             status === 'success' ? 'Connection Successful' : 
             'Connection Error'}
          </h2>
          
          {status === 'processing' && (
            <div className="flex justify-center mb-4">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          )}
          
          {status === 'success' && (
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
          )}
          
          {status === 'error' && (
            <div className="flex justify-center mb-4">
              <AlertCircle className="h-10 w-10 text-red-500" />
            </div>
          )}
          
          <p className="text-gray-300 mb-2">{message}</p>
          
          {accounts.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Connected Accounts:</h3>
              <ul className="space-y-2">
                {accounts.map((acc, i) => (
                  <li key={i} className={`text-sm p-2 rounded ${acc.isSvg ? 'bg-green-900/20 border border-green-700' : acc.isVirtual ? 'bg-blue-900/20 border border-blue-700' : 'bg-gray-700'}`}>
                    {acc.accountId} ({acc.currency}) {acc.isVirtual ? '- Demo' : acc.isSvg ? '- SVG Real' : '- Real'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {!svgAccountFound && status !== 'error' && (
            <Alert className="mt-4 bg-amber-900/20 border-amber-700">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertTitle>Important</AlertTitle>
              <AlertDescription className="text-sm">
                No SVG account detected. For optimal trading with our EA, please use a Deriv SVG account.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  )
}