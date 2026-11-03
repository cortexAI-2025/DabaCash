/**
 * Fails fast at boot on missing or unsafe configuration, instead of starting an API that
 * signs tokens with an empty secret or accepts any origin.
 */
const PLACEHOLDER = /your-|change-?me|secret-jwt-key|example|password/i;

export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const str = (k: string) => (typeof env[k] === "string" ? (env[k] as string).trim() : "");
  const prod = str("NODE_ENV") === "production";

  if (!str("DATABASE_URL")) errors.push("DATABASE_URL is required");

  for (const k of ["JWT_SECRET", "JWT_REFRESH_SECRET"]) {
    const v = str(k);
    if (v.length < 32) errors.push(`${k} must be at least 32 characters (generate one with: openssl rand -base64 48)`);
    else if (PLACEHOLDER.test(v)) errors.push(`${k} looks like a placeholder: set a real random secret`);
  }
  if (str("JWT_SECRET") && str("JWT_SECRET") === str("JWT_REFRESH_SECRET")) {
    errors.push("JWT_SECRET and JWT_REFRESH_SECRET must be different");
  }

  const rounds = Number(str("BCRYPT_ROUNDS") || 12);
  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) errors.push("BCRYPT_ROUNDS must be an integer between 4 and 15");

  if (prod) {
    if (rounds < 10) errors.push("BCRYPT_ROUNDS must be >= 10 in production");
    if (!str("CORS_ORIGINS")) errors.push("CORS_ORIGINS is required in production (comma-separated list of allowed web origins)");
    if (str("CORS_ORIGINS").includes("*")) errors.push("CORS_ORIGINS must not contain a wildcard");
    if (str("THROTTLE_DISABLED") === "true") errors.push("THROTTLE_DISABLED must not be true in production");
    if (str("WEB_URL") && !str("WEB_URL").startsWith("https://")) errors.push("WEB_URL must be an https:// URL in production");
    if (str("ASLAN_SECRET_KEY").startsWith("sk_live_") && !str("ASLAN_WEBHOOK_SECRET")) {
      errors.push("ASLAN_WEBHOOK_SECRET is required when a live Aslan key is configured");
    }
  }

  if (errors.length) throw new Error(`Invalid environment configuration:\n - ${errors.join("\n - ")}`);
  return env;
}

export const isProd = () => process.env.NODE_ENV === "production";
