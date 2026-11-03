"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/utils";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

const STATUSES = ["", "PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const LABEL: Record<string, string> = { "": "Tous les statuts", PENDING: "En attente", CONFIRMED: "Confirmée", IN_TRANSIT: "En route", DELIVERED: "Livrée", CANCELLED: "Annulée" };

export default function AdminOrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const q = useQuery({
    queryKey: ["admin-orders", page, status],
    queryFn: () => adminApi.getOrders({ page, limit: 20, status }).then((r) => r.data),
  });
  const orders = q.data?.items;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-dark-50">Commandes</h1>
          <p className="mt-1 text-dark-400">{q.data?.pagination.total ?? 0} commandes</p>
        </div>
        <div>
          <label htmlFor="order-status" className="label">Statut</label>
          <select id="order-status" className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={orders?.length === 0} emptyTitle="Aucune commande" onRetry={() => q.refetch()}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-800">
              <tr>
                {["Date", "Client", "Franchise", "Articles", "Montant", "Paiement", "Statut"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {orders?.map((o: any) => (
                <tr key={o.id} className="hover:bg-dark-800/50">
                  <td className="px-4 py-3 text-dark-300">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="text-dark-100">{o.customer.firstName} {o.customer.lastName}</div>
                    <div className="text-xs text-dark-400">{o.customer.email}</div>
                  </td>
                  <td className="px-4 py-3 text-dark-300">{o.franchise.name}</td>
                  <td className="px-4 py-3 text-dark-300">{o.items.map((i: any) => `${i.quantity}× ${i.listing.title}`).join(", ")}</td>
                  <td className="px-4 py-3 font-medium text-dark-50">{formatPrice(o.totalAmount)}</td>
                  <td className="px-4 py-3 text-dark-300">{o.payment ? `${o.payment.method} · ${o.payment.status}` : "—"}</td>
                  <td className="px-4 py-3 text-dark-200">{LABEL[o.status] ?? o.status}</td>
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
