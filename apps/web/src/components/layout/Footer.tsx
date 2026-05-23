import Link from "next/link";
import { Zap } from "lucide-react";

const links = {
  Marketplace: [
    { href: "/marketplace", label: "Tous les produits" },
    { href: "/marketplace?deviceType=PHONE", label: "Smartphones" },
    { href: "/marketplace?deviceType=LAPTOP", label: "Laptops" },
    { href: "/marketplace?deviceType=TV", label: "Télévisions" },
  ],
  Vendre: [
    { href: "/sell", label: "Vendre mon appareil" },
    { href: "/sell#estimator", label: "Estimateur de prix" },
    { href: "/franchises", label: "Trouver une franchise" },
  ],
  Légal: [
    { href: "/legal/cgu", label: "CGU" },
    { href: "/legal/privacy", label: "Confidentialité" },
    { href: "/legal/cookies", label: "Cookies" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-dark-800 bg-dark-950 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500">
                <Zap className="h-5 w-5 text-dark-950" />
              </div>
              <span className="text-xl font-black text-dark-50">
                Daba<span className="text-gold-400">Cash</span>
              </span>
            </div>
            <p className="text-sm text-dark-400 leading-relaxed">
              La marketplace de confiance pour l&apos;électronique reconditionné au Maroc.
            </p>
          </div>

          {/* Links */}
          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h4 className="mb-4 text-sm font-semibold text-dark-200">{title}</h4>
              <ul className="space-y-2">
                {items.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-dark-400 hover:text-gold-400 transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-dark-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-dark-500">© 2024 DabaCash. Tous droits réservés.</p>
          <p className="text-xs text-dark-600">Made with ❤️ in Morocco 🇲🇦</p>
        </div>
      </div>
    </footer>
  );
}
