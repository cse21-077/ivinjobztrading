import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth"
import { initializeFirestore, persistentLocalCache, enableMultiTabIndexedDbPersistence } from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = initializeFirestore(app, { localCache: persistentLocalCache() })

// Enable persistent login
setPersistence(auth, browserLocalPersistence)

// Configure Firestore persistence
try {
  enableMultiTabIndexedDbPersistence(db);
} catch (err) {
  console.warn('Firebase persistence error:', err);
  // Continue without persistence
}

export { app, auth, db }

