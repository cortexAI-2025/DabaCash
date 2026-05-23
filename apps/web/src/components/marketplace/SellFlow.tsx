"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { marketplaceApi, pricingApi, buybackApi } from "@/lib/api";
import { formatPrice, CONDITION_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Zap, CheckCircle, Store, Truck, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

const steps = ["Appareil", "Estimation", "Confirmer"];

const deviceSchema = z.object({
  brandSlug: z.string().min(1, "Choisissez une marque"),
  modelSlug: z.string().min(1, "Choisissez un modèle"),
  condition: z.enum(["A", "B", "C", "D"]),
  description: z.string().optional(),
  deliveryMethod: z.enum(["DROP_IN_STORE", "PICKUP_FROM_HOME"]),
});

type DeviceFormData = z.infer<typeof deviceSchema>;

export function SellFlow() {
  const [step, setStep] = useState(0);
  const [estimate, setEstimate] = useState<any>(null);
  const [deviceModelId, setDeviceModelId] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<DeviceFormData>({
    resolver: zodResolver(deviceSchema),
    defaultValues: { condition: "B", deliveryMethod: "DROP_IN_STORE" },
  });

  const brandSlug = watch("brandSlug");
  const modelSlug = watch("modelSlug");
  const condition = watch("condition");

  const { data: brands } = useQuery({
    queryKey: ["brands"],
    queryFn: () => marketplaceApi.getBrands().then((r) => r.data),
  });

  const { data: models } = useQuery({
    queryKey: ["models", brandSlug],
    queryFn: () => marketplaceApi.getModels(brandSlug).then((r) => r.data),
    enabled: !!brandSlug,
  });

  const handleGetEstimate = async (data: DeviceFormData) => {
    const model = models?.find((m: any) => m.slug === data.modelSlug);
    setDeviceModelId(model?.id ?? "");
    const { data: est } = await pricingApi.estimate(data.brandSlug, data.modelSlug, data.condition);
    setEstimate(est);
    setStep(1);
  };

  const handleConfirm = async (data: DeviceFormData) => {
    try {
      await buybackApi.create({
        deviceModelId,
        condition: data.condition,
        deliveryMethod: data.deliveryMethod,
        description: data.description,
      });
      setSubmitted(true);
      setStep(2);
    } catch {
      toast.error("Erreur lors de la soumission. Veuillez réessayer.");
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="card">
          <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-dark-50 mb-4">Demande envoyée !</h1>
          <p className="text-dark-400 mb-8">
            Votre demande de rachat a été soumise. Une franchise vous contactera sous 24h
            pour confirmer les détails et organiser la récupération.
          </p>
          <a href="/marketplace" className="btn-primary w-full justify-center">
            Explorer le marketplace
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-black text-dark-50 mb-2">Vendre mon appareil</h1>
        <p className="text-dark-400">Obtenez une estimation et soumettez votre demande de rachat</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center mb-10">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all",
              i <= step ? "bg-gold-500 text-dark-950" : "bg-dark-800 text-dark-500"
            )}>
              {i + 1}
            </div>
            <span className={cn("ml-2 text-sm font-medium", i === step ? "text-dark-100" : "text-dark-500")}>
              {s}
            </span>
            {i < steps.length - 1 && (
              <div className={cn("mx-4 h-0.5 w-12", i < step ? "bg-gold-500" : "bg-dark-800")} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(step === 0 ? handleGetEstimate : handleConfirm)}>
        {step === 0 && (
          <div className="card space-y-5">
            <h2 className="text-lg font-bold text-dark-50">Décrivez votre appareil</h2>

            <div>
              <label className="label">Marque *</label>
              <select className="input" {...register("brandSlug")}>
                <option value="">Sélectionner une marque</option>
                {brands?.map((b: any) => (
                  <option key={b.slug} value={b.slug}>{b.name}</option>
                ))}
              </select>
              {errors.brandSlug && <p className="mt-1 text-xs text-red-400">{errors.brandSlug.message}</p>}
            </div>

            <div>
              <label className="label">Modèle *</label>
              <select className="input" {...register("modelSlug")} disabled={!brandSlug}>
                <option value="">Sélectionner un modèle</option>
                {models?.map((m: any) => (
                  <option key={m.slug} value={m.slug}>{m.name}</option>
                ))}
              </select>
              {errors.modelSlug && <p className="mt-1 text-xs text-red-400">{errors.modelSlug.message}</p>}
            </div>

            <div>
              <label className="label">État de l&apos;appareil *</label>
              <div className="grid grid-cols-2 gap-3">
                {(["A", "B", "C", "D"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValue("condition", c)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      condition === c
                        ? "border-gold-500 bg-gold-500/10"
                        : "border-dark-700 bg-dark-800 hover:border-dark-600"
                    )}
                  >
                    <div className="font-black text-dark-50">{c} – {CONDITION_LABELS[c].label}</div>
                    <div className="text-xs text-dark-400 mt-1">{CONDITION_LABELS[c].description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Description (optionnel)</label>
              <textarea
                className="input min-h-[80px] resize-none"
                placeholder="Informations supplémentaires: accessoires inclus, défauts…"
                {...register("description")}
              />
            </div>

            <button type="submit" className="btn-primary w-full justify-center">
              Obtenir une estimation
              <Zap className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 1 && estimate && (
          <div className="space-y-6">
            {/* Estimate card */}
            <div className="card border-gold-500/30 bg-gradient-to-b from-gold-500/5 to-transparent">
              <div className="flex items-center gap-2 text-gold-400 font-semibold mb-4">
                <Zap className="h-5 w-5" />
                Estimation pour {estimate.brandName} {estimate.modelName}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-dark-800 p-4 text-center">
                  <div className="text-xs text-dark-400 mb-2">Prix de rachat estimé</div>
                  <div className="text-2xl font-black text-dark-50">{formatPrice(estimate.buybackPrice)}</div>
                  <div className="text-xs text-dark-500 mt-1">
                    {formatPrice(estimate.buybackMin)} – {formatPrice(estimate.buybackMax)}
                  </div>
                </div>
                <div className="rounded-xl bg-dark-800 p-4 text-center">
                  <div className="text-xs text-dark-400 mb-2">Prix de revente estimé</div>
                  <div className="text-2xl font-black text-dark-50">{formatPrice(estimate.resaleMin)}</div>
                  <div className="text-xs text-dark-500 mt-1">à {formatPrice(estimate.resaleMax)}</div>
                </div>
              </div>
              <p className="mt-4 text-xs text-dark-400 text-center">
                Le prix final est confirmé lors de l&apos;inspection en franchise
              </p>
            </div>

            {/* Delivery choice */}
            <div className="card">
              <h3 className="text-lg font-bold text-dark-50 mb-4">Mode de remise</h3>
              <div className="space-y-3">
                {[
                  {
                    value: "DROP_IN_STORE",
                    icon: Store,
                    title: "Déposer en franchise",
                    desc: "Apportez votre appareil dans l'une de nos franchises partenaires",
                  },
                  {
                    value: "PICKUP_FROM_HOME",
                    icon: Truck,
                    title: "Enlèvement à domicile",
                    desc: "Un agent de collecte vient récupérer votre appareil",
                  },
                ].map(({ value, icon: Icon, title, desc }) => (
                  <label key={value} className={cn(
                    "flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-all",
                    watch("deliveryMethod") === value
                      ? "border-gold-500 bg-gold-500/5"
                      : "border-dark-700 hover:border-dark-600"
                  )}>
                    <input type="radio" value={value} {...register("deliveryMethod")} className="sr-only" />
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dark-800">
                      <Icon className="h-5 w-5 text-gold-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-dark-100">{title}</div>
                      <div className="text-sm text-dark-400 mt-1">{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => setStep(0)}>
                Retour
              </button>
              <button type="submit" className="btn-primary flex-1 justify-center">
                Confirmer la demande
                <CheckCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
