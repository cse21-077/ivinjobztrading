"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/router"
import { useAuthState } from "react-firebase-hooks/auth"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"

interface RouteGuardProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export default function RouteGuard({ children, allowedRoles = ["client", "admin"] }: RouteGuardProps) {
<<<<<<< HEAD
  const { push } = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [user, loading, error] = useAuthState(auth)
=======
  const router = useRouter()
  const pathname = usePathname()
  const [user, loading] = useAuthState(auth)
>>>>>>> parent of abe4317 (Error fix)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const checkAuthorization = async () => {
      if (!loading) {
        if (!user) {
          setAuthorized(false)
          router.push("/login")
        } else {
          const userRef = doc(db, "users", user.uid)
          const userSnap = await getDoc(userRef)

          if (userSnap.exists()) {
            const userData = userSnap.data()
            if (userData.approved && allowedRoles.includes(userData.role)) {
              setAuthorized(true)
            } else if (!userData.approved) {
              setAuthorized(false)
              router.push("/waiting-approval")
            } else {
              setAuthorized(false)
              router.push("/unauthorized")
            }
          } else {
            setAuthorized(false)
            router.push("/login")
          }
        }
      }
    }

    checkAuthorization()
  }, [user, loading, router, allowedRoles])

  if (loading || !authorized) {
    return <div>Loading...</div> // You can replace this with a proper loading component
  }

  return <>{children}</>
}

