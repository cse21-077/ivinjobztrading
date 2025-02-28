import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign Up - IvinJobz RoboTrader",
  description: "Create your account for IvinJobz RoboTrader",
}

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

