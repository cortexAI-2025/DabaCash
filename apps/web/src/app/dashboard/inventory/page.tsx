"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { formatPrice, CONDITION_LABELS } from "@/lib/utils";
import { Loader2, Boxes, AlertTriangle } from "lucide-react";

export default function InventoryPage() {
  const { data: inventory, isLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: () => inventoryApi.get().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery({
    queryKey: ["inventory-summary"],
    queryFn: () => inventoryApi.getSummary().then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-dark-50">Inventaire</h1>
          <p className="text-dark-400 mt-1">Stock en temps réel (sync 30s)</p>
        </div>
        <a href="/dashboard/products/new" className="btn-primary py-2 px-4 text-sm">
          + Ajouter un produit
        </a>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card text-center">
          <div className="text-2xl font-black text-dark-50">{summary?.total ?? 0}</div>
          <div className="text-sm text-dark-400 mt-1">Produits total</div>
        </div>
        <div className="card text-center border-yellow-500/20">
          <div className="text-2xl font-black text-yellow-400">{summary?.lowStock ?? 0}</div>
          <div className="text-sm text-dark-400 mt-1">Stock faible</div>
        </div>
        <div className="card text-center border-red-500/20">
          <div className="text-2xl font-black text-red-400">{summary?.outOfStock ?? 0}</div>
          <div className="text-sm text-dark-400 mt-1">Rupture de stock</div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-800">
              <tr>
                {["Produit", "État", "Stock", "Réservé", "Dispo", "Prix vente"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-dark-400 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {inventory?.map((item: any) => {
                const available = item.quantity - item.reserved;
                const isLow = item.quantity <= 2 && item.quantity > 0;
                const isOut = item.quantity === 0;
                return (
                  <tr key={item.id} className="hover:bg-dark-800/50 transition-colors">
                    <td className="px-4 py-4">
                      <div className="font-medium text-dark-100">{item.listing.title}</div>
                      <div className="text-xs text-dark-400">{item.listing.deviceModel.brand.name}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="badge bg-dark-700 text-dark-300">
                        {item.listing.condition} – {CONDITION_LABELS[item.listing.condition]?.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        {isLow && <AlertTriangle className="h-3 w-3 text-yellow-400" />}
                        {isOut && <AlertTriangle className="h-3 w-3 text-red-400" />}
                        <span className={isOut ? "text-red-400" : isLow ? "text-yellow-400" : "text-dark-100"}>
                          {item.quantity}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-dark-400">{item.reserved}</td>
                    <td className="px-4 py-4">
                      <span className={`font-semibold ${available === 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {available}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium text-dark-50">
                      {formatPrice(item.listing.listingPrice)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {inventory?.length === 0 && (
            <div className="py-16 text-center text-dark-400">
              <Boxes className="h-10 w-10 mx-auto mb-4 opacity-50" />
              <p>Inventaire vide – ajoutez vos premiers produits</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
