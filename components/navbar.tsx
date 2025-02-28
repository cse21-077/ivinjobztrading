"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768)
    }

    // Initial check
    checkScreenSize()

    // Add event listener
    window.addEventListener("resize", checkScreenSize)

    // Cleanup
    return () => window.removeEventListener("resize", checkScreenSize)
  }, [])

  // Close menu when switching to desktop view
  useEffect(() => {
    if (!isMobile) {
      setIsMenuOpen(false)
    }
  }, [isMobile])

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-white">
              IvinJobz
            </Link>
          </div>

          {/* Desktop navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <Link href="/" className="text-gray-300 hover:text-white transition-colors">
              Home
            </Link>
            <Link href="/about" className="text-gray-300 hover:text-white transition-colors">
              About
            </Link>
            <Link href="/contact" className="text-gray-300 hover:text-white transition-colors">
              Contact
            </Link>
            <Link href="/signup" passHref>
              <Button variant="outline" className="ml-4">
                Sign Up
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-300 hover:text-white focus:outline-none"
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 space-y-2">
            <Link
              href="/"
              className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-md"
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/about"
              className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-md"
              onClick={() => setIsMenuOpen(false)}
            >
              About
            </Link>
            <Link
              href="/contact"
              className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-md"
              onClick={() => setIsMenuOpen(false)}
            >
              Contact
            </Link>
            <Link
              href="/signup"
              className="block px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-md"
              onClick={() => setIsMenuOpen(false)}
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}

