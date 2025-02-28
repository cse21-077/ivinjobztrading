import AccountLinking from "@/components/account-linking";
import DashboardHeader from "@/components/dashboard-header";
import EAConfiguration from "@/components/ea-configuration";
import RouteGuard from "@/components/route-guard";


export default function DashboardPage() {
  return (
    <RouteGuard>
      <div className="min-h-screen bg-gray-900 text-white">
        <DashboardHeader />
        <main className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <AccountLinking />
            <EAConfiguration />
          </div>
        </main>
      </div>
    </RouteGuard>
  )
}

