import LoginForm from "@/components/login-form"
import Navbar from "@/components/navbar"

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navbar />
      <main className="container mx-auto px-4 py-8 flex justify-center items-center min-h-[calc(100vh-64px)]">
        <div className="w-full max-w-md px-4">
          <LoginForm />
        </div>
      </main>
    </div>
  )
}

