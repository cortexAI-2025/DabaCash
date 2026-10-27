"use client";

import { useState, type ReactNode } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatPrice } from "@/lib/utils";

// One series, one hue. #d97706 passes the dark-surface gates (lightness band, chroma,
// >= 3:1 contrast on #0f172a). Text never wears the series colour: it stays in these ink tokens.
const SERIES = "#d97706";
const SURFACE = "#0f172a";
const GRID = "#1e293b";
const INK_MUTED = "#94a3b8";
const INK_SECONDARY = "#cbd5e1";

export const CATEGORY_LABELS: Record<string, string> = {
  PHONE: "Smartphones",
  LAPTOP: "Laptops",
  TV: "Télévisions",
  TABLET: "Tablettes",
  ACCESSORY: "Accessoires",
  OTHER: "Autres",
};

const shortDay = (day: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00`));
const compact = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v));

export function ChartCard({
  title, subtitle, table, children,
}: {
  title: string;
  subtitle?: string;
  /** Same data as the chart, for keyboard / screen-reader / copy-paste use. */
  table: { headers: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className="card" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-dark-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-dark-400">{subtitle}</p>}
        </div>
        <div className="flex rounded-lg border border-dark-700 p-0.5 text-xs" role="group" aria-label="Affichage">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded-md px-3 py-1 font-medium ${view === v ? "bg-dark-700 text-dark-50" : "text-dark-400 hover:text-dark-200"}`}
            >
              {v === "chart" ? "Graphique" : "Tableau"}
            </button>
          ))}
        </div>
      </div>

      {view === "chart" ? (
        children
      ) : (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-dark-900">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-dark-400 ${i ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`px-3 py-2 ${j ? "text-right tabular-nums text-dark-200" : "text-dark-300"}`}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Tip({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <div className="rounded-xl border border-dark-600 bg-dark-800 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-semibold text-dark-50">{title}</div>
      {lines.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6 text-dark-300">
          <span>{k}</span>
          <span className="tabular-nums text-dark-100">{v}</span>
        </div>
      ))}
    </div>
  );
}

export interface DailyPoint { day: string; orders: number; gmv: number }

export function DailyGmvChart({ data }: { data: DailyPoint[] }) {
  const empty = data.every((d) => d.gmv === 0);
  return (
    <ChartCard
      title="Ventes par jour"
      subtitle="GMV des commandes confirmées, jours calendaires de Casablanca"
      table={{ headers: ["Jour", "Commandes", "GMV"], rows: data.map((d) => [shortDay(d.day), d.orders, formatPrice(d.gmv)]) }}
    >
      <div className="relative h-60" role="img" aria-label={`Courbe du GMV quotidien sur ${data.length} jours`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={32} />
            <YAxis tickFormatter={compact} tick={{ fill: INK_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: "#475569", strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = active && (payload?.[0]?.payload as DailyPoint | undefined);
                return d ? <Tip title={shortDay(d.day)} lines={[["GMV", formatPrice(d.gmv)], ["Commandes", String(d.orders)]]} /> : null;
              }}
            />
            <Line
              type="linear" dataKey="gmv" stroke={SERIES} strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
        {empty && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-dark-400">Aucune vente sur la période</p>}
      </div>
    </ChartCard>
  );
}

export interface CategoryPoint { category: string; units: number; revenue: number; margin: number; marginPct: number }

export function CategoryMarginChart({ data }: { data: CategoryPoint[] }) {
  const rows = data.map((c) => ({ ...c, label: CATEGORY_LABELS[c.category] ?? c.category }));
  return (
    <ChartCard
      title="Marge par catégorie"
      subtitle="Prix de vente moins prix de rachat, articles vendus"
      table={{
        headers: ["Catégorie", "Unités", "CA", "Marge", "Marge %"],
        rows: rows.map((c) => [c.label, c.units, formatPrice(c.revenue), formatPrice(c.margin), `${Math.round(c.marginPct * 100)} %`]),
      }}
    >
      {rows.length === 0 ? (
        <p className="flex h-40 items-center justify-center text-sm text-dark-400">Aucune vente sur la période</p>
      ) : (
        <div style={{ height: Math.max(120, rows.length * 44 + 16) }} role="img" aria-label="Marge par catégorie de produit">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 72, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" width={104} tick={{ fill: INK_SECONDARY, fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: GRID, opacity: 0.5 }}
                content={({ active, payload }) => {
                  const d = active && (payload?.[0]?.payload as (typeof rows)[number] | undefined);
                  return d ? (
                    <Tip title={d.label} lines={[["Marge", formatPrice(d.margin)], ["Marge %", `${Math.round(d.marginPct * 100)} %`], ["CA", formatPrice(d.revenue)], ["Unités", String(d.units)]]} />
                  ) : null;
                }}
              />
              <Bar
                dataKey="margin" fill={SERIES} barSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false}
                label={{ position: "right", fill: INK_SECONDARY, fontSize: 12, formatter: (v: number) => formatPrice(v) }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
