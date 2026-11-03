"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, Pencil, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { inventoryApi, productsApi } from "@/lib/api";
import { formatPrice, CONDITION_LABELS } from "@/lib/utils";
import { apiMessage } from "@/lib/errors";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

const STATUS: Record<string, string> = { ACTIVE: "En vente", DRAFT: "Brouillon", ARCHIVED: "Archivée", SOLD: "Épuisée", RESERVED: "Réservée" };

function EditRow({ item, onClose }: { item: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [price, setPrice] = useState(String(item.listing.listingPrice));
  const [stock, setStock] = useState(String(item.quantity));
  const save = useMutation({
    mutationFn: () => productsApi.update(item.listing.id, { listingPrice: Number(price), stockQuantity: Number(stock) }),
    onSuccess: () => { toast.success("Annonce mise à jour"); qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["inventory-summary"] }); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const valid = /^\d+$/.test(price) && Number(price) > 0 && /^\d+$/.test(stock);
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className="label" htmlFor={`p-${item.id}`}>Prix de vente (MAD)</label>
        <input id={`p-${item.id}`} className="input" type="number" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
        <p className="mt-1 text-xs text-dark-500">Au moins égal au prix de rachat.</p>
      </div>
      <div>
        <label className="label" htmlFor={`s-${item.id}`}>Stock</label>
        <input id={`s-${item.id}`} className="input" type="number" min={item.reserved} step={1} value={stock} onChange={(e) => setStock(e.target.value)} />
        <p className="mt-1 text-xs text-dark-500">{item.reserved} unité(s) réservée(s).</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost text-xs" onClick={onClose}>Annuler</button>
        <button className="btn-primary px-3 py-2 text-xs" disabled={!valid || save.isPending} onClick={() => save.mutate()}>Enregistrer</button>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["inventory", page],
    queryFn: () => inventoryApi.get({ page, limit: 20 }).then((r) => r.data),
    refetchInterval: 30_000,
  });
  const inventory = q.data?.items;

  const { data: summary } = useQuery({
    queryKey: ["inventory-summary"],
    queryFn: () => inventoryApi.getSummary().then((r) => r.data),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "ARCHIVED" }) => productsApi.update(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inventory"] }); qc.invalidateQueries({ queryKey: ["inventory-summary"] }); toast.success("Statut mis à jour"); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-dark-50">Inventaire</h1>
          <p className="mt-1 text-dark-400">Stock en temps réel (actualisation toutes les 30 s)</p>
        </div>
        <Link href="/dashboard/products/new" className="btn-primary px-4 py-2 text-sm">+ Ajouter un produit</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card text-center"><div className="text-2xl font-black text-dark-50">{summary?.total ?? 0}</div><div className="mt-1 text-sm text-dark-400">Produits</div></div>
        <div className="card border-yellow-500/20 text-center"><div className="text-2xl font-black text-yellow-400">{summary?.lowStock ?? 0}</div><div className="mt-1 text-sm text-dark-400">Stock faible</div></div>
        <div className="card border-red-500/20 text-center"><div className="text-2xl font-black text-red-400">{summary?.outOfStock ?? 0}</div><div className="mt-1 text-sm text-dark-400">Rupture de stock</div></div>
      </div>

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={inventory?.length === 0} emptyTitle="Inventaire vide" emptyHint="Ajoutez vos premiers produits." onRetry={() => q.refetch()}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-800">
              <tr>
                {["Produit", "État", "Statut", "Stock", "Réservé", "Dispo", "Prix vente", ""].map((h, i) => (
                  <th key={i} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">{h || <span className="sr-only">Actions</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {inventory?.map((item: any) => {
                const available = item.quantity - item.reserved;
                const isLow = item.quantity <= 2 && item.quantity > 0;
                const isOut = item.quantity === 0;
                const archived = item.listing.status === "ARCHIVED";
                return (
                  <Fragment key={item.id}>
                    <tr className="transition-colors hover:bg-dark-800/50">
                      <td className="px-4 py-4">
                        <div className="font-medium text-dark-100">{item.listing.title}</div>
                        <div className="text-xs text-dark-400">{item.listing.deviceModel.brand.name}</div>
                      </td>
                      <td className="px-4 py-4"><span className="badge bg-dark-700 text-dark-300">{item.listing.condition} – {CONDITION_LABELS[item.listing.condition]?.label}</span></td>
                      <td className="px-4 py-4 text-dark-300">{STATUS[item.listing.status] ?? item.listing.status}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          {(isLow || isOut) && <AlertTriangle className={`h-3 w-3 ${isOut ? "text-red-400" : "text-yellow-400"}`} aria-label="Stock bas" />}
                          <span className={isOut ? "text-red-400" : isLow ? "text-yellow-400" : "text-dark-100"}>{item.quantity}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-dark-400">{item.reserved}</td>
                      <td className="px-4 py-4"><span className={`font-semibold ${available === 0 ? "text-red-400" : "text-emerald-400"}`}>{available}</span></td>
                      <td className="px-4 py-4 font-medium text-dark-50">{formatPrice(item.listing.listingPrice)}</td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1">
                          <button className="btn-ghost p-2" aria-label="Modifier prix et stock" onClick={() => setEditing(editing === item.id ? null : item.id)}><Pencil className="h-4 w-4" /></button>
                          {archived ? (
                            <button className="btn-ghost p-2" aria-label="Remettre en vente" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: item.listing.id, status: "ACTIVE" })}><RotateCcw className="h-4 w-4" /></button>
                          ) : (
                            <button className="btn-ghost p-2" aria-label="Archiver l'annonce" disabled={setStatus.isPending}
                              onClick={() => { if (window.confirm("Archiver cette annonce ? Elle ne sera plus visible sur le marketplace.")) setStatus.mutate({ id: item.listing.id, status: "ARCHIVED" }); }}>
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editing === item.id && (
                      <tr className="bg-dark-900/60"><td colSpan={8} className="px-4 py-4"><EditRow item={item} onClose={() => setEditing(null)} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
      </QueryState>
    </div>
  );
}
