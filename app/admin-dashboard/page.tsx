import AdminDashboard from "@/components/admin-dashboard"
import RouteGuard from "@/components/route-guard"

export default function AdminDashboardPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 md:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 md:mb-8">Admin Dashboard</h1>
        <AdminDashboard />
      </div>
    </RouteGuard>
  )
}

