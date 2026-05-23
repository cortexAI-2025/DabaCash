"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buybackApi } from "@/lib/api";
import { formatPrice, formatDate, CONDITION_LABELS } from "@/lib/utils";
import { CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useState } from "react";

export default function BuybacksPage() {
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<string | null>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["franchise-buybacks"],
    queryFn: () => buybackApi.getFranchise().then((r) => r.data),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, price }: { id: string; decision: string; price?: number }) =>
      buybackApi.review(id, { decision, finalBuybackPrice: price }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["franchise-buybacks"] });
      toast.success("Décision enregistrée");
      setReviewing(null);
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Demandes de rachat</h1>
        <p className="text-dark-400 mt-1">{requests?.length ?? 0} demandes reçues</p>
      </div>

      <div className="space-y-4">
        {requests?.map((req: any) => (
          <div key={req.id} className={`card ${req.isFlagged ? "border-red-500/30 bg-red-500/5" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-dark-50">
                    {req.model.brand.name} {req.model.name}
                  </span>
                  <span className={`badge text-xs ${req.isFlagged ? "bg-red-500/20 text-red-400" : "bg-dark-700 text-dark-300"}`}>
                    État {req.condition} – {CONDITION_LABELS[req.condition]?.label}
                  </span>
                  {req.isFlagged && (
                    <span className="badge bg-red-500/20 text-red-400 text-xs flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Signalé
                    </span>
                  )}
                </div>
                <p className="text-sm text-dark-400">
                  {req.customer.firstName} {req.customer.lastName} · {req.customer.email}
                </p>
                <p className="text-xs text-dark-500 mt-1">{formatDate(req.createdAt)} · {req.deliveryMethod === "DROP_IN_STORE" ? "Dépôt en franchise" : "Enlèvement"}</p>
                {req.description && (
                  <p className="text-xs text-dark-400 mt-2 italic">&ldquo;{req.description}&rdquo;</p>
                )}
                <div className="mt-3 flex items-center gap-4 text-sm">
                  <span className="text-dark-400">Estimation IA:</span>
                  <span className="font-bold text-gold-400">{formatPrice(req.estimatedBuybackPrice ?? 0)}</span>
                  <span className="text-dark-500">
                    (revente {formatPrice(req.estimatedResaleMin ?? 0)} – {formatPrice(req.estimatedResaleMax ?? 0)})
                  </span>
                </div>
              </div>

              {req.status === "PENDING" && (
                <div className="flex items-center gap-2">
                  <button
                    className="btn-secondary py-2 px-3 text-xs flex items-center gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
                    onClick={() => reviewMutation.mutate({ id: req.id, decision: "REJECTED" })}
                    disabled={reviewMutation.isPending}
                  >
                    <XCircle className="h-4 w-4" />
                    Refuser
                  </button>
                  <button
                    className="btn-primary py-2 px-3 text-xs flex items-center gap-1"
                    onClick={() => reviewMutation.mutate({ id: req.id, decision: "ACCEPTED" })}
                    disabled={reviewMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Accepter
                  </button>
                </div>
              )}

              {req.status !== "PENDING" && (
                <span className={`badge text-xs ${
                  req.status === "ACCEPTED" ? "badge-green" :
                  req.status === "REJECTED" ? "badge-red" :
                  req.status === "COMPLETED" ? "badge-blue" : "bg-dark-700 text-dark-300"
                }`}>
                  {req.status === "ACCEPTED" ? "Accepté" :
                   req.status === "REJECTED" ? "Refusé" :
                   req.status === "COMPLETED" ? "Terminé" : req.status}
                </span>
              )}
            </div>
          </div>
        ))}

        {requests?.length === 0 && (
          <div className="card text-center py-16 text-dark-400">
            <Package className="h-10 w-10 mx-auto mb-4 opacity-50" />
            <p>Aucune demande de rachat pour le moment</p>
          </div>
        )}
      </div>
    </div>
  );
}
