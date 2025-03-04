import { doc, setDoc, getDoc, getDocs, query, where, collection, addDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

// Use a valid Deriv app ID
const DERIV_APP_ID = "69299";

const REDIRECT_URLS = {
  development: "http://localhost:3000/dashboard/redirect",
  production: "https://thearmbyivinjobz.netlify.app/dashboard/redirect"
};

// Supported Deriv servers with their descriptions
const DERIV_SERVERS = {
  "SVG": {
    demo: "green.binaryws.com",
    real: "ws.binaryws.com"
  },
  "DEFAULT": {
    demo: "ws.derivws.com",
    real: "ws.derivws.com"
  }
};

const CACHE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// Type for cached token
interface CachedToken {
  token: string;
  timestamp: number;
  server: string;
}

// In-memory token cache to reduce unnecessary redirects
const tokenCache: Record<string, CachedToken> = {};

export const getDerivOAuthUrl = () => {
  const isDevelopment = process.env.NODE_ENV === "development";
  const redirectUrl = isDevelopment ? REDIRECT_URLS.development : REDIRECT_URLS.production;
  
  return `https://oauth.deriv.com/oauth2/authorize?app_id=${DERIV_APP_ID}&l=EN&redirect_uri=${encodeURIComponent(redirectUrl)}`;
};

export interface DerivAccount {
  accountId: string;
  token: string;
  currency: string;
  type: 'financial' | 'synthetic' | 'standard';
  server?: string;
}

export const parseOAuthResponse = async (token: string): Promise<DerivAccount[]> => {
  try {
    // Create WebSocket connection to get account details
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=69299');
      
      ws.onopen = () => {
        console.log("WebSocket connection opened");
        ws.send(JSON.stringify({ 
          authorize: token,
          req_id: 1
        }));
      };

      ws.onmessage = (msg) => {
        try {
          const response = JSON.parse(msg.data);
          console.log("Received message:", response.msg_type, response);

          if (response.error) {
            console.error("Deriv API error:", response.error);
            reject(new Error(response.error.message || 'Deriv API error occurred'));
            return;
          }

          if (response.msg_type === 'authorize' && response.authorize) {
            const accounts = response.authorize.account_list.map((acc: any) => ({
              accountId: acc.account_id,
              token: acc.token,
              currency: acc.currency || 'USD',
              type: acc.account_type || 'standard',
              server: acc.server || 'DerivDemo'
            }));

            ws.close();
            resolve(accounts);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
          reject(new Error('Error processing server response'));
        }
      };

      ws.onclose = (event) => {
        console.log("WebSocket connection closed", event.code, event.reason);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        reject(new Error('Connection error occurred'));
      };
    });
  } catch (error) {
    console.error("Error parsing OAuth response:", error);
    throw error;
  }
};

export const storeDerivAccounts = async (uid: string, accounts: DerivAccount[]) => {
  try {
    console.log(`Storing ${accounts.length} Deriv accounts for user ${uid}`);
    
    // Check if accounts already exist for this user
    const existingAccountsQuery = query(
      collection(db, "derivAccounts", uid)
    );
    
    const existingAccountsSnapshot = await getDocs(existingAccountsQuery);
    
    // Delete existing accounts if they exist
    const deletePromises = existingAccountsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // Store the new accounts
    const storePromises = accounts.map(account => {
      // Store the account in Firestore
      return addDoc(collection(db, "derivAccounts", uid), {
        accountId: account.accountId,
        accountType: account.type,
        currency: account.currency,
        isVirtual: false,
        landingCompany: 'DerivDemo',
        token: account.token,
        lastUpdated: new Date().toISOString(),
        server: account.server
      });
    });
    
    await Promise.all(storePromises);
    
    // Cache the token for this user
    tokenCache[uid] = {
      token: accounts[0].token,
      timestamp: Date.now(),
      server: accounts[0].server || 'DerivDemo'
    };
    
    console.log('Deriv accounts stored successfully');
    return true;
  } catch (error) {
    console.error('Error storing Deriv accounts:', error);
    return false;
  }
};

export const getDerivApiToken = async (uid: string): Promise<string|null> => {
  try {
    // Check cache first
    if (tokenCache[uid] && Date.now() - tokenCache[uid].timestamp < CACHE_EXPIRY_MS) {
      console.log('Using cached Deriv API token');
      return tokenCache[uid].token;
    }
    
    // Get accounts from Firestore
    const accountsQuery = query(
      collection(db, "derivAccounts", uid)
    );
    
    const accountsSnapshot = await getDocs(accountsQuery);
    
    if (accountsSnapshot.empty) {
      console.log('No Deriv accounts found for user');
      return null;
    }
    
    // Prioritize SVG accounts
    const accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // First look for SVG accounts
    const svgAccount = accounts.find(account => account.landingCompany === "SVG");
    
    if (svgAccount?.token) {
      // Cache the token
      tokenCache[uid] = {
        token: svgAccount.token,
        timestamp: Date.now(),
        server: 'svg'
      };
      return svgAccount.token;
    }
    
    // If no SVG account, use any account
    const anyAccount = accounts[0];
    
    if (anyAccount?.token) {
      // Cache the token
      tokenCache[uid] = {
        token: anyAccount.token,
        timestamp: Date.now(),
        server: anyAccount.landingCompany || 'deriv'
      };
      return anyAccount.token;
    }
    
    console.log('No Deriv API token found');
    return null;
  } catch (error) {
    console.error('Error getting Deriv API token:', error);
    return null;
  }
};

export const validateAndRefreshToken = async (uid: string, token: string): Promise<boolean> => {
  try {
    const isValid = await checkTokenValidity(token);
    
    if (!isValid) {
      console.log('Token invalid, attempting to refresh...');
      // Clear the token from cache
      delete tokenCache[uid];
      
      // Here you'd implement a token refresh mechanism if available
      // For now, we'll just return false to indicate a new OAuth flow is needed
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error validating token:', error);
    return false;
  }
};

const checkTokenValidity = async (token: string): Promise<boolean> => {
  try {
    // Create a WebSocket connection to test the token
    return new Promise((resolve) => {
      const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3');
      
      const timeoutId = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);
      
      ws.onopen = () => {
        // Send authorize request to test token
        ws.send(JSON.stringify({
          authorize: token
        }));
      };
      
      ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data.toString());
        
        if (data.error) {
          clearTimeout(timeoutId);
          ws.close();
          resolve(false);
        } else if (data.authorize) {
          clearTimeout(timeoutId);
          ws.close();
          resolve(true);
        }
      };
      
      ws.onerror = () => {
        clearTimeout(timeoutId);
        resolve(false);
      };
    });
  } catch (error) {
    console.error('Error checking token validity:', error);
    return false;
  }
};

export const handleOAuthRedirect = async (userId: string, accounts: DerivAccount[]) => {
  try {
    const accountsRef = doc(db, "derivAccounts", userId);
    await setDoc(accountsRef, {
      accounts,
      lastUpdated: new Date(),
    });
    return { success: true };
  } catch (error) {
    console.error("Error storing Deriv accounts:", error);
    return { success: false, error: "Failed to store Deriv accounts" };
  }
};