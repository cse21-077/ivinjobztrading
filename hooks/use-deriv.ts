import { useState } from 'react'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase'

interface DerivAccountDetails {
  accountId: string
  token: string
  type: 'financial' | 'synthetic' | 'standard'
  server: string
  mt5Login?: string
  mt5Password?: string
}

export function useDerivAccount() {
  const [user] = useAuthState(auth)
  const [activeAccount, setActiveAccount] = useState<DerivAccountDetails | null>(null)
  const [availableAccounts, setAvailableAccounts] = useState<DerivAccountDetails[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)

  const loadAccounts = async (token: string) => {
    try {
      setIsLoading(true)
      setError(null)

      // Connect to Deriv API to get account details
      const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=69299')
      setWs(ws)
      
      ws.onopen = () => {
        console.log("WebSocket connection opened")
        ws.send(JSON.stringify({ 
          authorize: token,
          req_id: 1
        }))
      }

      ws.onmessage = (msg) => {
        try {
          const response = JSON.parse(msg.data)
          console.log("Received message:", response.msg_type, response)

          if (response.error) {
            console.error("Deriv API error:", response.error)
            setError(response.error.message || 'Deriv API error occurred')
            setIsLoading(false)
            return
          }

          if (response.msg_type === 'authorize' && response.authorize) {
            // Get account status to get MT5 credentials
            ws.send(JSON.stringify({ 
              get_account_status: 1,
              req_id: 2
            }))
          }

          if (response.msg_type === 'get_account_status' && response.get_account_status) {
            const status = response.get_account_status
            const mt5Login = status.mt5_login_list?.[0]?.login
            const mt5Password = status.mt5_login_list?.[0]?.password
            const server = status.mt5_login_list?.[0]?.server || 'DerivDemo'

            const accounts = response.authorize.account_list.map((acc: any) => ({
              accountId: acc.account_id,
              token: acc.token,
              type: acc.account_type as 'financial' | 'synthetic' | 'standard',
              server,
              mt5Login,
              mt5Password
            }))

            setAvailableAccounts(accounts)
            setIsLoading(false)
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error)
          setError('Error processing server response')
          setIsLoading(false)
        }
      }

      ws.onclose = (event) => {
        console.log("WebSocket connection closed", event.code, event.reason)
        setIsLoading(false)
      }

      ws.onerror = (error) => {
        console.error("WebSocket error:", error)
        setError('Connection error occurred')
        setIsLoading(false)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load Deriv accounts')
      setIsLoading(false)
    }
  }

  const connectToAccount = async (accountId: string) => {
    try {
      setIsLoading(true)
      setError(null)

      // Find the account in available accounts
      const account = availableAccounts.find(acc => acc.accountId === accountId)
      
      if (!account) {
        throw new Error('Selected account not found')
      }

      // Create new WebSocket connection
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
              accountId: account.accountId,
              token: account.token,
              type: account.type,
              server: account.server,
              mt5Login: account.mt5Login,
              mt5Password: account.mt5Password
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

  return {
    activeAccount,
    availableAccounts,
    selectedAccountId,
    isConnected,
    isLoading,
    error,
    connectToAccount,
    loadAccounts
  }
}