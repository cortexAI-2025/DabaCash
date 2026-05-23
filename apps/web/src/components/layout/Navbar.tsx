"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, User, Bell, Menu, X, Zap } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/sell", label: "Vendre" },
  { href: "/franchises", label: "Franchises" },
];

export function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-dark-800 bg-dark-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500">
            <Zap className="h-5 w-5 text-dark-950" />
          </div>
          <span className="text-xl font-black tracking-tight text-dark-50">
            Daba<span className="text-gold-400">Cash</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(link.href)
                  ? "bg-gold-500/10 text-gold-400"
                  : "text-dark-300 hover:bg-dark-800 hover:text-dark-100"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link href="/sell" className="btn-primary hidden sm:inline-flex py-2 px-4 text-xs">
            Vendre maintenant
          </Link>
          <Link href="/login" className="btn-ghost p-2">
            <User className="h-5 w-5" />
          </Link>
          <button
            className="btn-ghost p-2 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-dark-800 bg-dark-950 px-4 pb-4 md:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block py-3 text-sm font-medium text-dark-300 hover:text-gold-400"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/sell" className="btn-primary mt-2 w-full" onClick={() => setMenuOpen(false)}>
            Vendre maintenant
          </Link>
        </div>
      )}
    </header>
  );
}
