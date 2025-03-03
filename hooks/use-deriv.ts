import { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase'
import { doc, getDoc, DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface EAConfig {
  server: string
  eaName: string
  pairs: string[]
  lotSize: number
}

interface DerivAccount {
  id: string
  token: string
  type: 'financial' | 'synthetic' | 'standard'
  server: string
  isActive: boolean
  eaConfig?: EAConfig
}

interface DerivAccountData {
  token: string
  eaConfig?: EAConfig
}

export function useDerivAccount() {
  const [user] = useAuthState(auth)
  const [activeAccount, setActiveAccount] = useState<DerivAccount | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)

  const validateEAConfig = (data: DocumentData): EAConfig | undefined => {
    if (!data) return undefined

    // Check if all required fields exist and are of correct type
    if (
      typeof data.server === 'string' &&
      typeof data.eaName === 'string' &&
      Array.isArray(data.pairs) &&
      typeof data.lotSize === 'number'
    ) {
      return {
        server: data.server,
        eaName: data.eaName,
        pairs: data.pairs.filter((pair: any) => typeof pair === 'string'),
        lotSize: data.lotSize
      }
    }
    
    console.warn('Invalid EA configuration format:', data)
    return undefined
  }

  useEffect(() => {
    if (!user) {
      setIsLoading(false)
      return
    }

    let retryCount = 0
    let retryTimeout: NodeJS.Timeout
    const maxRetries = 3
    let isUnmounted = false

    const getDerivAccount = async (): Promise<DerivAccountData> => {
      try {
        const derivDoc = doc(db, 'derivAccounts', user.uid)
        const derivSnapshot = await getDoc(derivDoc)
        
        if (!derivSnapshot.exists()) {
          throw new Error('No Deriv account found')
        }

        const data = derivSnapshot.data()
        
        // Check for EA configuration
        const eaConfigDoc = doc(db, 'eaConfigs', user.uid)
        const eaConfigSnapshot = await getDoc(eaConfigDoc)
        const eaConfig = eaConfigSnapshot.exists() 
          ? validateEAConfig(eaConfigSnapshot.data())
          : undefined

        return {
          token: data.token,
          eaConfig
        }
      } catch (err) {
        console.error('Error fetching Deriv account:', err)
        throw err
      }
    }

    const connect = async () => {
      try {
        if (isUnmounted) return

        let accountData
        try {
          accountData = await getDerivAccount()
        } catch (err) {
          setError('No Deriv account linked')
          setIsLoading(false)
          return
        }

        const newSocket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=69299')
        setWs(newSocket)

        newSocket.onopen = () => {
          if (isUnmounted) return
          console.log("WebSocket connection opened")
          setIsConnected(true)
          setError(null)
          // Format token properly by removing any "Bearer " prefix if present
          const token = accountData.token.replace('Bearer ', '')
          newSocket.send(JSON.stringify({ 
            authorize: token,
            req_id: 1 // Add request ID for better tracking
          }))
        }

        newSocket.onmessage = (msg) => {
          if (isUnmounted) return
          try {
            const response = JSON.parse(msg.data)
            console.log("Received message:", response.msg_type, response)

            if (response.error) {
              console.error("Deriv API error:", response.error)
              setError(response.error.message)
              
              if (response.error.code === 'InvalidToken') {
                setActiveAccount(null)
                setIsConnected(false)
              }
              return
            }

            if (response.msg_type === 'authorize' && response.authorize) {
              console.log("Authorization successful")
              newSocket.send(JSON.stringify({ 
                get_account_status: 1,
                req_id: 2
              }))
            }

            if (response.msg_type === 'get_account_status' && response.get_account_status) {
              const status = response.get_account_status
              console.log("Account status:", status)

              let accountType: 'financial' | 'synthetic' | 'standard' = 'standard'
              
              if (status.is_virtual) {
                accountType = 'synthetic'
              } else if (status.currency_config?.is_crypto) {
                accountType = 'financial'
              }

              setActiveAccount({
                id: status.loginid || user.uid,
                token: accountData.token,
                type: accountType,
                server: status.mt5_login_list?.[0]?.server || 'DerivDemo',
                isActive: true,
                eaConfig: accountData.eaConfig
              })
              
              setIsLoading(false)
            }
          } catch (error) {
            console.error("Error processing WebSocket message:", error)
            setError('Error processing server response')
          }
        }

        newSocket.onclose = (event) => {
          if (isUnmounted) return
          console.log("WebSocket connection closed", event.code, event.reason)
          setIsConnected(false)

          if (!isUnmounted && event.code !== 1000 && retryCount < maxRetries) {
            retryCount++
            console.log(`Retrying connection (${retryCount}/${maxRetries})...`)
            retryTimeout = setTimeout(connect, 2000 * retryCount)
          } else {
            setIsLoading(false)
          }
        }

        newSocket.onerror = (error) => {
          if (isUnmounted) return
          console.error("WebSocket error:", error)
          setError('Connection error occurred')
        }
      } catch (error) {
        if (!isUnmounted) {
          console.error("Error creating WebSocket:", error)
          setError('Failed to establish connection')
          setIsLoading(false)
        }
      }
    }

    connect()

    return () => {
      isUnmounted = true
      if (ws) {
        ws.close(1000, 'Component unmounted')
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
    }
  }, [user])

  return { activeAccount, isConnected, isLoading, error }
}