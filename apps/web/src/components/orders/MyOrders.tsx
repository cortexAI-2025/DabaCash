"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { ordersApi, paymentsApi } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/utils";
import { apiMessage } from "@/lib/errors";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "badge-gold" },
  CONFIRMED: { label: "Confirmée", cls: "badge-blue" },
  IN_TRANSIT: { label: "En route", cls: "bg-purple-500/20 text-purple-400" },
  DELIVERED: { label: "Livrée", cls: "badge-green" },
  CANCELLED: { label: "Annulée", cls: "badge-red" },
  REFUNDED: { label: "Remboursée", cls: "bg-dark-700 text-dark-300" },
};

const PAYMENT_STATUS: Record<string, string> = {
  PENDING: "Paiement non finalisé",
  PROCESSING: "Paiement cash en attente",
  COMPLETED: "Payée",
  FAILED: "Paiement non abouti",
  REFUNDED: "Remboursée",
};

export function MyOrders() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["my-orders", page],
    queryFn: () => ordersApi.getMy({ page, limit: 10 }).then((r) => r.data),
  });
  const orders = q.data?.items;

  const cancel = useMutation({
    mutationFn: (orderId: string) => ordersApi.cancel(orderId),
    onSuccess: () => { toast.success("Commande annulée"); qc.invalidateQueries({ queryKey: ["my-orders"] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const retry = useMutation({
    mutationFn: (orderId: string) => paymentsApi.startAslanCheckout(orderId),
    onSuccess: ({ data }) => {
      window.location.href = data.checkoutUrl;
    },
    onError: (e) => {
      toast.error(apiMessage(e, "Impossible de relancer le paiement"));
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
  });

  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={orders?.length === 0} emptyTitle="Vous n'avez pas encore de commande." emptyHint={<Link href="/marketplace" className="text-gold-400 underline">Voir le marketplace</Link>} onRetry={() => q.refetch()}>
    <div className="space-y-4">
      {orders?.map((order: any) => {
        const status = ORDER_STATUS[order.status] ?? { label: order.status, cls: "bg-dark-700 text-dark-300" };
        const payment = order.payment;
        const canPayOnline = payment?.method === "ASLAN" && (payment.status === "PENDING" || payment.status === "FAILED") && order.status === "PENDING";
        return (
          <div key={order.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-dark-400">#{order.id.slice(-8)}</span>
                  <span className={`badge text-xs ${status.cls}`}>{status.label}</span>
                </div>
                {order.items.map((item: any) => (
                  <p key={item.id} className="text-sm text-dark-200">
                    {item.quantity}× {item.listing.title}
                  </p>
                ))}
                <p className="text-xs text-dark-400">
                  {order.franchise.name} · {formatDate(order.createdAt)}
                </p>
                {payment && (
                  <p className="text-xs text-dark-400">{PAYMENT_STATUS[payment.status] ?? payment.status}</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-dark-50">{formatPrice(order.totalAmount)}</div>
                {order.status === "PENDING" && (
                  <button
                    className="btn-secondary ml-2 mt-3 px-3 py-2 text-xs"
                    onClick={() => { if (window.confirm("Annuler cette commande ?")) cancel.mutate(order.id); }}
                    disabled={cancel.isPending}
                  >
                    Annuler
                  </button>
                )}
                {canPayOnline && (
                  <button
                    className="btn-primary mt-3 px-3 py-2 text-xs"
                    onClick={() => retry.mutate(order.id)}
                    disabled={retry.isPending}
                  >
                    {retry.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Payer maintenant"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
    </div>
    </QueryState>
  );
}
