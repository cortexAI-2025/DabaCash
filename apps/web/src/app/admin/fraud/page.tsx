"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { apiMessage } from "@/lib/errors";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";
import { cn, formatDate, formatPrice, CONDITION_LABELS } from "@/lib/utils";

type Tab = "open" | "resolved";

function Review({ id, hasImei, onDone }: { id: string; hasImei: boolean; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [blockImei, setBlock] = useState(false);
  const qc = useQueryClient();

  const resolve = useMutation({
    mutationFn: (body: { resolution: "CLEARED" | "CONFIRMED_FRAUD"; note?: string; blockImei?: boolean }) => adminApi.resolveFraud(id, body),
    onSuccess: (_, v) => {
      toast.success(v.resolution === "CLEARED" ? "Demande validée, la franchise peut la traiter" : "Fraude confirmée, demande annulée");
      qc.invalidateQueries({ queryKey: ["admin-fraud"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      onDone();
    },
    onError: (err) => toast.error(apiMessage(err)),
  });

  if (confirming) {
    return (
      <div className="mt-4 space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <label className="label" htmlFor={`note-${id}`}>Note (obligatoire) : pourquoi est-ce une fraude ?</label>
        <textarea id={`note-${id}`} className="input min-h-[70px] resize-none" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        {hasImei && (
          <label className="flex items-center gap-2 text-sm text-dark-300">
            <input type="checkbox" checked={blockImei} onChange={(e) => setBlock(e.target.checked)} /> Ajouter l&apos;IMEI à la liste de blocage
          </label>
        )}
        <p className="text-xs text-dark-500">Cette décision est tracée et réversible (réouverture possible depuis l&apos;onglet « Traités »).</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={() => setConfirming(false)}>Retour</button>
          <button
            className="btn-primary bg-red-500 text-white hover:bg-red-400"
            disabled={note.trim().length < 5 || resolve.isPending}
            onClick={() => resolve.mutate({ resolution: "CONFIRMED_FRAUD", note: note.trim(), ...(blockImei && { blockImei: true }) })}
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

function Reopen({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => adminApi.reopenFraud(id, note.trim()),
    onSuccess: () => { toast.success("Signalement rouvert"); setOpen(false); qc.invalidateQueries({ queryKey: ["admin-fraud"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (!open) return <button className="btn-ghost ml-auto px-3 py-1 text-xs" onClick={() => setOpen(true)}>Rouvrir</button>;
  return (
    <div className="mt-2 w-full space-y-2">
      <label className="label" htmlFor={`reopen-${id}`}>Motif de réouverture (obligatoire)</label>
      <textarea id={`reopen-${id}`} className="input min-h-[60px] resize-none" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button className="btn-ghost text-xs" onClick={() => setOpen(false)}>Annuler</button>
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={note.trim().length < 5 || m.isPending} onClick={() => m.mutate()}>Rouvrir</button>
      </div>
    </div>
  );
}

export default function FraudPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["admin-fraud", tab, page],
    queryFn: () => adminApi.getFlagged({ status: tab, page, limit: 10 }).then((r) => r.data),
  });
  const flagged = q.data?.items;

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
            onClick={() => { setTab(value); setPage(1); }}
            aria-pressed={tab === value}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-medium", tab === value ? "bg-gold-500/15 text-gold-400" : "text-dark-400 hover:text-dark-200")}
          >
            {label}
          </button>
        ))}
      </div>

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={flagged?.length === 0}
        emptyTitle={tab === "open" ? "Aucune demande en attente de vérification" : "Aucun signalement traité"} onRetry={() => q.refetch()}>
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
                <Review id={req.id} hasImei={!!req.imei} onDone={() => undefined} />
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
                  <Reopen id={req.id} />
                  {req.fraudNote && <span className="w-full text-dark-300">« {req.fraudNote} »</span>}
                </div>
              )}
            </div>
          );
        })}

      </div>
      {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
      </QueryState>
    </div>
  );
}
