"use client";

import { useQuery } from "@tanstack/react-query";
import { marketplaceApi } from "@/lib/api";
import { ProductCard } from "./ProductCard";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

export function FeaturedListings() {
  const { data, isLoading } = useQuery({
    queryKey: ["featured-listings"],
    queryFn: () => marketplaceApi.getFeatured().then((r) => r.data),
  });

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <h2 className="section-title mb-2">Sélection du moment</h2>
            <p className="text-dark-400">Les meilleures offres du réseau DabaCash</p>
          </div>
          <Link href="/marketplace" className="btn-ghost items-center gap-1 hidden sm:flex">
            Tout voir
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(data ?? []).map((listing: any) => (
              <ProductCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        <div className="mt-8 text-center sm:hidden">
          <Link href="/marketplace" className="btn-secondary">
            Voir tout le marketplace
          </Link>
        </div>
      </div>
    </section>
  );
}
