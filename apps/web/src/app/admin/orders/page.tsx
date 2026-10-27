"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, ShoppingBag } from "lucide-react";
import { adminApi } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/utils";

export default function AdminOrdersPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => adminApi.getOrders().then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Commandes</h1>
        <p className="mt-1 text-dark-400">200 dernières commandes de la plateforme</p>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-800">
              <tr>
                {["Date", "Client", "Franchise", "Articles", "Montant", "Paiement", "Statut"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">{h}</th>
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
                  <td className="px-4 py-3 text-dark-300">
                    {o.payment ? `${o.payment.method} · ${o.payment.status}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-dark-200">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders?.length === 0 && (
            <div className="py-16 text-center text-dark-400">
              <ShoppingBag className="mx-auto mb-4 h-10 w-10 opacity-50" />
              <p>Aucune commande pour le moment</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
