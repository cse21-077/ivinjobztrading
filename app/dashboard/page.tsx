import AccountLinking from "@/components/account-linking"
import DashboardHeader from "@/components/dashboard-header"
import EAConfiguration from "@/components/ea-configuration"
import RouteGuard from "@/components/route-guard"

export default function DashboardPage() {
  return (
    <RouteGuard>
      <div className="min-h-screen bg-gray-900 text-white">
        <DashboardHeader />
        <main className="p-4 sm:p-6 md:p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
            <AccountLinking />
            <EAConfiguration />
          </div>
        </main>
      </div>
    </RouteGuard>
  )
}

