"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/utils";
import { useDebounced } from "@/hooks/useDebounced";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

const STATUS = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "REFUNDED"];

export default function AdminPaymentsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const term = useDebounced(search);
  const q = useQuery({
    queryKey: ["admin-payments", page, term, status, method],
    queryFn: () => adminApi.getPayments({ page, limit: 20, search: term, status, method }).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Transactions</h1>
        <p className="mt-1 text-dark-400">
          {q.data?.pagination.total ?? 0} paiements · réglés dans la sélection : <span className="font-semibold text-dark-100">{formatPrice(q.data?.completedAmount ?? 0)}</span>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="p-search">Recherche</label><input id="p-search" className="input" placeholder="Email, n° de commande, réf. passerelle" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <div><label className="label" htmlFor="p-status">Statut</label><select id="p-status" className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Tous</option>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="label" htmlFor="p-method">Méthode</label><select id="p-method" className="input" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}><option value="">Toutes</option><option>ASLAN</option><option>CASH</option></select></div>
      </div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={q.data?.items.length === 0} emptyTitle="Aucune transaction" onRetry={() => q.refetch()}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-800"><tr>
              {["Date", "Client", "Franchise", "Commande", "Méthode", "Statut", "Réf.", "Montant"].map((h) => <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-dark-800">
              {q.data?.items.map((p: any) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-dark-300">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3 text-dark-100">{p.user?.email}</td>
                  <td className="px-4 py-3 text-dark-300">{p.order?.franchise?.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-dark-400">#{p.orderId.slice(-8)}</td>
                  <td className="px-4 py-3 text-dark-300">{p.method}</td>
                  <td className="px-4 py-3 text-dark-200">{p.status}</td>
                  <td className="px-4 py-3 font-mono text-xs text-dark-400">{p.gatewayRef ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-dark-50">{formatPrice(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
      </QueryState>
    </div>
  );
}
