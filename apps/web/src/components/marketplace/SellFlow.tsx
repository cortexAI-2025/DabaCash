"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { marketplaceApi, pricingApi, buybackApi, citiesApi } from "@/lib/api";
import { formatPrice, CONDITION_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Zap, CheckCircle, Store, Truck, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { apiMessage, errorStatus } from "@/lib/errors";
import { newIdempotencyKey } from "@/lib/idempotency";
import { getRefreshToken } from "@/lib/auth";
import { Field } from "@/components/ui/Field";

const steps = ["Appareil", "Estimation", "Confirmer"];

const deviceSchema = z.object({
  brandSlug: z.string().min(1, "Choisissez une marque"),
  modelSlug: z.string().min(1, "Choisissez un modèle"),
  condition: z.enum(["A", "B", "C", "D"]),
  citySlug: z.string().min(1, "Choisissez votre ville"),
  description: z.string().trim().max(1000, "1000 caractères maximum").optional(),
  imei: z.string().trim().regex(/^(\d{15})?$/, "L'IMEI comporte 15 chiffres (composez *#06# sur l'appareil)").optional(),
  pickupAddress: z.string().trim().max(200).optional(),
  deliveryMethod: z.enum(["DROP_IN_STORE", "PICKUP_FROM_HOME"]),
}).refine((d) => d.deliveryMethod !== "PICKUP_FROM_HOME" || (d.pickupAddress ?? "").length >= 5, {
  message: "Adresse d'enlèvement requise (5 caractères minimum)",
  path: ["pickupAddress"],
});

type DeviceFormData = z.infer<typeof deviceSchema>;

export function SellFlow() {
  const [step, setStep] = useState(0);
  const [estimate, setEstimate] = useState<any>(null);
  const [deviceModelId, setDeviceModelId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const router = useRouter();
  // One key per submission intent: a double click or a retry after a network error cannot create two requests.
  const idemKey = useRef<string | null>(null);

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

  const { data: cities } = useQuery({
    queryKey: ["cities"],
    queryFn: () => citiesApi.getAll().then((r) => r.data),
    staleTime: 60 * 60_000,
  });

  const { data: models } = useQuery({
    queryKey: ["models", brandSlug],
    queryFn: () => marketplaceApi.getModels(brandSlug).then((r) => r.data),
    enabled: !!brandSlug,
  });

  const handleGetEstimate = async (data: DeviceFormData) => {
    const model = models?.find((m: any) => m.slug === data.modelSlug);
    setDeviceModelId(model?.id ?? "");
    try {
      const { data: est } = await pricingApi.estimate(data.brandSlug, data.modelSlug, data.condition);
      setEstimate(est);
      idemKey.current = null;
      setStep(1);
    } catch (e) {
      toast.error(errorStatus(e) === 422 ? "Estimation indisponible pour ce modèle pour le moment." : apiMessage(e));
    }
  };

  const handleConfirm = async (data: DeviceFormData) => {
    if (!getRefreshToken()) {
      toast("Connectez-vous pour envoyer votre demande.");
      router.push("/login?next=/sell");
      return;
    }
    if (sending) return;
    setSending(true);
    idemKey.current ??= newIdempotencyKey();
    try {
      await buybackApi.create({
        deviceModelId,
        citySlug: data.citySlug,
        condition: data.condition,
        deliveryMethod: data.deliveryMethod,
        ...(data.description && { description: data.description }),
        ...(data.imei && { imei: data.imei }),
        ...(data.deliveryMethod === "PICKUP_FROM_HOME" && data.pickupAddress && { pickupAddress: data.pickupAddress }),
      }, idemKey.current);
      setSubmitted(true);
      setStep(2);
    } catch (e) {
      toast.error(apiMessage(e, "Erreur lors de la soumission. Veuillez réessayer."));
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="card">
          <CheckCircle className="h-16 w-16 text-emerald-400 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-dark-50 mb-4">Demande envoyée !</h1>
          <p className="text-dark-400 mb-8">
            Votre demande de rachat a été soumise. Une franchise l&apos;examinera et vous contactera pour
            confirmer le prix final et organiser la remise de l&apos;appareil. Suivez l&apos;avancement depuis votre espace.
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
      <div className="mb-10 flex items-center" role="list" aria-label="Étapes">
        {steps.map((s, i) => (
          <div key={s} role="listitem" aria-current={i === step ? "step" : undefined} className="flex items-center">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all",
              i <= step ? "bg-gold-500 text-dark-950" : "bg-dark-800 text-dark-500"
            )}>
              {i + 1}
            </div>
            <span className={cn("ml-2 text-sm font-medium", i === step ? "text-dark-100" : "hidden text-dark-500 sm:inline")}>
              {s}
            </span>
            {i < steps.length - 1 && (
              <div className={cn("mx-2 h-0.5 w-6 sm:mx-4 sm:w-12", i < step ? "bg-gold-500" : "bg-dark-800")} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(step === 0 ? handleGetEstimate : handleConfirm)}>
        {step === 0 && (
          <div className="card space-y-5">
            <h2 className="text-lg font-bold text-dark-50">Décrivez votre appareil</h2>

            <Field label="Marque *" error={errors.brandSlug?.message}>
              {(p) => (
              <select className="input" {...p} {...register("brandSlug")}>
                <option value="">Sélectionner une marque</option>
                {brands?.map((b: any) => (
                  <option key={b.slug} value={b.slug}>{b.name}</option>
                ))}
              </select>)}
            </Field>

            <Field label="Modèle *" error={errors.modelSlug?.message}>
              {(p) => (
              <select className="input" {...p} {...register("modelSlug")} disabled={!brandSlug}>
                <option value="">Sélectionner un modèle</option>
                {models?.map((m: any) => (
                  <option key={m.slug} value={m.slug}>{m.name}</option>
                ))}
              </select>)}
            </Field>

            <Field label="Ville *" error={errors.citySlug?.message}>
              {(p) => (
              <select className="input" {...p} {...register("citySlug")}>
                <option value="">Sélectionner votre ville</option>
                {cities?.map((c: any) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>)}
            </Field>

            <div>
              <span className="label" id="cond-label">État de l&apos;appareil *</span>
              <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby="cond-label">
                {(["A", "B", "C", "D"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={condition === c}
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

            <Field label="IMEI (recommandé pour un téléphone)" error={errors.imei?.message} hint="15 chiffres, composez *#06# sur l'appareil. Sert à vérifier que l'appareil n'est pas déclaré volé.">
              {(p) => <input className="input" inputMode="numeric" maxLength={15} autoComplete="off" {...p} {...register("imei")} />}
            </Field>

            <Field label="Description (optionnel)" error={errors.description?.message}>
              {(p) => (
                <textarea className="input min-h-[80px] resize-none" maxLength={1000}
                  placeholder="Informations supplémentaires : accessoires inclus, défauts…" {...p} {...register("description")} />
              )}
            </Field>

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
                    <input type="radio" value={value} {...register("deliveryMethod")} className="peer sr-only" />
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

            {watch("deliveryMethod") === "PICKUP_FROM_HOME" && (
              <div className="card">
                <Field label="Adresse d'enlèvement *" error={errors.pickupAddress?.message}>
                  {(p) => <input className="input" maxLength={200} autoComplete="street-address" {...p} {...register("pickupAddress")} />}
                </Field>
              </div>
            )}

            <div className="flex gap-4">
              <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => setStep(0)}>
                Retour
              </button>
              <button type="submit" className="btn-primary flex-1 justify-center" disabled={sending}>
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
