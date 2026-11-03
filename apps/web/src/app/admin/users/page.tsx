"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "@/lib/api";
import { apiMessage } from "@/lib/errors";
import { formatDate } from "@/lib/utils";
import { useDebounced } from "@/hooks/useDebounced";
import { QueryState } from "@/components/ui/QueryState";
import { Pager } from "@/components/ui/Pager";

const ROLES = [["CUSTOMER", "Client"], ["FRANCHISE_OWNER", "Franchise"], ["ADMIN", "Admin"]] as const;

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const term = useDebounced(search);

  const q = useQuery({
    queryKey: ["admin-users", page, term, role, status],
    queryFn: () => adminApi.getUsers({ page, limit: 20, search: term, role, status }).then((r) => r.data),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: any; isActive?: boolean } }) => adminApi.updateUser(id, data),
    onSuccess: () => { toast.success("Utilisateur mis à jour"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const unlock = useMutation({
    mutationFn: (id: string) => adminApi.unlockUser(id),
    onSuccess: () => { toast.success("Compte déverrouillé"); qc.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Utilisateurs et rôles</h1>
        <p className="mt-1 text-dark-400">{q.data?.pagination.total ?? 0} comptes · chaque changement est tracé dans le journal d&apos;audit</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="u-search">Recherche</label><input id="u-search" className="input" placeholder="Email ou nom" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <div><label className="label" htmlFor="u-role">Rôle</label>
          <select id="u-role" className="input" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
            <option value="">Tous</option>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="label" htmlFor="u-status">Statut</label>
          <select id="u-status" className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Tous</option><option value="active">Actifs</option><option value="inactive">Désactivés</option><option value="locked">Verrouillés</option><option value="deleted">Supprimés</option>
          </select></div>
      </div>

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} isEmpty={q.data?.items.length === 0} emptyTitle="Aucun utilisateur" onRetry={() => q.refetch()}>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-dark-800"><tr>
              {["Utilisateur", "Rôle", "Statut", "Inscrit le", "Actions"].map((h) => <th key={h} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-dark-400">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-dark-800">
              {q.data?.items.map((u: any) => {
                const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                const deleted = !!u.deletedAt;
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3"><div className="text-dark-100">{u.firstName} {u.lastName}</div><div className="text-xs text-dark-400">{u.email}</div>{u.franchise && <div className="text-xs text-dark-500">{u.franchise.name}</div>}</td>
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`role-${u.id}`}>Rôle de {u.email}</label>
                      <select id={`role-${u.id}`} className="input py-1 text-xs" value={u.role} disabled={deleted || update.isPending}
                        onChange={(e) => { if (window.confirm(`Passer ${u.email} en « ${e.target.value} » ?`)) update.mutate({ id: u.id, data: { role: e.target.value } }); }}>
                        {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {deleted ? <span className="badge bg-dark-700 text-dark-400">Supprimé</span> : !u.isActive ? <span className="badge-red">Désactivé</span> : locked ? <span className="badge-gold">Verrouillé</span> : <span className="badge-green">Actif</span>}
                    </td>
                    <td className="px-4 py-3 text-dark-300">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {!deleted && <button className="btn-ghost px-2 py-1 text-xs" disabled={update.isPending}
                          onClick={() => { if (window.confirm(u.isActive ? `Désactiver ${u.email} ? Ses sessions seront fermées.` : `Réactiver ${u.email} ?`)) update.mutate({ id: u.id, data: { isActive: !u.isActive } }); }}>
                          {u.isActive ? "Désactiver" : "Réactiver"}</button>}
                        {locked && <button className="btn-ghost px-2 py-1 text-xs" disabled={unlock.isPending} onClick={() => unlock.mutate(u.id)}>Déverrouiller</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {q.data && <Pager page={page} totalPages={q.data.pagination.totalPages} total={q.data.pagination.total} onChange={setPage} />}
      </QueryState>
    </div>
  );
}
