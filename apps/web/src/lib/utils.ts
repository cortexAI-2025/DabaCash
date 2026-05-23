import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number, currency = "MAD") {
  return new Intl.NumberFormat("fr-MA", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fr-MA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export const CONDITION_LABELS: Record<string, { label: string; color: string; description: string }> = {
  A: { label: "Excellent", color: "text-emerald-400", description: "Comme neuf, aucun défaut visible" },
  B: { label: "Bon état", color: "text-blue-400", description: "Légères traces d'usure" },
  C: { label: "État correct", color: "text-yellow-400", description: "Usure visible mais fonctionnel" },
  D: { label: "Mauvais état", color: "text-red-400", description: "Défauts importants, fonctionnel" },
};

export const DEVICE_TYPE_ICONS: Record<string, string> = {
  PHONE: "📱",
  LAPTOP: "💻",
  TV: "📺",
  TABLET: "📋",
  ACCESSORY: "🎧",
  OTHER: "📦",
};
