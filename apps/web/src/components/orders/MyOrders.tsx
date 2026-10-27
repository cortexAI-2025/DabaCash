"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2, Package } from "lucide-react";
import toast from "react-hot-toast";
import { ordersApi, paymentsApi } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/utils";

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
  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => ordersApi.getMy().then((r) => r.data),
  });

  const retry = useMutation({
    mutationFn: (orderId: string) => paymentsApi.startAslanCheckout(orderId),
    onSuccess: ({ data }) => {
      window.location.href = data.checkoutUrl;
    },
    onError: () => {
      toast.error("Impossible de relancer le paiement");
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-32"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  if (!orders?.length) {
    return (
      <div className="py-32 text-center text-dark-400">
        <Package className="mx-auto mb-4 h-10 w-10 opacity-50" />
        <p>Vous n&apos;avez pas encore de commande.</p>
        <Link href="/marketplace" className="btn-primary mt-6 inline-flex">Voir le marketplace</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order: any) => {
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
    </div>
  );
}
