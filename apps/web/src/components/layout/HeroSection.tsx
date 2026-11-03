"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { marketplaceApi } from "@/lib/api";
import { ArrowRight, Shield, Truck, Zap, TrendingUp } from "lucide-react";


const features = [
  { icon: Zap, text: "Estimation en 30 secondes" },
  { icon: Shield, text: "Garantie selon l'annonce" },
  { icon: Truck, text: "Retrait ou livraison" },
  { icon: TrendingUp, text: "Prix affichés en dirhams" },
];

export function HeroSection() {
  // Real numbers from the API; nothing is shown until they load (no invented marketing figures).
  const { data } = useQuery({ queryKey: ["marketplace-stats"], queryFn: () => marketplaceApi.getStats().then((r) => r.data), staleTime: 5 * 60_000, retry: 1 });
  const stats = data
    ? [
        { label: "Annonces en vente", value: String(data.listings) },
        { label: "Franchises actives", value: String(data.franchises) },
        { label: "Villes couvertes", value: String(data.cities) },
        { label: "Appareils vendus", value: String(data.devicesSold) },
      ]
    : [];
  return (
    <section className="relative overflow-hidden bg-hero-pattern">
      {/* Glow effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-gold-500/5 blur-3xl" />
        <div className="absolute top-20 right-10 h-64 w-64 rounded-full bg-gold-500/3 blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:py-32">
        <div className="text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-2 text-sm text-gold-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-gold-400" />
            La marketplace N°1 de l&apos;électronique reconditionné au Maroc
          </div>

          <h1 className="mb-6 text-4xl font-black tracking-tight text-dark-50 sm:text-6xl lg:text-7xl">
            Vendez ou achetez{" "}
            <span className="gradient-text">intelligemment</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg text-dark-400">
            DabaCash connecte les vendeurs aux franchises locales pour des transactions
            rapides, sécurisées et au meilleur prix. Estimation IA instantanée.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/sell" className="btn-primary text-base px-8 py-4">
              Vendre mon appareil
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/marketplace" className="btn-secondary text-base px-8 py-4">
              Explorer le marketplace
            </Link>
          </div>

          {/* Feature pills */}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 rounded-full border border-dark-700 bg-dark-800/50 px-4 py-2 text-sm text-dark-300">
                <Icon className="h-4 w-4 text-gold-400" />
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {stats.map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-3xl font-black text-gold-400">{value}</div>
              <div className="mt-1 text-sm text-dark-400">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
