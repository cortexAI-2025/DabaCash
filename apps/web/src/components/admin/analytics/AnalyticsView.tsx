"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Loader2, Minus } from "lucide-react";
import { adminApi } from "@/lib/api";
import { cn, formatPrice } from "@/lib/utils";
import { CategoryMarginChart, DailyGmvChart } from "./AnalyticsCharts";

const PERIODS = [7, 30, 90] as const;

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0) return <span className="text-xs text-dark-500">Pas de période précédente</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  const tone = pct > 0 ? "text-emerald-400" : pct < 0 ? "text-red-400" : "text-dark-400";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", tone)}>
      <Icon className="h-3 w-3" aria-hidden />
      {pct > 0 ? "+" : ""}{pct} % vs période précédente
    </span>
  );
}

function Tile({ label, value, hero, wide, children }: { label: string; value: string; hero?: boolean; wide?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("card", (hero || wide) && "sm:col-span-2")}>
      <p className="text-sm text-dark-400">{label}</p>
      <p className={cn("mt-2 font-black tabular-nums text-dark-50", hero ? "text-4xl" : "text-2xl")}>{value}</p>
      <div className="mt-1 min-h-4 text-xs text-dark-500">{children}</div>
    </div>
  );
}

const days = (v: number) => (v < 1 ? "< 1 j" : `${v.toFixed(1)} j`);
const pct = (v: number) => `${Math.round(v * 100)} %`;

export function AnalyticsView() {
  const [period, setPeriod] = useState<number>(30);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-analytics", period],
    queryFn: () => adminApi.getAnalytics(period).then((r) => r.data),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-dark-50">Analytics</h1>
          <p className="mt-1 text-dark-400">Performance de la plateforme</p>
        </div>
        <div className="flex rounded-xl border border-dark-700 p-1" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", period === p ? "bg-gold-500/15 text-gold-400" : "text-dark-400 hover:text-dark-200")}
            >
              {p} jours
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>}
      {isError && <p className="card text-center text-red-400">Impossible de charger les statistiques.</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="GMV" value={formatPrice(data.totals.gmv)} hero>
              <Delta now={data.totals.gmv} before={data.previous.gmv} />
            </Tile>
            <Tile label="Commandes" value={String(data.totals.orders)}>
              <Delta now={data.totals.orders} before={data.previous.orders} />
            </Tile>
            <Tile label="Panier moyen" value={formatPrice(data.totals.avgOrderValue)} />
            <Tile label="Marge moyenne par appareil" value={formatPrice(data.totals.avgMarginPerUnit)}>
              {data.totals.units} appareils vendus
            </Tile>
            <Tile label="Commissions" value={formatPrice(data.totals.commission)}>Commandes réglées</Tile>
            <Tile wide label="Rachats acceptés" value={data.buyback.acceptanceRate === null ? "—" : pct(data.buyback.acceptanceRate)}>
              {data.buyback.accepted} acceptés · {data.buyback.rejected} refusés · {data.buyback.pending} en attente
            </Tile>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <DailyGmvChart data={data.daily} />
            <CategoryMarginChart data={data.categories} />
          </div>

          <section className="card overflow-hidden p-0">
            <div className="p-6 pb-3">
              <h2 className="text-lg font-bold text-dark-50">Produits les plus rapides à vendre</h2>
              <p className="mt-0.5 text-xs text-dark-400">Délai moyen entre la mise en ligne et la vente</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-dark-800">
                  <tr>
                    {["Produit", "Franchise", "Vendus", "CA", "Délai moyen"].map((h, i) => (
                      <th key={h} className={cn("px-4 py-3 text-xs font-semibold uppercase tracking-wider text-dark-400", i > 1 ? "text-right" : "text-left")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {data.topSellers.map((t: any) => (
                    <tr key={t.listingId}>
                      <td className="px-4 py-3 text-dark-100">{t.title}</td>
                      <td className="px-4 py-3 text-dark-300">{t.franchise}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{t.units}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{formatPrice(t.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{days(t.avgDaysToSell)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.topSellers.length === 0 && <p className="py-10 text-center text-sm text-dark-400">Aucune vente sur la période</p>}
            </div>
          </section>

          <section className="card overflow-hidden p-0">
            <div className="p-6 pb-3">
              <h2 className="text-lg font-bold text-dark-50">Performance des franchises</h2>
              <p className="mt-0.5 text-xs text-dark-400">Écoulement = vendus / (vendus + stock actuel)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-dark-800">
                  <tr>
                    {["Franchise", "Ville", "Commandes", "CA", "Marge", "Commission", "Rachats acceptés", "Écoulement"].map((h, i) => (
                      <th key={h} className={cn("px-4 py-3 text-xs font-semibold uppercase tracking-wider text-dark-400", i > 1 ? "text-right" : "text-left")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800">
                  {data.franchises.map((f: any) => (
                    <tr key={f.id}>
                      <td className="px-4 py-3 text-dark-100">{f.name}</td>
                      <td className="px-4 py-3 text-dark-300">{f.city}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{f.orders}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{formatPrice(f.revenue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{formatPrice(f.margin)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{formatPrice(f.commission)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{f.acceptedBuybacks}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-dark-200">{f.units + f.onHand ? pct(f.sellThrough) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-dark-500">
            GMV : {data.definitions.gmv}. Marge : {data.definitions.margin}. La conversion rachat → revente n&apos;est pas mesurable : les
            annonces ne sont pas liées au rachat dont elles proviennent.
          </p>
        </>
      )}
    </div>
  );
}
