"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { marketplaceApi } from "@/lib/api";
import { ProductCard } from "./ProductCard";
import { Search, SlidersHorizontal, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { DEVICE_TYPE_ICONS } from "@/lib/utils";

const CONDITIONS = [
  { value: "", label: "Tous les états" },
  { value: "A", label: "Excellent" },
  { value: "B", label: "Bon état" },
  { value: "C", label: "Correct" },
  { value: "D", label: "Mauvais état" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Plus récents" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "popular", label: "Populaires" },
];

const DEVICE_TYPES = [
  { value: "", label: "Tous", icon: "🛍️" },
  { value: "PHONE", label: "Smartphones", icon: "📱" },
  { value: "LAPTOP", label: "Laptops", icon: "💻" },
  { value: "TV", label: "Télévisions", icon: "📺" },
  { value: "TABLET", label: "Tablettes", icon: "📋" },
  { value: "ACCESSORY", label: "Accessoires", icon: "🎧" },
];

export function MarketplaceView() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [condition, setCondition] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["listings", debouncedSearch, deviceType, condition, sortBy, page],
    queryFn: () =>
      marketplaceApi
        .getListings({ search: debouncedSearch, deviceType, condition, sortBy, page, limit: 20 })
        .then((r) => r.data),
    keepPreviousData: true,
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    clearTimeout((window as any).__searchTimer);
    (window as any).__searchTimer = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 400);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-dark-50 mb-2">Marketplace</h1>
        <p className="text-dark-400">
          {data?.pagination?.total ?? "..."} appareils reconditionnés disponibles
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-400" />
          <input
            type="text"
            placeholder="Rechercher iPhone 14, Galaxy S23, MacBook…"
            className="input pl-11"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {/* Device type pills */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DEVICE_TYPES.map(({ value, label, icon }) => (
            <button
              key={value}
              onClick={() => { setDeviceType(value); setPage(1); }}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-all
                ${deviceType === value
                  ? "border-gold-500 bg-gold-500/10 text-gold-400"
                  : "border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-600"}`}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Condition + sort */}
        <div className="flex flex-wrap gap-3">
          <select
            className="input max-w-[180px]"
            value={condition}
            onChange={(e) => { setCondition(e.target.value); setPage(1); }}
          >
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            className="input max-w-[200px]"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
        </div>
      ) : data?.items?.length === 0 ? (
        <div className="py-32 text-center text-dark-400">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-lg font-medium">Aucun résultat trouvé</p>
          <p className="text-sm mt-2">Essayez de modifier vos filtres</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data?.items?.map((listing: any) => (
            <ProductCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-4">
          <button
            className="btn-secondary py-2 px-4"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </button>
          <span className="text-sm text-dark-400">
            Page {page} / {data.pagination.totalPages}
          </span>
          <button
            className="btn-secondary py-2 px-4"
            disabled={!data.pagination.hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
