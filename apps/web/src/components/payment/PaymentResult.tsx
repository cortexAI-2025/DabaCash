"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { paymentsApi } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

const POLL_MS = 3000;
const POLL_MAX_MS = 90_000;

export function PaymentResult() {
  const params = useSearchParams();
  const orderId = params.get("order");
  const returned = params.get("status"); // "success" | "cancel" — informational only, never trusted

  // The redirect isn't proof of payment: poll the status that the signed webhook updates.
  const startedAt = Date.now();
  const { data, isLoading } = useQuery({
    queryKey: ["payment-status", orderId],
    queryFn: () => paymentsApi.getOrderStatus(orderId!).then((r) => r.data),
    enabled: !!orderId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      const waiting = s === "PENDING" && returned === "success";
      return waiting && Date.now() - startedAt < POLL_MAX_MS ? POLL_MS : false;
    },
  });

  const retry = useMutation({
    mutationFn: () => paymentsApi.startAslanCheckout(orderId!),
    onSuccess: ({ data }) => {
      window.location.href = data.checkoutUrl;
    },
    onError: () => toast.error("Impossible de relancer le paiement"),
  });

  if (!orderId || isLoading || !data) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
      </div>
    );
  }

  const view = (() => {
    if (data.status === "COMPLETED")
      return { Icon: CheckCircle, tone: "text-emerald-400", title: "Paiement confirmé", text: `Merci ! Votre paiement de ${formatPrice(data.amount)} a bien été reçu.` };
    if (data.status === "PROCESSING")
      return { Icon: Clock, tone: "text-gold-400", title: "En attente de votre paiement cash", text: "Présentez le code de référence chez l'agent partenaire. Votre commande sera confirmée dès réception." };
    if (data.method === "CASH")
      return { Icon: CheckCircle, tone: "text-emerald-400", title: "Commande enregistrée", text: "Réglez en espèces lors du retrait en franchise." };
    if (data.status === "FAILED" || returned === "cancel")
      return { Icon: XCircle, tone: "text-red-400", title: "Paiement non abouti", text: "Aucun montant n'a été débité. Vous pouvez réessayer." };
    return { Icon: Clock, tone: "text-gold-400", title: "Confirmation en cours…", text: "Nous attendons la confirmation de la banque, cela peut prendre quelques instants." };
  })();

  const canRetry = data.method === "ASLAN" && (data.status === "FAILED" || data.status === "PENDING") && returned !== "success";

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <div className="card">
        <view.Icon className={`mx-auto mb-6 h-16 w-16 ${view.tone}`} />
        <h1 className="mb-3 text-2xl font-black text-dark-50">{view.title}</h1>
        <p className="mb-8 text-dark-400">{view.text}</p>
        <div className="flex flex-col gap-3">
          {canRetry && (
            <button className="btn-primary w-full" onClick={() => retry.mutate()} disabled={retry.isPending}>
              Réessayer le paiement
            </button>
          )}
          <Link href="/marketplace" className="btn-secondary w-full">
            Retour au marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
