"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Menu, User, X, Zap } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { usersApi, authApi } from "@/lib/api";
import { clearAuthTokens, getRefreshToken, getRoleRedirect } from "@/lib/auth";
import { useSession } from "@/hooks/useSession";

const navLinks = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/sell", label: "Vendre" },
  { href: "/franchises", label: "Franchises" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const session = useSession();

  // Unread badge: only for signed-in users, refreshed every minute.
  const { data: notif } = useQuery({
    queryKey: ["notifications-badge"],
    queryFn: () => usersApi.getNotifications({ limit: 1 }).then((r) => r.data),
    enabled: session.ready && session.loggedIn,
    refetchInterval: 60_000,
    retry: false,
  });
  const unread = notif?.unread ?? 0;

  const logout = async () => {
    const token = getRefreshToken();
    try { if (token) await authApi.logout(token); } catch { /* the local session is cleared either way */ }
    clearAuthTokens();
    qc.clear();
    setMenuOpen(false);
    router.push("/");
  };

  const links = session.loggedIn ? [...navLinks, { href: "/orders", label: "Mes commandes" }] : navLinks;
  const home = session.role ? getRoleRedirect(session.role) : "/marketplace";

  return (
    <header className="sticky top-0 z-50 border-b border-dark-800 bg-dark-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="DabaCash, accueil">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500">
            <Zap className="h-5 w-5 text-dark-950" aria-hidden />
          </div>
          <span className="text-xl font-black tracking-tight text-dark-50">Daba<span className="text-gold-400">Cash</span></span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname.startsWith(link.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(link.href) ? "bg-gold-500/10 text-gold-400" : "text-dark-300 hover:bg-dark-800 hover:text-dark-100"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Link href="/sell" className="btn-primary hidden px-4 py-2 text-xs sm:inline-flex">Vendre maintenant</Link>
          {session.ready && session.loggedIn ? (
            <>
              <Link href="/account#notifications" className="btn-ghost relative p-2" aria-label={unread ? `Notifications, ${unread} non lues` : "Notifications"}>
                <Bell className="h-5 w-5" aria-hidden />
                {unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
              </Link>
              {session.role && session.role !== "CUSTOMER" && (
                <Link href={home} className="btn-ghost hidden px-3 py-2 text-xs sm:inline-flex">{session.role === "ADMIN" ? "Administration" : "Mon espace"}</Link>
              )}
              <Link href="/account" className="btn-ghost p-2" aria-label="Mon compte"><User className="h-5 w-5" aria-hidden /></Link>
              <button className="btn-ghost hidden p-2 sm:inline-flex" aria-label="Se déconnecter" onClick={logout}><LogOut className="h-5 w-5" aria-hidden /></button>
            </>
          ) : (
            session.ready && <Link href="/login" className="btn-ghost px-3 py-2 text-sm">Connexion</Link>
          )}
          <button className="btn-ghost p-2 md:hidden" aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-dark-800 bg-dark-950 px-4 pb-4 md:hidden">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="block py-3 text-sm font-medium text-dark-300 hover:text-gold-400" onClick={() => setMenuOpen(false)}>{link.label}</Link>
          ))}
          {session.loggedIn && session.role && session.role !== "CUSTOMER" && (
            <Link href={home} className="block py-3 text-sm font-medium text-dark-300 hover:text-gold-400" onClick={() => setMenuOpen(false)}>{session.role === "ADMIN" ? "Administration" : "Mon espace"}</Link>
          )}
          {session.loggedIn && <button className="block w-full py-3 text-left text-sm font-medium text-red-400" onClick={logout}>Se déconnecter</button>}
          <Link href="/sell" className="btn-primary mt-2 w-full" onClick={() => setMenuOpen(false)}>Vendre maintenant</Link>
        </div>
      )}
    </header>
  );
}
