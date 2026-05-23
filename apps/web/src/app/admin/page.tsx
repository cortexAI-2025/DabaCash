"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { Users, Store, ShoppingBag, TrendingUp, AlertTriangle, Banknote, Loader2 } from "lucide-react";

function KpiCard({ title, value, icon: Icon, color = "text-dark-50", borderColor = "" }: any) {
  return (
    <div className={`card ${borderColor}`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-dark-400">{title}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-dark-800">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

export default function AdminPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => adminApi.getStats().then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Tableau de bord Admin</h1>
        <p className="text-dark-400 mt-1">Vue globale de la plateforme DabaCash</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard title="GMV total" value={formatPrice(stats?.gmv ?? 0)} icon={TrendingUp} color="text-gold-400" borderColor="border-gold-500/30" />
        <KpiCard title="Commissions" value={formatPrice(stats?.totalCommissions ?? 0)} icon={Banknote} color="text-emerald-400" />
        <KpiCard title="Commandes" value={stats?.totalOrders ?? 0} icon={ShoppingBag} />
        <KpiCard title="Utilisateurs" value={stats?.totalUsers ?? 0} icon={Users} />
        <KpiCard title="Franchises actives" value={stats?.totalFranchises ?? 0} icon={Store} />
        <KpiCard
          title="Rachats signalés"
          value={stats?.flaggedBuybacks ?? 0}
          icon={AlertTriangle}
          color="text-red-400"
          borderColor={stats?.flaggedBuybacks > 0 ? "border-red-500/30" : ""}
        />
      </div>

      {/* Quick actions */}
      <div className="card">
        <h2 className="text-lg font-bold text-dark-50 mb-4">Actions rapides</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/admin/franchises" className="btn-secondary py-2 px-4 text-sm">
            Gérer les franchises
          </a>
          <a href="/admin/fraud" className="btn-secondary py-2 px-4 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            Voir les signalements ({stats?.flaggedBuybacks ?? 0})
          </a>
          <a href="/admin/analytics" className="btn-secondary py-2 px-4 text-sm">
            Analytics avancées
          </a>
        </div>
      </div>
    </div>
  );
}
