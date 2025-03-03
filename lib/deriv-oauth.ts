import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const DERIV_APP_ID = "69299";
const REDIRECT_URL = "https://thearmbyivinjobz.netlify.app/dashboard/redirect";

export const getDerivOAuthUrl = () => {
  return `https://oauth.deriv.com/oauth2/authorize?app_id=${DERIV_APP_ID}&l=EN&redirect_uri=${encodeURIComponent(REDIRECT_URL)}`;
};

export interface DerivAccount {
  accountId: string;
  token: string;
  currency: string;
}

export const parseOAuthRedirect = (url: string): DerivAccount[] => {
  const params = new URLSearchParams(url.split("?")[1]);
  const accounts: DerivAccount[] = [];
  
  let i = 1;
  while (params.has(`acct${i}`)) {
    accounts.push({
      accountId: params.get(`acct${i}`) || "",
      token: params.get(`token${i}`) || "",
      currency: params.get(`cur${i}`) || "",
    });
    i++;
  }

  return accounts;
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