"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { marketplaceApi, productsApi } from "@/lib/api";
import { CONDITION_LABELS } from "@/lib/utils";

const schema = z
  .object({
    deviceModelId: z.string().min(1, "Choisissez un modèle"),
    condition: z.enum(["A", "B", "C", "D"]),
    title: z.string().min(5, "Titre trop court"),
    description: z.string().optional(),
    buybackPrice: z.coerce.number().min(0, "Prix invalide"),
    listingPrice: z.coerce.number().min(0, "Prix invalide"),
    originalPrice: z.coerce.number().min(0).optional().or(z.literal("")),
    stockQuantity: z.coerce.number().int().min(1, "Au moins 1 unité"),
    warrantyMonths: z.coerce.number().int().min(0).max(36),
    imageUrls: z.string().optional(),
  })
  .refine((d) => d.listingPrice >= d.buybackPrice, {
    message: "Le prix de vente doit être au moins égal au prix de rachat",
    path: ["listingPrice"],
  });

type FormData = z.input<typeof schema>;

export default function NewListingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const { data: models } = useQuery({
    queryKey: ["models", ""],
    queryFn: () => marketplaceApi.getModels().then((r) => r.data),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { condition: "B", stockQuantity: 1, warrantyMonths: 0 },
  });

  const onSubmit = async (raw: FormData) => {
    const data = schema.parse(raw);
    setSaving(true);
    try {
      await productsApi.create({
        deviceModelId: data.deviceModelId,
        condition: data.condition,
        title: data.title,
        description: data.description || undefined,
        buybackPrice: data.buybackPrice,
        listingPrice: data.listingPrice,
        originalPrice: data.originalPrice === "" || data.originalPrice === undefined ? undefined : data.originalPrice,
        stockQuantity: data.stockQuantity,
        warrantyMonths: data.warrantyMonths,
        // Photo upload is not built yet; URLs are entered by hand.
        images: (data.imageUrls ?? "").split(",").map((u) => u.trim()).filter(Boolean),
      });
      toast.success("Produit publié");
      router.push("/dashboard/inventory");
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Ajouter un produit</h1>
        <p className="mt-1 text-dark-400">Le produit apparaît sur le marketplace dès la publication.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-5">
        <div>
          <label className="label">Modèle *</label>
          <select className="input" {...register("deviceModelId")}>
            <option value="">Sélectionner un modèle</option>
            {models?.map((m: any) => (
              <option key={m.id} value={m.id}>{m.brand.name} {m.name}</option>
            ))}
          </select>
          {errors.deviceModelId && <p className="mt-1 text-xs text-red-400">{errors.deviceModelId.message}</p>}
        </div>

        <div>
          <label className="label">État *</label>
          <select className="input" {...register("condition")}>
            {(["A", "B", "C", "D"] as const).map((c) => (
              <option key={c} value={c}>{c} – {CONDITION_LABELS[c]?.label ?? "Mauvais état"}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Titre *</label>
          <input className="input" placeholder="iPhone 14 128GB – Excellent état" {...register("title")} />
          {errors.title && <p className="mt-1 text-xs text-red-400">{errors.title.message}</p>}
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[90px] resize-none" {...register("description")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Prix de rachat (MAD) *</label>
            <input type="number" className="input" {...register("buybackPrice")} />
            {errors.buybackPrice && <p className="mt-1 text-xs text-red-400">{errors.buybackPrice.message}</p>}
          </div>
          <div>
            <label className="label">Prix de vente (MAD) *</label>
            <input type="number" className="input" {...register("listingPrice")} />
            {errors.listingPrice && <p className="mt-1 text-xs text-red-400">{errors.listingPrice.message}</p>}
          </div>
          <div>
            <label className="label">Prix neuf de référence (MAD)</label>
            <input type="number" className="input" {...register("originalPrice")} />
          </div>
          <div>
            <label className="label">Quantité *</label>
            <input type="number" className="input" {...register("stockQuantity")} />
            {errors.stockQuantity && <p className="mt-1 text-xs text-red-400">{errors.stockQuantity.message}</p>}
          </div>
          <div>
            <label className="label">Garantie (mois)</label>
            <input type="number" className="input" {...register("warrantyMonths")} />
          </div>
        </div>

        <div>
          <label className="label">Photos (URLs, séparées par des virgules)</label>
          <input className="input" placeholder="https://…/photo1.jpg, https://…/photo2.jpg" {...register("imageUrls")} />
        </div>

        <button type="submit" className="btn-primary w-full justify-center" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publier le produit"}
        </button>
      </form>
    </div>
  );
}
