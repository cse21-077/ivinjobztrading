import { doc, setDoc } from "firebase/firestore";
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
    
    // Save the accounts to Firestore
    const accountsRef = doc(db, "derivAccounts", userId);
    await setDoc(accountsRef, {
      accounts: sortedAccounts,
      lastUpdated: new Date(),
      preferredAccountId: sortedAccounts.length > 0 ? sortedAccounts[0].accountId : null
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error storing Deriv accounts:", error);
    return { success: false, error: "Failed to store Deriv accounts" };
  }
};