"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { marketplaceApi, pricingApi } from "@/lib/api";
import { Zap, TrendingDown, TrendingUp, Info } from "lucide-react";
import { formatPrice, CONDITION_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { apiMessage, errorStatus } from "@/lib/errors";

const conditions = ["A", "B", "C", "D"] as const;

export function PriceEstimator() {
  const [selectedBrand, setSelectedBrand] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [condition, setCondition] = useState<"A" | "B" | "C" | "D">("B");
  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: brands } = useQuery({
    queryKey: ["brands"],
    queryFn: () => marketplaceApi.getBrands().then((r) => r.data),
  });

  const { data: models } = useQuery({
    queryKey: ["models", selectedBrand],
    queryFn: () => marketplaceApi.getModels(selectedBrand).then((r) => r.data),
    enabled: !!selectedBrand,
  });

  const handleEstimate = async () => {
    if (!selectedBrand || !selectedModel) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await pricingApi.estimate(selectedBrand, selectedModel, condition);
      setEstimate(data);
    } catch (e) {
      setEstimate(null);
      setError(errorStatus(e) === 422 ? "Aucune estimation disponible pour ce modèle pour le moment." : apiMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="estimator" className="py-24 bg-dark-900/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-16 lg:grid-cols-2 items-center">
          {/* Copy */}
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-4 py-2 text-sm text-gold-400">
              <Zap className="h-4 w-4" />
              Estimateur indicatif
            </div>
            <h2 className="section-title mb-6">
              Combien vaut <span className="gradient-text">votre appareil</span> ?
            </h2>
            <p className="text-dark-400 leading-relaxed mb-8">
              Notre estimateur applique des barèmes par état à un prix de référence par modèle
              et vous donne une fourchette indicative en quelques secondes.
              Aucune inscription requise.
            </p>
            <div className="flex flex-col gap-3 text-sm text-dark-300">
              {["Barème par état de l'appareil (A à D)", "Prix de référence géré par l'équipe DabaCash", "Prix final confirmé à l'inspection en franchise"].map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-gold-400" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          {/* Estimator form */}
          <div className="card">
            <h3 className="text-lg font-bold text-dark-50 mb-6">Obtenir une estimation</h3>

            <div className="space-y-4">
              {/* Brand */}
              <div>
                <label className="label" htmlFor="est-brand">Marque</label>
                <select
                  id="est-brand"
                  className="input"
                  value={selectedBrand}
                  onChange={(e) => { setSelectedBrand(e.target.value); setSelectedModel(""); setEstimate(null); }}
                >
                  <option value="">Sélectionner une marque</option>
                  {brands?.map((b: any) => (
                    <option key={b.slug} value={b.slug}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label className="label" htmlFor="est-model">Modèle</label>
                <select
                  id="est-model"
                  className="input"
                  value={selectedModel}
                  onChange={(e) => { setSelectedModel(e.target.value); setEstimate(null); }}
                  disabled={!selectedBrand}
                >
                  <option value="">Sélectionner un modèle</option>
                  {models?.map((m: any) => (
                    <option key={m.slug} value={m.slug}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Condition */}
              <div>
                <span className="label" id="est-cond">État</span>
                <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="est-cond">
                  {conditions.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={condition === c}
                      onClick={() => { setCondition(c); setEstimate(null); }}
                      className={cn(
                        "rounded-xl border py-3 text-center text-sm font-semibold transition-all",
                        condition === c
                          ? "border-gold-500 bg-gold-500/10 text-gold-400"
                          : "border-dark-700 bg-dark-800 text-dark-400 hover:border-dark-600"
                      )}
                    >
                      <div className="font-black">{c}</div>
                      <div className="text-xs opacity-70 mt-0.5">{CONDITION_LABELS[c].label.split(" ")[0]}</div>
                    </button>
                  ))}
                </div>
                {condition && (
                  <p className="mt-2 text-xs text-dark-400 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {CONDITION_LABELS[condition].description}
                  </p>
                )}
              </div>

              <button
                className="btn-primary w-full"
                onClick={handleEstimate}
                disabled={!selectedBrand || !selectedModel || loading}
              >
                {loading ? "Calcul en cours…" : "Estimer le prix"}
                <Zap className="h-4 w-4" />
              </button>
            </div>

            {error && <p className="mt-4 text-sm text-red-300" role="alert">{error}</p>}

            {/* Result */}
            {estimate && (
              <div className="mt-6 rounded-xl border border-gold-500/20 bg-gold-500/5 p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gold-400">
                  <Zap className="h-4 w-4" />
                  Estimation pour {estimate.brandName} {estimate.modelName}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-dark-800 p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-xs text-dark-400 mb-1">
                      <TrendingDown className="h-3 w-3" />
                      Prix de rachat
                    </div>
                    <div className="text-xl font-black text-dark-50">{formatPrice(estimate.buybackPrice)}</div>
                    <div className="text-xs text-dark-500 mt-1">
                      {formatPrice(estimate.buybackMin)} – {formatPrice(estimate.buybackMax)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-dark-800 p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-xs text-dark-400 mb-1">
                      <TrendingUp className="h-3 w-3" />
                      Prix de revente
                    </div>
                    <div className="text-xl font-black text-dark-50">{formatPrice(estimate.resaleMin)}</div>
                    <div className="text-xs text-dark-500 mt-1">
                      à {formatPrice(estimate.resaleMax)}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-dark-400 text-center">
                  Marge estimée: <span className="text-emerald-400 font-semibold">{formatPrice(estimate.expectedMargin)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
