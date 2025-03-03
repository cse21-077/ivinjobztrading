"use client";

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth, db } from '@/lib/firebase'
import { doc, setDoc } from 'firebase/firestore'

export default function OAuthRedirect() {
  const router = useRouter()
  const [user, loading] = useAuthState(auth)

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
        
        const accounts = []
        let index = 1
        
        while (searchParams.has(`acct${index}`)) {
          accounts.push({
            accountId: searchParams.get(`acct${index}`),
            token: searchParams.get(`token${index}`),
            currency: searchParams.get(`cur${index}`)
          })
          index++
        }
        
        console.log('Parsed accounts:', accounts)
        
        if (accounts.length > 0) {
          console.log('Storing accounts in Firestore...')
          try {
            await setDoc(doc(db, "derivAccounts", user.uid), {
              accounts: accounts,
              lastUpdated: new Date()
            })
            console.log('Successfully stored Deriv accounts')
            router.push('/dashboard')
          } catch (error) {
            console.error('Error storing accounts:', error)
            router.push('/dashboard?error=storage')
          }
        } else {
          console.log('No accounts found in redirect URL')
          router.push('/dashboard?error=no-accounts')
        }
      }
    }

    if (!loading) {
      handleRedirect()
    }
  }, [user, loading, router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4">Processing Deriv OAuth...</h2>
        <p>Please wait while we connect your account.</p>
      </div>
    </div>
  )
} 