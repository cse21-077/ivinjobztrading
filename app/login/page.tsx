import LoginForm from "@/components/login-form"

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 sm:p-8 md:p-16 lg:p-24 bg-gray-950 text-gray-100">
      <LoginForm />
    </main>
  )
}

