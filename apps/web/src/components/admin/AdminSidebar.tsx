"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Store, ShoppingBag, AlertTriangle,
  BarChart3, Settings, LogOut, Zap, Users
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
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-dark-800 bg-dark-900 sticky top-0">
      <div className="flex items-center gap-2 p-6 border-b border-dark-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500">
          <Zap className="h-5 w-5 text-dark-950" />
        </div>
        <div>
          <div className="text-sm font-black text-dark-50">Daba<span className="text-gold-400">Cash</span></div>
          <div className="text-xs text-dark-500">Admin Panel</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
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

      <div className="border-t border-dark-800 p-4">
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
