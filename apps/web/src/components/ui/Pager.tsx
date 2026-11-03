"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pager({ page, totalPages, total, onChange }: { page: number; totalPages: number; total?: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return total !== undefined ? <p className="mt-3 text-xs text-dark-500">{total} résultat{total > 1 ? "s" : ""}</p> : null;
  return (
    <nav className="mt-6 flex items-center justify-between gap-4" aria-label="Pagination">
      <button className="btn-secondary px-3 py-2 text-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-4 w-4" aria-hidden /> Précédent
      </button>
      <span className="text-sm text-dark-400" aria-live="polite">
        Page {page} / {totalPages}{total !== undefined && ` · ${total} résultats`}
      </span>
      <button className="btn-secondary px-3 py-2 text-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Suivant <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}
