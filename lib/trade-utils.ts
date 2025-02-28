import { writeBatch, doc } from "firebase/firestore"
import { db } from "./firebase"

interface Trade {
  id: string
  // Add other trade properties here
}

export async function batchTradeUpdates(userId: string, trades: Trade[]) {
  const batch = writeBatch(db)

  trades.forEach((trade) => {
    const tradeRef = doc(db, "users", userId, "trades", trade.id)
    batch.set(tradeRef, trade, { merge: true })
  })

  await batch.commit()
  console.log("Trades updated in batch!")
}

