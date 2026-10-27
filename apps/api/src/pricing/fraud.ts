import { Condition, DeviceType } from "@dabacash/database";

/** Requests scoring at or above this are held for admin review before a franchise may decide. */
export const FLAG_THRESHOLD = 0.5;

export interface FraudSignals {
  condition: Condition;
  deviceType: DeviceType;
  /** Years since the model's release; null when the catalogue has no release year. */
  ageYears: number | null;
  imei?: string | null;
  /** Another live (pending/accepted) request already carries this IMEI. */
  imeiSeenElsewhere: boolean;
  /** Requests by this customer in the last 24 h, including the current one. */
  requestsLast24h: number;
  accountAgeHours: number;
  estimatedPrice: number;
}

export interface FraudResult {
  score: number;
  reasons: string[];
}

/** 15-digit IMEI with a valid Luhn check digit. */
export function isValidImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(imei[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Additive rule score in [0, 1]. Each rule explains itself so an admin can see why a
 * request was held; a duplicate IMEI alone is enough to flag (stolen / double-sold device).
 */
export function scoreFraud(s: FraudSignals): FraudResult {
  let score = 0;
  const reasons: string[] = [];
  const add = (weight: number, reason: string) => {
    score += weight;
    reasons.push(reason);
  };

  const imei = s.imei?.trim();
  if (imei) {
    if (!isValidImei(imei)) add(0.4, "IMEI invalide (format ou clé de contrôle)");
    if (s.imeiSeenElsewhere) add(0.6, "IMEI déjà présent dans une autre demande en cours");
  } else if (s.deviceType === DeviceType.PHONE) {
    add(0.1, "IMEI non fourni pour un téléphone");
  }

  if (s.ageYears !== null) {
    if (s.ageYears < 0 || s.ageYears > 10) add(0.3, `Âge du modèle incohérent (${s.ageYears} ans)`);
    else if (s.condition === Condition.A && s.ageYears >= 4) {
      add(0.3, `État A déclaré sur un appareil de ${s.ageYears} ans`);
    }
  }

  if (s.requestsLast24h >= 5) add(0.4, `${s.requestsLast24h} demandes en 24 h`);
  else if (s.requestsLast24h >= 3) add(0.25, `${s.requestsLast24h} demandes en 24 h`);

  if (s.accountAgeHours < 1 && s.estimatedPrice >= 8000) {
    add(0.2, "Compte créé il y a moins d'une heure, appareil de forte valeur");
  }

  return { score: Math.round(Math.min(score, 1) * 100) / 100, reasons };
}
