"use client";

import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { apiMessage } from "@/lib/errors";

interface Props {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyHint?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}

/** The three states every data view must handle: loading, failed (with retry), empty. */
export function QueryState({ isLoading, isError, error, isEmpty, emptyTitle = "Rien à afficher pour le moment", emptyHint, onRetry, children }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-gold-500" aria-hidden />
        <span className="sr-only">Chargement…</span>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="card flex flex-col items-center gap-3 py-12 text-center" role="alert">
        <AlertCircle className="h-8 w-8 text-red-400" aria-hidden />
        <p className="text-dark-200">{apiMessage(error)}</p>
        {onRetry && <button className="btn-secondary px-4 py-2 text-sm" onClick={onRetry}>Réessayer</button>}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="card flex flex-col items-center gap-2 py-14 text-center text-dark-400">
        <Inbox className="h-9 w-9 opacity-50" aria-hidden />
        <p className="font-medium text-dark-200">{emptyTitle}</p>
        {emptyHint && <p className="text-sm">{emptyHint}</p>}
      </div>
    );
  }
  return <>{children}</>;
}
