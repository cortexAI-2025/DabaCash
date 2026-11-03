"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const q = useQuery({
    queryKey: ["admin-audit", page, action, entity],
    queryFn: () => adminApi.getAudit({ page, limit: 25, action: action.trim().toUpperCase(), entity: entity.trim() }).then((r) => r.data),
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Journal d&apos;audit</h1>
        <p className="mt-1 text-dark-400">Actions sensibles, en lecture seule et non modifiables.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="a-action">Action</label><input id="a-action" className="input" placeholder="ex. ROLE_CHANGED" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} /></div>
        <div><label className="label" htmlFor="a-entity">Entité</label><input id="a-entity" className="input" placeholder="ex. User, Order" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} /></div>
      </div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={q.data?.items.length === 0} emptyTitle="Aucune entrée" onRetry={() => q.refetch()}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-800"><tr>
              {["Date", "Acteur", "Action", "Entité", "Détails"].map((h) => <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-dark-800">
              {q.data?.items.map((a: any) => (
                <tr key={a.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-dark-300">{formatDate(a.createdAt)}</td>
                  <td className="px-4 py-3 text-dark-200">{a.actor?.email ?? "système"}{a.actorRole && <span className="ml-1 text-xs text-dark-500">({a.actorRole})</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gold-400">{a.action}</td>
                  <td className="px-4 py-3 text-dark-300">{a.entity}{a.entityId && <span className="block font-mono text-xs text-dark-500">{a.entityId.slice(-10)}</span>}</td>
                  <td className="max-w-xs px-4 py-3 font-mono text-xs text-dark-400"><div className="line-clamp-3 break-all">{a.metadata ? JSON.stringify(a.metadata) : "—"}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
      </QueryState>
    </div>
  );
}
