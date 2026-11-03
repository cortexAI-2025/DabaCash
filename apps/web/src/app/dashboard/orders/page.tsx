"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Truck, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { ordersApi } from "@/lib/api";
import { formatPrice, formatDate } from "@/lib/utils";
import { apiMessage } from "@/lib/errors";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "badge-gold" },
  CONFIRMED: { label: "Confirmé", cls: "badge-blue" },
  IN_TRANSIT: { label: "En livraison", cls: "bg-purple-500/20 text-purple-400" },
  DELIVERED: { label: "Livré", cls: "badge-green" },
  CANCELLED: { label: "Annulé", cls: "badge-red" },
};

// What the franchise may do next; the API enforces the same state machine.
const NEXT: Record<string, { to: string; label: string; danger?: boolean }[]> = {
  PENDING: [{ to: "CONFIRMED", label: "Confirmer" }, { to: "CANCELLED", label: "Refuser", danger: true }],
  CONFIRMED: [{ to: "IN_TRANSIT", label: "Expédier" }, { to: "DELIVERED", label: "Marquer livré" }, { to: "CANCELLED", label: "Annuler", danger: true }],
  IN_TRANSIT: [{ to: "DELIVERED", label: "Marquer livré" }, { to: "CANCELLED", label: "Annuler", danger: true }],
};

export default function DashboardOrdersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");

  const q = useQuery({
    queryKey: ["franchise-orders", page, status],
    queryFn: () => ordersApi.getFranchise({ page, limit: 10, status }).then((r) => r.data),
  });
  const orders = q.data?.items;

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => ordersApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["franchise-orders"] }); toast.success("Statut mis à jour"); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-dark-50">Commandes</h1>
          <p className="mt-1 text-dark-400">{q.data?.pagination.total ?? 0} commandes</p>
        </div>
        <div>
          <label htmlFor="f-status" className="label">Statut</label>
          <select id="f-status" className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Tous</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={orders?.length === 0} emptyTitle="Aucune commande pour le moment" onRetry={() => q.refetch()}>
        <div className="space-y-4">
          {orders?.map((order: any) => {
            const s = STATUS_CONFIG[order.status] ?? { label: order.status, cls: "bg-dark-700 text-dark-400" };
            const actions = NEXT[order.status] ?? [];
            return (
              <div key={order.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-dark-400">#{order.id.slice(-8)}</span>
                      <span className={`badge text-xs ${s.cls}`}>{s.label}</span>
                      <span className="badge bg-dark-700 text-xs text-dark-300">
                        {order.deliveryMethod === "DROP_IN_STORE" ? "Retrait en magasin" : (<><Truck className="mr-1 inline h-3 w-3" aria-hidden />Livraison</>)}
                      </span>
                      {order.payment && <span className="badge bg-dark-700 text-xs text-dark-300">{order.payment.method} · {order.payment.status}</span>}
                    </div>
                    <p className="font-semibold text-dark-100">{order.customer.firstName} {order.customer.lastName}</p>
                    <p className="mt-0.5 text-xs text-dark-400">{order.customer.email}</p>
                    <div className="mt-2 text-sm text-dark-300">
                      {order.items.map((item: any) => (
                        <div key={item.id}>{item.quantity}× {item.listing.title} – {formatPrice(item.totalPrice)}</div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-dark-500">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-dark-50">{formatPrice(order.totalAmount)}</div>
                    <div className="mt-3 flex flex-col gap-2">
                      {actions.map((a) => (
                        <button
                          key={a.to}
                          className={a.danger ? "btn-secondary px-3 py-1.5 text-xs text-red-400" : "btn-primary px-3 py-1.5 text-xs"}
                          disabled={updateMutation.isPending}
                          onClick={() => {
                            if (a.danger && !window.confirm("Confirmer ? Le stock réservé sera libéré.")) return;
                            updateMutation.mutate({ id: order.id, status: a.to });
                          }}
                        >
                          {a.danger ? <XCircle className="h-3 w-3" aria-hidden /> : <CheckCircle className="h-3 w-3" aria-hidden />}
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
      </QueryState>
    </div>
  );
}
