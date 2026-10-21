"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Shield, Store, Truck, CreditCard, Banknote } from "lucide-react";
import toast from "react-hot-toast";
import { citiesApi, marketplaceApi, ordersApi, paymentsApi } from "@/lib/api";
import { cn, formatPrice, CONDITION_LABELS } from "@/lib/utils";

type Delivery = "DROP_IN_STORE" | "COURIER";
type Pay = "ASLAN" | "CASH";

export function ListingView() {
  const id = useSearchParams().get("id");
  const router = useRouter();

  const [delivery, setDelivery] = useState<Delivery>("DROP_IN_STORE");
  const [payment, setPayment] = useState<Pay>("ASLAN");
  const [citySlug, setCitySlug] = useState("");
  const [address, setAddress] = useState("");

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => marketplaceApi.getListing(id!).then((r) => r.data),
    enabled: !!id,
  });
  const { data: cities } = useQuery({
    queryKey: ["cities"],
    queryFn: () => citiesApi.getAll().then((r) => r.data),
    staleTime: 60 * 60_000,
  });

  const buy = useMutation({
    mutationFn: async () => {
      const city = cities?.find((c: any) => c.slug === citySlug);
      const { data: order } = await ordersApi.create({
        items: [{ listingId: id, quantity: 1 }],
        deliveryMethod: delivery,
        deliveryAddress:
          delivery === "COURIER" ? { address, city: city?.name, region: city?.region } : undefined,
        paymentMethod: payment,
      });
      if (payment === "ASLAN") {
        const { data } = await paymentsApi.startAslanCheckout(order.id);
        return { orderId: order.id as string, checkoutUrl: data.checkoutUrl };
      }
      return { orderId: order.id as string, checkoutUrl: null };
    },
    onSuccess: ({ orderId, checkoutUrl }) => {
      if (checkoutUrl) window.location.href = checkoutUrl; // Aslan hosted page
      else router.push(`/payment/result?order=${orderId}&status=success`);
    },
    onError: (err: any) => {
      if (err.response?.status === 401) {
        toast.error("Connectez-vous pour acheter");
        router.push("/login");
      } else {
        toast.error(err.response?.data?.message ?? "Impossible de passer la commande");
      }
    },
  });

  if (isLoading || !listing) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
      </div>
    );
  }

  const cond = CONDITION_LABELS[listing.condition];
  const needsAddress = delivery === "COURIER";
  const canSubmit = !buy.isPending && (!needsAddress || (citySlug && address.trim().length > 4));

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-dark-800">
        {listing.images?.[0] ? (
          <Image src={listing.images[0]} alt={listing.title} fill className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-7xl">📱</div>
        )}
      </div>

      <div className="space-y-6">
        <div>
          <p className="text-sm text-dark-400">{listing.deviceModel.brand.name}</p>
          <h1 className="text-2xl font-black text-dark-50">{listing.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span className={cn("badge bg-dark-800", cond.color)}>État {listing.condition} – {cond.label}</span>
            {listing.warrantyMonths > 0 && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Shield className="h-4 w-4" /> Garantie {listing.warrantyMonths} mois
              </span>
            )}
            <span className="flex items-center gap-1 text-dark-400">
              <MapPin className="h-4 w-4" /> {listing.franchise.name} · {listing.franchise.city}
            </span>
          </div>
        </div>

        <div className="text-3xl font-black text-gold-400">{formatPrice(listing.listingPrice)}</div>
        {listing.description && <p className="text-sm leading-relaxed text-dark-300">{listing.description}</p>}

        <div className="card space-y-5">
          <div>
            <label className="label">Réception</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["DROP_IN_STORE", Store, "Retrait en franchise"],
                ["COURIER", Truck, "Livraison"],
              ] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDelivery(value);
                    if (value === "COURIER" && payment === "CASH") setPayment("ASLAN");
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all",
                    delivery === value ? "border-gold-500 bg-gold-500/10 text-gold-400" : "border-dark-700 text-dark-300"
                  )}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {needsAddress && (
            <div className="space-y-3">
              <select className="input" value={citySlug} onChange={(e) => setCitySlug(e.target.value)}>
                <option value="">Ville de livraison</option>
                {cities?.map((c: any) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
              <input
                className="input"
                placeholder="Adresse complète"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="label">Paiement</label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setPayment("ASLAN")}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
                  payment === "ASLAN" ? "border-gold-500 bg-gold-500/5" : "border-dark-700"
                )}
              >
                <CreditCard className="mt-0.5 h-5 w-5 text-gold-400" />
                <span>
                  <span className="block text-sm font-semibold text-dark-100">Payer en ligne (Aslan)</span>
                  <span className="text-xs text-dark-400">Carte bancaire ou cash chez un agent partenaire. Paiement sécurisé.</span>
                </span>
              </button>
              {delivery === "DROP_IN_STORE" && (
                <button
                  type="button"
                  onClick={() => setPayment("CASH")}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
                    payment === "CASH" ? "border-gold-500 bg-gold-500/5" : "border-dark-700"
                  )}
                >
                  <Banknote className="mt-0.5 h-5 w-5 text-gold-400" />
                  <span>
                    <span className="block text-sm font-semibold text-dark-100">Payer en magasin</span>
                    <span className="text-xs text-dark-400">Réglez en espèces au retrait.</span>
                  </span>
                </button>
              )}
            </div>
          </div>

          <button className="btn-primary w-full" disabled={!canSubmit} onClick={() => buy.mutate()}>
            {buy.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : payment === "ASLAN" ? "Payer maintenant" : "Réserver"}
          </button>
        </div>
      </div>
    </div>
  );
}
