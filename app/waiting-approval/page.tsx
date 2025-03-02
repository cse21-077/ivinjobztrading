import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function WaitingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <Card className="bg-gray-900 border-gray-800 shadow-xl w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl sm:text-2xl font-bold text-center">Account Pending Approval</CardTitle>
          <CardDescription className="text-center text-gray-400">
            Your account is waiting for admin approval 
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center px-4 sm:px-6">
          <p className="text-gray-300 mb-4">
            Thank you for signing up! Your account is currently pending approval from our administrators , after approval your account will be given an instance in our trading server, this is approval system done to avoid huge server costs. We'll notify
            you via email once your account has been approved.
          </p>
          <p className="text-gray-300">If you have any questions, please contact our support team.</p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link href="/login">
            <Button variant="outline" className="bg-gray-800 border-gray-700 hover:bg-gray-700 text-white">
              Back to Login
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

