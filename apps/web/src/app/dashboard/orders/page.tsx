"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi } from "@/lib/api";
import { formatPrice, formatDate } from "@/lib/utils";
import { Loader2, Package, CheckCircle, Truck } from "lucide-react";
import toast from "react-hot-toast";

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon?: any }> = {
  PENDING: { label: "En attente", cls: "badge-gold" },
  CONFIRMED: { label: "Confirmé", cls: "badge-blue" },
  IN_TRANSIT: { label: "En livraison", cls: "bg-purple-500/20 text-purple-400" },
  DELIVERED: { label: "Livré", cls: "badge-green" },
  CANCELLED: { label: "Annulé", cls: "badge-red" },
};

export default function DashboardOrdersPage() {
  const qc = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["franchise-orders"],
    queryFn: () => ordersApi.getFranchise().then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => ordersApi.updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["franchise-orders"] }); toast.success("Statut mis à jour"); },
    onError: () => toast.error("Erreur"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Commandes</h1>
        <p className="text-dark-400 mt-1">{orders?.length ?? 0} commandes reçues</p>
      </div>

      <div className="space-y-4">
        {orders?.map((order: any) => {
          const s = STATUS_CONFIG[order.status] ?? { label: order.status, cls: "bg-dark-700 text-dark-400" };
          return (
            <div key={order.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs text-dark-400">#{order.id.slice(-8)}</span>
                    <span className={`badge text-xs ${s.cls}`}>{s.label}</span>
                    {order.deliveryMethod === "DROP_IN_STORE" ? (
                      <span className="badge text-xs bg-dark-700 text-dark-300">Dépôt franchise</span>
                    ) : (
                      <span className="badge text-xs bg-dark-700 text-dark-300">
                        <Truck className="h-3 w-3 mr-1 inline" />Livraison
                      </span>
                    )}
                  </div>
                  <p className="font-semibold text-dark-100">
                    {order.customer.firstName} {order.customer.lastName}
                  </p>
                  <p className="text-xs text-dark-400 mt-0.5">{order.customer.email}</p>
                  <div className="mt-2 text-sm text-dark-300">
                    {order.items.map((item: any) => (
                      <div key={item.id}>
                        {item.quantity}× {item.listing.title} – {formatPrice(item.totalPrice)}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-dark-500 mt-2">{formatDate(order.createdAt)}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-dark-50">{formatPrice(order.totalAmount)}</div>
                  <div className="mt-3 flex flex-col gap-2">
                    {order.status === "PENDING" && (
                      <button
                        className="btn-primary py-1.5 px-3 text-xs"
                        onClick={() => updateMutation.mutate({ id: order.id, status: "CONFIRMED" })}
                      >
                        <CheckCircle className="h-3 w-3" />
                        Confirmer
                      </button>
                    )}
                    {order.status === "CONFIRMED" && (
                      <button
                        className="btn-secondary py-1.5 px-3 text-xs"
                        onClick={() => updateMutation.mutate({ id: order.id, status: "DELIVERED" })}
                      >
                        Marquer livré
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {orders?.length === 0 && (
          <div className="card text-center py-16 text-dark-400">
            <Package className="h-10 w-10 mx-auto mb-4 opacity-50" />
            <p>Aucune commande pour le moment</p>
          </div>
        )}
      </div>
    </div>
  );
}
