"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { cn, formatDate, formatPrice, CONDITION_LABELS } from "@/lib/utils";

type Tab = "open" | "resolved";

function Review({ id, onDone }: { id: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const qc = useQueryClient();

  const resolve = useMutation({
    mutationFn: (body: { resolution: "CLEARED" | "CONFIRMED_FRAUD"; note?: string }) => adminApi.resolveFraud(id, body),
    onSuccess: (_, v) => {
      toast.success(v.resolution === "CLEARED" ? "Demande validée, la franchise peut la traiter" : "Fraude confirmée, demande annulée");
      qc.invalidateQueries({ queryKey: ["admin-fraud"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      onDone();
    },
    onError: (err: any) => toast.error(err.response?.data?.message ?? "Erreur"),
  });

  if (confirming) {
    return (
      <div className="mt-4 space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <label className="label" htmlFor={`note-${id}`}>Note (obligatoire) : pourquoi est-ce une fraude ?</label>
        <textarea id={`note-${id}`} className="input min-h-[70px] resize-none" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirming(false)}>Retour</button>
          <button
            className="btn-primary bg-red-500 text-white hover:bg-red-400"
            disabled={note.trim().length < 5 || resolve.isPending}
            onClick={() => resolve.mutate({ resolution: "CONFIRMED_FRAUD", note: note.trim() })}
          >
            {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldX className="h-4 w-4" />}
            Confirmer la fraude et annuler la demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <button className="btn-secondary px-4 py-2 text-sm text-red-300" onClick={() => setConfirming(true)}>
        <ShieldX className="h-4 w-4" /> Fraude confirmée
      </button>
      <button className="btn-primary px-4 py-2 text-sm" disabled={resolve.isPending} onClick={() => resolve.mutate({ resolution: "CLEARED" })}>
        {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        Demande légitime
      </button>
    </div>
  );
}

export default function FraudPage() {
  const [tab, setTab] = useState<Tab>("open");
  const { data: flagged, isLoading } = useQuery({
    queryKey: ["admin-fraud", tab],
    queryFn: () => adminApi.getFlagged(tab).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-dark-50">Détection de fraude</h1>
          <p className="mt-0.5 text-dark-400">Une demande signalée est bloquée côté franchise tant qu&apos;elle n&apos;est pas validée ici.</p>
        </div>
      </div>

      <div className="flex w-fit rounded-xl border border-dark-700 p-1" role="group" aria-label="Filtre">
        {([["open", "À traiter"], ["resolved", "Traités"]] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", tab === value ? "bg-gold-500/15 text-gold-400" : "text-dark-400 hover:text-dark-200")}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>}

      <div className="space-y-4">
        {flagged?.map((req: any) => {
          const score = Math.round((req.fraudScore ?? 0) * 100);
          const reasons: string[] = Array.isArray(req.fraudReasons) ? req.fraudReasons : [];
          return (
            <div key={req.id} className={cn("card", tab === "open" && "border-red-500/30 bg-red-500/5")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-bold text-dark-50">{req.model.brand.name} {req.model.name}</span>
                    <span className="badge bg-dark-700 text-xs text-dark-300">État {req.condition} – {CONDITION_LABELS[req.condition]?.label}</span>
                  </div>
                  <p className="text-sm text-dark-300">{req.customer.firstName} {req.customer.lastName} · {req.customer.email}</p>
                  <p className="mt-1 text-xs text-dark-400">
                    {formatDate(req.createdAt)}{req.franchise && ` · ${req.franchise.name}`}
                  </p>
                  {req.imei && <p className="mt-1 text-xs text-dark-400">IMEI : <span className="font-mono">{req.imei}</span></p>}
                  {reasons.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-dark-200">
                      {reasons.map((r) => (
                        <li key={r} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-dark-400">Score de risque</div>
                  <div className={cn("text-2xl font-black tabular-nums", score >= 70 ? "text-red-400" : "text-yellow-400")}>{score} %</div>
                  <div className="mt-1 text-xs text-dark-500">Estimation : {formatPrice(req.estimatedBuybackPrice ?? 0)}</div>
                </div>
              </div>

              {tab === "open" ? (
                <Review id={req.id} onDone={() => undefined} />
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dark-800 pt-3 text-sm">
                  {req.fraudResolution === "CLEARED" ? (
                    <span className="badge-green inline-flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Validée</span>
                  ) : (
                    <span className="badge-red inline-flex items-center gap-1"><ShieldX className="h-3 w-3" /> Fraude confirmée</span>
                  )}
                  <span className="text-dark-400">
                    {req.fraudReviewer ? `par ${req.fraudReviewer.firstName} ${req.fraudReviewer.lastName}` : ""}
                    {req.fraudReviewedAt ? ` · ${formatDate(req.fraudReviewedAt)}` : ""}
                  </span>
                  {req.fraudNote && <span className="w-full text-dark-300">« {req.fraudNote} »</span>}
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && flagged?.length === 0 && (
          <div className="card py-16 text-center text-dark-400">
            <ShieldCheck className="mx-auto mb-4 h-10 w-10 opacity-50" />
            <p>{tab === "open" ? "Aucune demande en attente de vérification" : "Aucun signalement traité"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
