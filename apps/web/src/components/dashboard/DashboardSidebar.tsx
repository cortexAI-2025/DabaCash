"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ShoppingCart, TrendingUp,
  Boxes, Settings, LogOut, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearAuthTokens } from "@/lib/auth";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Vue d'ensemble" },
  { href: "/dashboard/inventory", icon: Boxes, label: "Inventaire" },
  { href: "/dashboard/buybacks", icon: Package, label: "Rachats" },
  { href: "/dashboard/orders", icon: ShoppingCart, label: "Commandes" },
  { href: "/dashboard/analytics", icon: TrendingUp, label: "Statistiques" },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearAuthTokens();
    router.push("/login");
  };

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-dark-800 bg-dark-900 sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2 p-6 border-b border-dark-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500">
          <Zap className="h-5 w-5 text-dark-950" />
        </div>
        <div>
          <div className="text-sm font-black text-dark-50">Daba<span className="text-gold-400">Cash</span></div>
          <div className="text-xs text-dark-500">Franchise Dashboard</div>
        </div>
      </div>

      {/* Nav */}
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

      {/* Bottom */}
      <div className="border-t border-dark-800 p-4 space-y-1">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-dark-400 hover:bg-dark-800 hover:text-red-400 transition-all"
        >
          <LogOut className="h-5 w-5" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
