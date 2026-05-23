"use client";

import { useQuery } from "@tanstack/react-query";
import { franchiseApi } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2, TrendingUp } from "lucide-react";

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["franchise-dashboard"],
    queryFn: () => franchiseApi.getDashboard().then((r) => r.data),
  });

  const { data: sales } = useQuery({
    queryKey: ["franchise-recent-sales"],
    queryFn: () => franchiseApi.getRecentSales().then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  // Aggregate sales by day for chart
  const salesByDay = sales?.reduce((acc: any, order: any) => {
    const day = new Date(order.createdAt).toLocaleDateString("fr-MA", { day: "2-digit", month: "short" });
    if (!acc[day]) acc[day] = { day, amount: 0, count: 0 };
    acc[day].amount += order.totalAmount;
    acc[day].count += 1;
    return acc;
  }, {});
  const chartData = Object.values(salesByDay ?? {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Statistiques</h1>
        <p className="text-dark-400 mt-1">Performance de votre franchise</p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card border-gold-500/30 text-center">
          <div className="text-3xl font-black text-gold-400">{formatPrice(data?.stats?.totalRevenue ?? 0)}</div>
          <div className="text-sm text-dark-400 mt-2">Chiffre d&apos;affaires total</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-black text-dark-50">{data?.stats?.totalOrders ?? 0}</div>
          <div className="text-sm text-dark-400 mt-2">Commandes totales</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-black text-emerald-400">{formatPrice(data?.stats?.totalRevenue ? data.stats.totalRevenue / Math.max(data.stats.totalOrders, 1) : 0)}</div>
          <div className="text-sm text-dark-400 mt-2">Panier moyen</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold text-dark-50 mb-6">Ventes récentes</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: "12px" }}
                labelStyle={{ color: "#f8fafc" }}
                formatter={(v: any) => [formatPrice(v), "Ventes"]}
              />
              <Bar dataKey="amount" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length === 0 && (
        <div className="card text-center py-16 text-dark-400">
          <TrendingUp className="h-10 w-10 mx-auto mb-4 opacity-50" />
          <p>Aucune donnée de vente disponible</p>
        </div>
      )}
    </div>
  );
}
