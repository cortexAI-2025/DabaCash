import { isAxiosError } from "axios";

/** A message a person can act on, whatever went wrong. Never a stack trace, never an HTTP status code alone. */
export function apiMessage(err: unknown, fallback = "Une erreur est survenue. Veuillez réessayer."): string {
  if (!isAxiosError(err)) return fallback;
  if (!err.response) return "Impossible de joindre le serveur. Vérifiez votre connexion.";
  const { status, data } = err.response;
  const m = data?.message;
  const text = Array.isArray(m) ? m[0] : typeof m === "string" ? m : undefined;

  if (status === 429) return "Trop de tentatives. Patientez quelques instants avant de réessayer.";
  if (status === 401) return text ?? "Session expirée. Veuillez vous reconnecter.";
  if (status === 403) return "Vous n'avez pas l'autorisation d'effectuer cette action.";
  if (status === 404) return text ?? "Élément introuvable.";
  if (status >= 500) return "Le service rencontre un problème. Réessayez dans un instant.";
  return text ?? fallback;
}

export const errorStatus = (err: unknown): number | undefined => (isAxiosError(err) ? err.response?.status : undefined);
