import { redirect } from "next/navigation"
import RouteGuard from "@/components/route-guard"

export default function Home() {
  return <RouteGuard>{redirect("/dashboard")}</RouteGuard>
}

