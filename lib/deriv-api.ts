import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

interface DerivSymbol {
  symbol: string;
  market: string;
  display_name: string;
  pip: number;
  pip_value: number;
  min_stake: number;
  max_stake: number;
}

interface DerivSymbols {
  forex: DerivSymbol[];
  synthetic_indices: DerivSymbol[];
  lastUpdated: Date;
}

const DERIV_API_URL = "https://api.deriv.com";

export async function fetchDerivSymbols(apiToken: string): Promise<DerivSymbols> {
  try {
    // First check if we have cached symbols in Firestore
    const symbolsRef = doc(db, "system", "derivSymbols");
    const symbolsDoc = await getDoc(symbolsRef);
    
    if (symbolsDoc.exists()) {
      const data = symbolsDoc.data() as DerivSymbols;
      const lastUpdated = new Date(data.lastUpdated);
      const now = new Date();
      const hoursDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
      
      // If cache is less than 24 hours old, use it
      if (hoursDiff < 24) {
        return data;
      }
    }

    // Fetch new symbols from Deriv API
    const response = await fetch(`${DERIV_API_URL}/v2/active_symbols`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        active_symbols: "brief",
        product_type: "basic"
      })
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Deriv symbols");
    }

    const data = await response.json();
    
    // Process and categorize symbols
    const symbols: DerivSymbols = {
      forex: [],
      synthetic_indices: [],
      lastUpdated: new Date()
    };

    data.active_symbols.forEach((symbol: any) => {
      const symbolData: DerivSymbol = {
        symbol: symbol.symbol,
        market: symbol.market,
        display_name: symbol.display_name,
        pip: symbol.pip,
        pip_value: symbol.pip_value,
        min_stake: symbol.min_stake,
        max_stake: symbol.max_stake
      };

      if (symbol.market === "forex") {
        symbols.forex.push(symbolData);
      } else if (symbol.market === "synthetic_indices") {
        symbols.synthetic_indices.push(symbolData);
      }
    });

    // Cache the symbols in Firestore
    await setDoc(symbolsRef, symbols);

    return symbols;
  } catch (error) {
    console.error("Error fetching Deriv symbols:", error);
    throw error;
  }
} 