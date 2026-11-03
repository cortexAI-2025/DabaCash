"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { apiMessage } from "@/lib/errors";
import { formatDate } from "@/lib/utils";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

const IMEI = /^\d{15}$/;

export default function AdminImeiPage() {
  const qc = useQueryClient();
  const [imei, setImei] = useState("");
  const [lookup, setLookup] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);

  const found = useQuery({ queryKey: ["admin-imei", lookup], queryFn: () => adminApi.lookupImei(lookup!).then((r) => r.data), enabled: !!lookup });
  const list = useQuery({ queryKey: ["admin-blocklist", page], queryFn: () => adminApi.getBlocklist({ page, limit: 10 }).then((r) => r.data) });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-imei"] }); qc.invalidateQueries({ queryKey: ["admin-blocklist"] }); };
  const block = useMutation({ mutationFn: () => adminApi.blockImei(lookup!, reason.trim()), onSuccess: () => { toast.success("IMEI bloqué"); setReason(""); refresh(); }, onError: (e) => toast.error(apiMessage(e)) });
  const unblock = useMutation({ mutationFn: (i: string) => adminApi.unblockImei(i), onSuccess: () => { toast.success("IMEI débloqué"); refresh(); }, onError: (e) => toast.error(apiMessage(e)) });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-dark-50">IMEI</h1>
        <p className="mt-1 text-dark-400">Recherche d&apos;un appareil et liste de blocage. Un IMEI bloqué rend toute nouvelle demande suspecte ; la décision reste humaine.</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (IMEI.test(imei)) setLookup(imei); }}>
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="imei-in">IMEI (15 chiffres)</label>
          <input id="imei-in" className="input font-mono" inputMode="numeric" maxLength={15} value={imei} onChange={(e) => setImei(e.target.value.replace(/\D/g, ""))} aria-invalid={imei.length > 0 && !IMEI.test(imei)} />
        </div>
        <button className="btn-primary" disabled={!IMEI.test(imei)}>Rechercher</button>
      </form>

      {lookup && (
        <QueryState isLoading={found.isLoading} isError={found.isError} error={found.error} onRetry={() => found.refetch()}>
          {found.data && (
            <div className="card space-y-4">
              <h2 className="font-mono text-lg font-bold text-dark-50">{found.data.imei}</h2>
              {found.data.blocked ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">
                  <span className="text-red-300">Bloqué : {found.data.blocked.reason}</span>
                  <button className="btn-secondary px-3 py-1.5 text-xs" disabled={unblock.isPending} onClick={() => unblock.mutate(found.data.imei)}>Débloquer</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="label" htmlFor="block-reason">Bloquer cet IMEI — motif (5 caractères minimum)</label>
                  <input id="block-reason" className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn-secondary text-red-300" disabled={reason.trim().length < 5 || block.isPending} onClick={() => block.mutate()}>Ajouter à la liste de blocage</button>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-dark-200">Demandes portant cet IMEI ({found.data.requests.length})</h3>
                {found.data.requests.length === 0 ? <p className="text-sm text-dark-400">Aucune.</p> : (
                  <ul className="divide-y divide-dark-800 text-sm">
                    {found.data.requests.map((r: any) => (
                      <li key={r.id} className="py-2 text-dark-300">{formatDate(r.createdAt)} · {r.model.brand.name} {r.model.name} · {r.customer.email} · {r.status}{r.isFlagged ? " · signalée" : ""}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </QueryState>
      )}

      <section aria-labelledby="bl-h">
        <h2 id="bl-h" className="mb-3 text-lg font-bold text-dark-50">Liste de blocage</h2>
        <QueryState isLoading={list.isLoading} isError={list.isError} error={list.error} isEmpty={list.data?.items.length === 0} emptyTitle="Aucun IMEI bloqué" onRetry={() => list.refetch()}>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-dark-800"><tr>{["IMEI", "Motif", "Ajouté le", "Par"].map((h) => <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-dark-800">
                {list.data?.items.map((b: any) => (
                  <tr key={b.imei}><td className="px-4 py-3 font-mono text-dark-100">{b.imei}</td><td className="px-4 py-3 text-dark-300">{b.reason}</td><td className="px-4 py-3 text-dark-300">{formatDate(b.createdAt)}</td><td className="px-4 py-3 text-dark-300">{b.createdBy ? `${b.createdBy.firstName} ${b.createdBy.lastName}` : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data && <Pager page={page} totalPages={list.data.pagination.totalPages} total={list.data.pagination.total} onChange={setPage} />}
        </QueryState>
      </section>
    </div>
  );
}
