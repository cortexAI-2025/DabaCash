import { strict as assert } from "assert";
import { randomBytes } from "crypto";
import { test } from "node:test";
import { validateEnv } from "./env.validation";

const secret = () => randomBytes(32).toString("hex");
const good = () => ({ DATABASE_URL: "postgresql://u:p@db/dabacash", JWT_SECRET: secret(), JWT_REFRESH_SECRET: secret() });
const prod = () => ({ ...good(), NODE_ENV: "production", CORS_ORIGINS: "https://app.dabacash.ma", WEB_URL: "https://dabacash.ma", BCRYPT_ROUNDS: "12" });
const fails = (env: Record<string, unknown>, re: RegExp) => assert.throws(() => validateEnv(env), re);

test("accepts a sound development configuration", () => {
  assert.doesNotThrow(() => validateEnv(good()));
});

test("refuses to boot without a database or with weak / missing / placeholder secrets", () => {
  fails({ ...good(), DATABASE_URL: "" }, /DATABASE_URL/);
  fails({ ...good(), JWT_SECRET: undefined }, /JWT_SECRET must be at least 32/);
  fails({ ...good(), JWT_SECRET: "short" }, /JWT_SECRET must be at least 32/);
  fails({ ...good(), JWT_REFRESH_SECRET: "x".repeat(10) }, /JWT_REFRESH_SECRET/);
  fails({ ...good(), JWT_SECRET: "your-super-secret-jwt-key-min-32-chars" }, /placeholder/);
  fails({ ...good(), JWT_REFRESH_SECRET: "change-me-change-me-change-me-change-me" }, /placeholder/);
});

test("the access and refresh secrets must differ", () => {
  const s = secret();
  fails({ ...good(), JWT_SECRET: s, JWT_REFRESH_SECRET: s }, /must be different/);
});

test("reports every problem at once, not one per restart", () => {
  try {
    validateEnv({});
    assert.fail("should have thrown");
  } catch (e) {
    const m = (e as Error).message;
    assert.match(m, /DATABASE_URL/);
    assert.match(m, /JWT_SECRET/);
    assert.match(m, /JWT_REFRESH_SECRET/);
  }
});

test("bcrypt cost must be sane", () => {
  fails({ ...good(), BCRYPT_ROUNDS: "2" }, /BCRYPT_ROUNDS/);
  fails({ ...good(), BCRYPT_ROUNDS: "abc" }, /BCRYPT_ROUNDS/);
  assert.doesNotThrow(() => validateEnv({ ...good(), BCRYPT_ROUNDS: "4" }));
});

test("production accepts a complete configuration", () => {
  assert.doesNotThrow(() => validateEnv(prod()));
});

test("production demands an explicit CORS allow-list without wildcards", () => {
  fails({ ...prod(), CORS_ORIGINS: "" }, /CORS_ORIGINS is required/);
  fails({ ...prod(), CORS_ORIGINS: undefined }, /CORS_ORIGINS is required/);
  fails({ ...prod(), CORS_ORIGINS: "*" }, /wildcard/);
  fails({ ...prod(), CORS_ORIGINS: "https://a.ma,*" }, /wildcard/);
});

test("production forbids disabling the rate limiter, weak hashing, and a non-https web URL", () => {
  fails({ ...prod(), THROTTLE_DISABLED: "true" }, /THROTTLE_DISABLED/);
  fails({ ...prod(), BCRYPT_ROUNDS: "8" }, /BCRYPT_ROUNDS must be >= 10/);
  fails({ ...prod(), WEB_URL: "http://dabacash.ma" }, /WEB_URL must be an https/);
});

test("a live payment key requires the webhook secret", () => {
  fails({ ...prod(), ASLAN_SECRET_KEY: "sk_live_abc_def" }, /ASLAN_WEBHOOK_SECRET/);
  assert.doesNotThrow(() => validateEnv({ ...prod(), ASLAN_SECRET_KEY: "sk_live_abc_def", ASLAN_WEBHOOK_SECRET: "whsec_" + secret() }));
  assert.doesNotThrow(() => validateEnv({ ...prod(), ASLAN_SECRET_KEY: "sk_test_abc_def" }));
});
