"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Loader2, CheckCircle, XCircle, Store } from "lucide-react";
import toast from "react-hot-toast";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Actif", cls: "badge-green" },
  PENDING: { label: "En attente", cls: "badge-gold" },
  SUSPENDED: { label: "Suspendu", cls: "badge-red" },
  CLOSED: { label: "Fermé", cls: "bg-dark-700 text-dark-400" },
};

export default function AdminFranchisesPage() {
  const qc = useQueryClient();

  const { data: franchises, isLoading } = useQuery({
    queryKey: ["admin-franchises"],
    queryFn: () => adminApi.getFranchises().then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => adminApi.updateFranchise(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-franchises"] }); toast.success("Mis à jour"); },
    onError: () => toast.error("Erreur"),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-dark-50">Gestion des franchises</h1>
        <p className="text-dark-400 mt-1">{franchises?.length ?? 0} franchises enregistrées</p>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-dark-800">
            <tr>
              {["Franchise", "Propriétaire", "Ville", "Statut", "Commission", "Ventes", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-dark-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800">
            {franchises?.map((f: any) => {
              const s = STATUS_LABELS[f.status] ?? { label: f.status, cls: "bg-dark-700 text-dark-400" };
              return (
                <tr key={f.id} className="hover:bg-dark-800/50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="font-medium text-dark-100">{f.name}</div>
                    <div className="text-xs text-dark-400">{f.slug}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-dark-200">{f.owner.firstName} {f.owner.lastName}</div>
                    <div className="text-xs text-dark-400">{f.owner.email}</div>
                  </td>
                  <td className="px-4 py-4 text-dark-300">{f.city}</td>
                  <td className="px-4 py-4">
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-4 text-dark-200">{Math.round(f.commissionRate * 100)}%</td>
                  <td className="px-4 py-4 text-dark-200">{f._count?.orders ?? 0}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      {f.status !== "ACTIVE" && (
                        <button
                          className="btn-ghost py-1 px-2 text-xs text-emerald-400"
                          onClick={() => updateMutation.mutate({ id: f.id, data: { status: "ACTIVE" } })}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}
                      {f.status === "ACTIVE" && (
                        <button
                          className="btn-ghost py-1 px-2 text-xs text-red-400"
                          onClick={() => updateMutation.mutate({ id: f.id, data: { status: "SUSPENDED" } })}
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {franchises?.length === 0 && (
          <div className="py-16 text-center text-dark-400">
            <Store className="h-10 w-10 mx-auto mb-4 opacity-50" />
            <p>Aucune franchise enregistrée</p>
          </div>
        )}
      </div>
    </div>
  );
}
