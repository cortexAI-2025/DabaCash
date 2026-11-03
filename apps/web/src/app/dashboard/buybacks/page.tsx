"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { buybackApi } from "@/lib/api";
import { formatPrice, formatDate, CONDITION_LABELS } from "@/lib/utils";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { apiMessage } from "@/lib/errors";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";
import toast from "react-hot-toast";
import { useState } from "react";

export default function BuybacksPage() {
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["franchise-buybacks", page],
    queryFn: () => buybackApi.getFranchise({ page, limit: 10 }).then((r) => r.data),
  });
  const requests = q.data?.items;

  const completeMutation = useMutation({
    mutationFn: (id: string) => buybackApi.complete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["franchise-buybacks"] }); toast.success("Rachat finalisé"); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, price, note }: { id: string; decision: string; price?: number; note?: string }) =>
      buybackApi.review(id, { decision, ...(price !== undefined && { finalBuybackPrice: price }), ...(note && { franchiseNotes: note }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["franchise-buybacks"] });
      toast.success("Décision enregistrée");
      setReviewing(null); setPrice(""); setNote("");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Demandes de rachat</h1>
        <p className="text-dark-400 mt-1">{q.data?.pagination.total ?? 0} demandes reçues</p>
      </div>

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={requests?.length === 0} emptyTitle="Aucune demande de rachat pour le moment" onRetry={() => q.refetch()}>
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
                    onClick={() => { setReviewing(reviewing === req.id ? null : req.id); setPrice(String(req.estimatedBuybackPrice ?? "")); setNote(""); }}
                    disabled={reviewMutation.isPending || (req.isFlagged && !req.fraudResolution)}
                    title={req.isFlagged && !req.fraudResolution ? "En attente de vérification par l'administration" : undefined}
                  >
                    <CheckCircle className="h-4 w-4" />
                    Accepter
                  </button>
                </div>
              )}
              {req.status === "ACCEPTED" && (
                <button className="btn-primary px-3 py-2 text-xs" disabled={completeMutation.isPending}
                  onClick={() => { if (window.confirm("Confirmer que l'appareil a été reçu et payé ?")) completeMutation.mutate(req.id); }}>
                  Finaliser le rachat
                </button>
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
            {req.isFlagged && !req.fraudResolution && (
              <p className="mt-3 text-xs text-red-300" role="status">Cette demande est en cours de vérification par l&apos;administration : vous pourrez la traiter une fois validée.</p>
            )}
            {reviewing === req.id && (
              <div className="mt-4 grid gap-3 rounded-xl border border-dark-700 p-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`price-${req.id}`}>Prix final (MAD, entier)</label>
                  <input id={`price-${req.id}`} className="input" type="number" min={0} step={1} value={price} onChange={(e) => setPrice(e.target.value)} />
                  <p className="mt-1 text-xs text-dark-500">Un écart de plus de 50 % avec l&apos;estimation exige une note.</p>
                </div>
                <div>
                  <label className="label" htmlFor={`note-${req.id}`}>Note (facultative)</label>
                  <textarea id={`note-${req.id}`} className="input min-h-[60px] resize-none" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2 sm:col-span-2">
                  <button className="btn-ghost text-xs" onClick={() => setReviewing(null)}>Annuler</button>
                  <button className="btn-primary px-3 py-2 text-xs" disabled={reviewMutation.isPending || !/^\d+$/.test(price)}
                    onClick={() => reviewMutation.mutate({ id: req.id, decision: "ACCEPTED", price: Number(price), note: note.trim() || undefined })}>
                    Confirmer l&apos;achat
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

      </div>
      {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
      </QueryState>
    </div>
  );
}
