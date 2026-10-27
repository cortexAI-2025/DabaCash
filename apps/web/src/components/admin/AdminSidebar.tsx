"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Store, ShoppingBag, AlertTriangle, BarChart3,
  LogOut, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearAuthTokens } from "@/lib/auth";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/admin", icon: LayoutDashboard, label: "Vue globale" },
  { href: "/admin/franchises", icon: Store, label: "Franchises" },
  { href: "/admin/orders", icon: ShoppingBag, label: "Commandes" },
  { href: "/admin/fraud", icon: AlertTriangle, label: "Fraude" },
  { href: "/admin/analytics", icon: BarChart3, label: "Analytics" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-dark-800 bg-dark-900 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-2 border-b border-dark-800 p-4 lg:p-6">
      <button
        aria-label="Déconnexion"
        onClick={() => { clearAuthTokens(); router.push("/login"); }}
        className="order-last ml-auto rounded-lg p-2 text-dark-400 hover:bg-dark-800 hover:text-red-400 lg:hidden"
      >
        <LogOut className="h-5 w-5" />
      </button>

        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500">
          <Zap className="h-5 w-5 text-dark-950" />
        </div>
        <div>
          <div className="text-sm font-black text-dark-50">Daba<span className="text-gold-400">Cash</span></div>
          <div className="text-xs text-dark-500">Admin Panel</div>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-1 lg:flex-col lg:gap-0 lg:space-y-1 lg:overflow-visible lg:p-4">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all lg:gap-3 lg:px-4 lg:py-3",
              pathname === href
                ? "bg-gold-500/10 text-gold-400"
                : "text-dark-400 hover:bg-dark-800 hover:text-dark-100"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="hidden border-t border-dark-800 p-4 lg:block">
        <button
          onClick={() => { clearAuthTokens(); router.push("/login"); }}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-dark-400 hover:bg-dark-800 hover:text-red-400 transition-all"
        >
          <LogOut className="h-5 w-5" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
