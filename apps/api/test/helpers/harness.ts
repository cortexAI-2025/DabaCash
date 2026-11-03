import { createHmac, randomBytes } from "crypto";
import { INestApplication } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { demoEmail, seedDemo } from "@dabacash/database";
import type { PrismaService } from "../../src/common/prisma/prisma.service";
import { ASLAN_KEY, FakeAslan, FakeResend, RESEND_KEY, startFakeAslan, startFakeResend } from "./fakes";

/** Test-only credential for the fictitious demo accounts. Not a secret: it only exists in test databases. */
export const TEST_PASSWORD = "Test-Passw0rd-2024";
export const ASLAN_WEBHOOK_SECRET = "whsec_" + randomBytes(16).toString("hex");

export interface Res<T = any> { status: number; body: T; headers: Headers }
export interface CallOpts { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string }

export interface Harness {
  app: INestApplication;
  prisma: PrismaService;
  url: string;
  aslan: FakeAslan;
  resend: FakeResend;
  call(method: string, path: string, opts?: CallOpts): Promise<Res>;
  /** Logs a demo account in and returns its tokens. */
  login(local: string, password?: string): Promise<{ accessToken: string; refreshToken: string; role: string }>;
  /** Registers a fresh customer and returns their tokens + id. */
  newCustomer(name: string): Promise<{ email: string; accessToken: string; refreshToken: string; id: string }>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function startHarness(opts: { throttle?: boolean; env?: Record<string, string | undefined> } = {}): Promise<Harness> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must point at a disposable PostgreSQL database for the integration tests (its content is wiped).");
  }
  const aslan = await startFakeAslan();
  const resend = await startFakeResend();

  Object.assign(process.env, {
    NODE_ENV: "test",
    DIRECT_URL: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    JWT_SECRET: randomBytes(32).toString("hex"),
    JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
    BCRYPT_ROUNDS: "4",
    THROTTLE_DISABLED: opts.throttle ? "false" : "true",
    ASLAN_SECRET_KEY: ASLAN_KEY,
    ASLAN_WEBHOOK_SECRET,
    ASLAN_API_URL: aslan.url,
    WEB_URL: "https://dabacash.test",
    RESEND_API_KEY: RESEND_KEY,
    RESEND_API_URL: resend.url,
    CORS_ORIGINS: "https://app.dabacash.test",
    ENABLE_SWAGGER: "false",
    ...opts.env,
  });
  for (const [k, v] of Object.entries(opts.env ?? {})) if (v === undefined) delete process.env[k];

  // Imported only now: the config module validates process.env at import time, so the test
  // environment above must already be in place. One process per test file keeps this isolated.
  const { AppModule } = await import("../../src/app.module");
  const { configureApp } = await import("../../src/app.setup");
  const { PrismaService: Prisma } = await import("../../src/common/prisma/prisma.service");

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, logger: ["error"] });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const url = `http://127.0.0.1:${(app.getHttpServer().address() as any).port}`;
  const prisma = app.get(Prisma);

  const call: Harness["call"] = async (method, path, o = {}) => {
    const res = await fetch(`${url}/api/v1${path}`, {
      method,
      headers: { ...(o.body !== undefined || o.raw !== undefined ? { "content-type": "application/json" } : {}), ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), ...o.headers },
      body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
    });
    const text = await res.text();
    let body: any = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    return { status: res.status, body, headers: res.headers };
  };

  const h: Harness = {
    app, prisma, url, aslan, resend, call,
    async login(local, password = TEST_PASSWORD) {
      const r = await call("POST", "/auth/login", { body: { email: demoEmail(local), password } });
      if (r.status !== 200) throw new Error(`login ${local} failed: ${r.status} ${JSON.stringify(r.body)}`);
      return r.body;
    },
    async newCustomer(name) {
      const email = `${name}-${randomBytes(3).toString("hex")}@test.dabacash.test`;
      const r = await call("POST", "/auth/register", { body: { email, password: TEST_PASSWORD, firstName: name, lastName: "Test" } });
      if (r.status !== 201) throw new Error(`register failed: ${r.status} ${JSON.stringify(r.body)}`);
      return { email, accessToken: r.body.accessToken, refreshToken: r.body.refreshToken, id: r.body.user.id };
    },
    async reset() {
      const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
      await seedDemo(prisma, { password: TEST_PASSWORD, rounds: 4 });
      aslan.reset();
      resend.reset();
    },
    async close() {
      await app.close();
      await aslan.close();
      await resend.close();
    },
  };
  await h.reset();
  return h;
}

/** Builds a webhook request the way Aslan signs it: HMAC-SHA256 over `${t}.${rawBody}`. */
export function signedWebhook(event: unknown, o: { secret?: string; t?: number } = {}) {
  const raw = JSON.stringify(event);
  const t = o.t ?? Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", o.secret ?? ASLAN_WEBHOOK_SECRET).update(`${t}.${raw}`).digest("hex");
  return { raw, headers: { "x-webhook-signature": `t=${t},v1=${v1}` } };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function waitFor<T>(fn: () => T | Promise<T>, ms = 3000): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(40); }
  return undefined;
}
