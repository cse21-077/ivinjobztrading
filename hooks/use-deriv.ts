import { useState, useEffect } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase'
import { doc, getDoc, DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface DerivAccountDetails {
  token: string
  accountId: string
  isActive: boolean
  type: 'financial' | 'synthetic' | 'standard'
  server?: string
  mt5Login?: string
  mt5Password?: string
}

interface EAConfig {
  server: string
  eaName: string
  pairs: string[]
  lotSize: number
  mt5Login?: string
  mt5Password?: string
}

interface DerivAccount {
  id: string
  token: string
  type: 'financial' | 'synthetic' | 'standard'
  server: string
  isActive: boolean
  eaConfig?: EAConfig
  isConnected?: boolean
}

interface DerivAccountData {
  accounts: DerivAccountDetails[]
  selectedAccountId?: string
  eaConfig?: EAConfig
}

export function useDerivAccount() {
  const [user] = useAuthState(auth)
  const [activeAccount, setActiveAccount] = useState<DerivAccount | null>(null)
  const [availableAccounts, setAvailableAccounts] = useState<DerivAccountDetails[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)

  const validateEAConfig = (data: DocumentData): EAConfig | undefined => {
    if (!data) return undefined

    // Check if all required fields exist and are of correct type
    const config: Partial<EAConfig> = {}

    if (typeof data.server === 'string') config.server = data.server
    if (typeof data.eaName === 'string') config.eaName = data.eaName
    if (Array.isArray(data.pairs)) config.pairs = data.pairs.filter((pair: any) => typeof pair === 'string')
    if (typeof data.lotSize === 'number') config.lotSize = data.lotSize
    if (typeof data.mt5Login === 'string') config.mt5Login = data.mt5Login
    if (typeof data.mt5Password === 'string') config.mt5Password = data.mt5Password

    // Only return if we have the minimum required fields
    if (config.server && config.eaName && config.pairs && config.lotSize) {
      return config as EAConfig
    }
    
    console.warn('Invalid EA configuration format:', data)
    return undefined
  }

  const getDerivAccounts = async (): Promise<DerivAccountData> => {
    try {
      const derivDoc = doc(db, 'derivAccounts', user?.uid || '')
      const derivSnapshot = await getDoc(derivDoc)
      
      if (!derivSnapshot.exists()) {
        throw new Error('No Deriv accounts found')
      }

      const data = derivSnapshot.data()
      
      if (!Array.isArray(data.accounts) || data.accounts.length === 0) {
        console.error('Invalid Deriv account structure:', data)
        throw new Error('No Deriv accounts available')
      }

      // Check for EA configuration
      const eaConfigDoc = doc(db, 'eaConfigs', user?.uid || '')
      const eaConfigSnapshot = await getDoc(eaConfigDoc)
      const eaConfig = eaConfigSnapshot.exists() 
        ? validateEAConfig(eaConfigSnapshot.data())
        : undefined

      return {
        accounts: data.accounts,
        selectedAccountId: data.selectedAccountId,
        eaConfig
      }
    } catch (err) {
      console.error('Error fetching Deriv accounts:', err)
      throw err
    }
  }

  const connectToAccount = async (accountId: string) => {
    try {
      const accountData = await getDerivAccounts()
      const account = accountData.accounts.find(acc => acc.accountId === accountId)
      
      if (!account) {
        throw new Error('Selected account not found')
      }

      const newSocket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=69299')
      setWs(newSocket)

      newSocket.onopen = () => {
        console.log("WebSocket connection opened")
        setIsConnected(true)
        setError(null)
        const token = account.token.replace(/^Bearer\s+/i, '')
        newSocket.send(JSON.stringify({ 
          authorize: token,
          req_id: 1
        }))
      }

      newSocket.onmessage = (msg) => {
        try {
          const response = JSON.parse(msg.data)
          console.log("Received message:", response.msg_type, response)

          if (response.error) {
            console.error("Deriv API error:", response.error)
            setError(response.error.message || 'Deriv API error occurred')
            
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

            setActiveAccount({
              id: account.accountId,
              token: account.token,
              type: account.type,
              server: account.server || status.mt5_login_list?.[0]?.server || 'DerivDemo',
              isActive: true,
              eaConfig: accountData.eaConfig,
              isConnected: true
            })
            
            setIsLoading(false)
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error)
          setError('Error processing server response')
        }
      }

      newSocket.onclose = (event) => {
        console.log("WebSocket connection closed", event.code, event.reason)
        setIsConnected(false)
        setActiveAccount(prev => prev ? { ...prev, isConnected: false } : null)
      }

      newSocket.onerror = (error) => {
        console.error("WebSocket error:", error)
        setError('Connection error occurred')
      }
    } catch (error: any) {
      console.error("Error connecting to account:", error)
      setError(error.message || 'Failed to connect to account')
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setIsLoading(false)
      return
    }

    const loadAccounts = async () => {
      try {
        const data = await getDerivAccounts()
        setAvailableAccounts(data.accounts)
        
        if (data.selectedAccountId) {
          setSelectedAccountId(data.selectedAccountId)
          await connectToAccount(data.selectedAccountId)
        }
        
        setIsLoading(false)
      } catch (err: any) {
        setError(err.message || 'Failed to load Deriv accounts')
        setIsLoading(false)
      }
    }

    loadAccounts()

    return () => {
      if (ws) {
        ws.close(1000, 'Component unmounted')
      }
    }
  }, [user])

  return {
    activeAccount,
    availableAccounts,
    selectedAccountId,
    isConnected,
    isLoading,
    error,
    connectToAccount
  }
}