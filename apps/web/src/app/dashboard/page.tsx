"use client";

import { useQuery } from "@tanstack/react-query";
import { franchiseApi } from "@/lib/api";
import { formatPrice, formatDate } from "@/lib/utils";
import { Package, ShoppingCart, TrendingUp, AlertCircle, Loader2 } from "lucide-react";

function StatCard({ title, value, sub, icon: Icon, accent = false }: any) {
  return (
    <div className={`card ${accent ? "border-gold-500/30 bg-gold-500/5" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="text-sm text-dark-400">{title}</div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent ? "bg-gold-500/20" : "bg-dark-800"}`}>
          <Icon className={`h-5 w-5 ${accent ? "text-gold-400" : "text-dark-400"}`} />
        </div>
      </div>
      <div className={`text-2xl font-black ${accent ? "text-gold-400" : "text-dark-50"}`}>{value}</div>
      {sub && <div className="text-xs text-dark-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function FranchiseDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["franchise-dashboard"],
    queryFn: () => franchiseApi.getDashboard().then((r) => r.data),
  });

  const { data: recentSales } = useQuery({
    queryKey: ["franchise-recent-sales"],
    queryFn: () => franchiseApi.getRecentSales().then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
      </div>
    );
  }

  const { stats, franchise } = data ?? { stats: {}, franchise: {} };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-dark-50">Bonjour, {franchise?.name} 👋</h1>
        <p className="text-dark-400 mt-1">{franchise?.city}, {franchise?.region}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Chiffre d'affaires"
          value={formatPrice(stats?.totalRevenue ?? 0)}
          icon={TrendingUp}
          accent
        />
        <StatCard
          title="Commandes totales"
          value={stats?.totalOrders ?? 0}
          sub={`${stats?.activeListings ?? 0} produits actifs`}
          icon={ShoppingCart}
        />
        <StatCard
          title="Rachats en attente"
          value={stats?.pendingBuybacks ?? 0}
          sub="À traiter"
          icon={Package}
        />
      </div>

      {/* Recent sales */}
      <div className="card">
        <h2 className="text-lg font-bold text-dark-50 mb-6">Dernières ventes</h2>
        {recentSales?.length === 0 ? (
          <p className="text-dark-400 text-sm text-center py-8">Aucune vente récente</p>
        ) : (
          <div className="space-y-3">
            {recentSales?.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between py-3 border-b border-dark-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-dark-100">
                    {order.customer.firstName} {order.customer.lastName}
                  </p>
                  <p className="text-xs text-dark-400 mt-0.5">
                    {order.items.map((i: any) => i.listing.title).join(", ")}
                  </p>
                  <p className="text-xs text-dark-500 mt-0.5">{formatDate(order.createdAt)}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-dark-50">{formatPrice(order.totalAmount)}</div>
                  <div className={`text-xs mt-1 ${order.status === "DELIVERED" ? "text-emerald-400" : "text-gold-400"}`}>
                    {order.status === "DELIVERED" ? "Livré" : "En cours"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
