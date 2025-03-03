"use client"

import UnifiedTradingDashboard from "@/components/unified-trading-dashboard"

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <UnifiedTradingDashboard />
      </div>
    </div>
  )
}

