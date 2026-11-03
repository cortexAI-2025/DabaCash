"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { apiMessage } from "@/lib/errors";
import { formatPrice } from "@/lib/utils";
import { useDebounced } from "@/hooks/useDebounced";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

function PriceCell({ model }: { model: any }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(model.baseMarketPrice));
  const save = useMutation({
    mutationFn: () => adminApi.updateModel(model.id, { baseMarketPrice: Number(value) }),
    onSuccess: () => { toast.success("Prix de référence mis à jour"); setEditing(false); qc.invalidateQueries({ queryKey: ["admin-catalog"] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (!editing) return <button className="rounded px-2 py-1 text-dark-100 hover:bg-dark-800" onClick={() => setEditing(true)} aria-label={`Modifier le prix de ${model.name}`}>{formatPrice(model.baseMarketPrice)}</button>;
  return (
    <span className="inline-flex items-center gap-2">
      <label className="sr-only" htmlFor={`bp-${model.id}`}>Prix de référence (MAD)</label>
      <input id={`bp-${model.id}`} className="input w-28 py-1" type="number" min={100} step={1} value={value} onChange={(e) => setValue(e.target.value)} />
      <button className="btn-primary px-2 py-1 text-xs" disabled={!/^\d+$/.test(value) || Number(value) < 100 || save.isPending} onClick={() => save.mutate()}>OK</button>
      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(false)}>×</button>
    </span>
  );
}

export default function AdminCatalogPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const q = useQuery({ queryKey: ["admin-catalog", page, term], queryFn: () => adminApi.getModels({ page, limit: 20, search: term }).then((r) => r.data) });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Catalogue et prix de référence</h1>
        <p className="mt-1 text-dark-400">Le prix de référence d&apos;un modèle alimente toutes les offres de rachat. Chaque modification est tracée et conservée dans l&apos;historique des prix.</p>
      </div>
      <div className="max-w-sm"><label className="label" htmlFor="c-search">Recherche</label><input id="c-search" className="input" placeholder="Marque ou modèle" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={q.data?.items.length === 0} emptyTitle="Aucun modèle" onRetry={() => q.refetch()}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-800"><tr>{["Marque", "Modèle", "Type", "Année", "Prix de référence"].map((h) => <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-dark-800">
              {q.data?.items.map((m: any) => (
                <tr key={m.id}><td className="px-4 py-3 text-dark-300">{m.brand.name}</td><td className="px-4 py-3 text-dark-100">{m.name}</td><td className="px-4 py-3 text-dark-300">{m.deviceType}</td><td className="px-4 py-3 text-dark-300">{m.releaseYear ?? "—"}</td><td className="px-4 py-3"><PriceCell model={m} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
      </QueryState>
    </div>
  );
}
