"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { formatDate, formatPrice, CONDITION_LABELS } from "@/lib/utils";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function FraudPage() {
  const { data: flagged, isLoading } = useQuery({
    queryKey: ["admin-fraud"],
    queryFn: () => adminApi.getFlagged().then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-dark-50">Détection de fraude</h1>
          <p className="text-dark-400 mt-0.5">{flagged?.length ?? 0} demandes signalées</p>
        </div>
      </div>

      <div className="space-y-4">
        {flagged?.map((req: any) => (
          <div key={req.id} className="card border-red-500/30 bg-red-500/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-dark-50">
                    {req.model.brand.name} {req.model.name}
                  </span>
                  <span className="badge bg-dark-700 text-dark-300 text-xs">
                    État {req.condition} – {CONDITION_LABELS[req.condition]?.label}
                  </span>
                </div>
                <p className="text-sm text-dark-300">{req.customer.firstName} {req.customer.lastName} · {req.customer.email}</p>
                <p className="text-xs text-dark-400 mt-1">{formatDate(req.createdAt)}</p>
                {req.franchise && (
                  <p className="text-xs text-dark-400 mt-1">Franchise: {req.franchise.name}</p>
                )}
                {req.imei && (
                  <p className="text-xs text-dark-400 mt-1">IMEI: <span className="font-mono">{req.imei}</span></p>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm text-dark-400 mb-1">Score de risque</div>
                <div className={`text-2xl font-black ${(req.fraudScore ?? 0) > 0.7 ? "text-red-400" : "text-yellow-400"}`}>
                  {Math.round((req.fraudScore ?? 0) * 100)}%
                </div>
                <div className="text-xs text-dark-500 mt-1">
                  Estimation: {formatPrice(req.estimatedBuybackPrice ?? 0)}
                </div>
              </div>
            </div>
          </div>
        ))}

        {flagged?.length === 0 && (
          <div className="card text-center py-16 text-dark-400">
            <div className="text-4xl mb-4">✅</div>
            <p>Aucune demande suspecte détectée</p>
          </div>
        )}
      </div>
    </div>
  );
}
