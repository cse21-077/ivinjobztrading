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
  
  // Use SVG servers by default, with scope=admin to get full access
  return `https://oauth.deriv.com/oauth2/authorize?app_id=${DERIV_APP_ID}&l=EN&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=admin`;
};

export interface DerivAccount {
  accountId: string;
  token: string;
  currency: string;
  accountType?: string;
  isVirtual?: boolean;
  landingCompany?: string;
  server?: string;
}

export const parseOAuthRedirect = (url: string): DerivAccount[] => {
  const params = new URLSearchParams(url.split("?")[1]);
  const accounts: DerivAccount[] = [];
  
  let i = 1;
  while (params.has(`acct${i}`)) {
    const accountId = params.get(`acct${i}`) || "";
    
    // Parse account type from account ID prefix
    // VR: Virtual (demo)
    // CR: Real account from SVG
    // MF: Real account from other jurisdictions
    const accountTypePrefix = accountId.substring(0, 2);
    const isVirtual = accountTypePrefix === "VR";
    const landingCompany = accountTypePrefix === "CR" ? "SVG" : 
                          accountTypePrefix === "MF" ? "Financial" : 
                          "Unknown";
    
    // Determine the appropriate server for this account type
    const server = isVirtual 
      ? DERIV_SERVERS.SVG.demo 
      : landingCompany === "SVG" 
        ? DERIV_SERVERS.SVG.real
        : DERIV_SERVERS.DEFAULT.real;
    
    accounts.push({
      accountId: accountId,
      token: params.get(`token${i}`) || "",
      currency: params.get(`cur${i}`) || "",
      accountType: accountTypePrefix,
      isVirtual: isVirtual,
      landingCompany: landingCompany,
      server: server
    });
    i++;
  }

  return accounts;
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
        accountType: account.accountType,
        currency: account.currency,
        isVirtual: account.isVirtual,
        landingCompany: account.landingCompany,
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
      server: accounts[0].server
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
    console.log('Processing OAuth accounts:', accounts.length);
    
    // Enhanced logging (without exposing sensitive data)
    accounts.forEach((account, i) => {
      console.log(`Account ${i+1}: ID ${account.accountId}, Currency: ${account.currency}, Type: ${account.isVirtual ? 'Virtual' : 'Real'}, Server: ${account.server}`);
    });
    
    // Find SVG accounts first (CR prefix)
    const svgAccounts = accounts.filter(acc => acc.accountId.startsWith('CR'));
    const demoAccounts = accounts.filter(acc => acc.isVirtual);
    const otherAccounts = accounts.filter(acc => !acc.isVirtual && !acc.accountId.startsWith('CR'));
    
    // Prioritize accounts in this order: SVG Real > Other Real > Demo
    const sortedAccounts = [...svgAccounts, ...otherAccounts, ...demoAccounts];
    
    // Store the accounts to Firestore
    const accountsRef = doc(db, "derivAccounts", userId);
    await setDoc(accountsRef, {
      accounts: sortedAccounts,
      lastUpdated: new Date(),
      preferredAccountId: sortedAccounts.length > 0 ? sortedAccounts[0].accountId : null
    });
    
    // Store the accounts in the new format
    await storeDerivAccounts(userId, sortedAccounts);
    
    return { success: true };
  } catch (error) {
    console.error("Error storing Deriv accounts:", error);
    return { success: false, error: "Failed to store Deriv accounts" };
  }
};

export const parseOAuthResponse = async (token: string): Promise<DerivAccount[]> => {
  try {
    console.log('Parsing OAuth response with token');
    
    // Create a WebSocket connection to get account info
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3');
      
      // Set a timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout while retrieving account information'));
      }, 15000);
      
      ws.onopen = () => {
        console.log('WebSocket connection opened for OAuth parsing');
        // Send authorize request with the token
        ws.send(JSON.stringify({
          authorize: token
        }));
      };
      
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data.toString());
          
          if (data.error) {
            clearTimeout(timeoutId);
            ws.close();
            reject(new Error(`API error: ${data.error.message}`));
            return;
          }
          
          if (data.authorize) {
            console.log('Authorization successful, retrieving account info');
            
            // Get account details from the authorize response
            const accounts: DerivAccount[] = [];
            
            if (data.authorize.account_list && Array.isArray(data.authorize.account_list)) {
              data.authorize.account_list.forEach((account: any) => {
                accounts.push({
                  accountId: account.loginid,
                  accountType: account.account_type,
                  currency: account.currency,
                  isVirtual: account.is_virtual === 1,
                  landingCompany: account.landing_company_name,
                  token: token,
                  server: getServerFromAccountType(account.landing_company_name)
                });
              });
            }
            
            clearTimeout(timeoutId);
            ws.close();
            resolve(accounts);
          }
        } catch (error) {
          clearTimeout(timeoutId);
          ws.close();
          reject(error);
        }
      };
      
      ws.onerror = (error) => {
        clearTimeout(timeoutId);
        console.error('WebSocket error during OAuth parsing:', error);
        reject(new Error('WebSocket connection error'));
      };
      
      ws.onclose = () => {
        clearTimeout(timeoutId);
        console.log('WebSocket connection closed for OAuth parsing');
      };
    });
  } catch (error) {
    console.error('Error parsing OAuth response:', error);
    throw error;
  }
};

// Helper function to determine server from account type
const getServerFromAccountType = (landingCompany: string): string => {
  if (landingCompany.toLowerCase() === 'svg' || landingCompany.toLowerCase().includes('svg')) {
    return 'svg';
  }
  return 'deriv';
};