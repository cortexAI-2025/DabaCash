import { createServer, IncomingMessage, Server } from "http";

export interface FakeServer { url: string; close(): Promise<void>; reset(): void }

const listen = (server: Server) =>
  new Promise<string>((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as any).port}`)));
const close = (server: Server) => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });
const readBody = (req: IncomingMessage) => new Promise<string>((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b)); });

export const ASLAN_KEY = "sk_test_demo_key_for_tests";

/** Stands in for POST /checkout/sessions. Honours Idempotency-Key like the real API and records every call. */
export async function startFakeAslan() {
  const calls: { key?: string; body: any }[] = [];
  const byKey = new Map<string, any>();
  let n = 0;
  let failNext = false;

  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    const send = (status: number, body: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
    if (req.method !== "POST" || req.url !== "/pay/api/v1/checkout/sessions") return send(404, {});
    if (req.headers.authorization !== `Bearer ${ASLAN_KEY}`) return send(401, { code: "AUTHENTICATION_ERROR" });
    if (failNext) { failNext = false; return send(502, { code: "PSP_ERROR" }); }

    const key = req.headers["idempotency-key"] as string | undefined;
    const body = JSON.parse(raw);
    calls.push({ key, body });
    if (key && byKey.has(key)) return send(201, byKey.get(key));
    n++;
    const session = { id: `cs_test_${n}`, token: `tok${n}`, url: `https://pay.aslan.ma/cs_test_tok${n}`, amount: body.amount, currency: "MAD", status: "open", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    if (key) byKey.set(key, session);
    send(201, session);
  });
  const url = await listen(server);
  return {
    url: `${url}/pay/api/v1`,
    calls,
    failNext: () => { failNext = true; },
    reset: () => { calls.length = 0; byKey.clear(); n = 0; failNext = false; },
    close: () => close(server),
  };
}

export const RESEND_KEY = "re_test_key_for_tests";

/** Stands in for Resend's POST /emails. Can be switched to fail to prove emails never break business actions. */
export async function startFakeResend() {
  const mails: { to: string[]; subject: string; html: string; from: string }[] = [];
  let failing = false;
  const server = createServer(async (req, res) => {
    const raw = await readBody(req);
    res.setHeader("content-type", "application/json");
    if (req.method !== "POST" || req.url !== "/emails") { res.statusCode = 404; return res.end("{}"); }
    if (req.headers.authorization !== `Bearer ${RESEND_KEY}`) { res.statusCode = 401; return res.end("{}"); }
    if (failing) { res.statusCode = 500; return res.end("{}"); }
    mails.push(JSON.parse(raw));
    res.end(JSON.stringify({ id: `m${mails.length}` }));
  });
  const url = await listen(server);
  return {
    url,
    mails,
    setFailing: (v: boolean) => { failing = v; },
    reset: () => { mails.length = 0; failing = false; },
    close: () => close(server),
  };
}

export type FakeAslan = Awaited<ReturnType<typeof startFakeAslan>>;
export type FakeResend = Awaited<ReturnType<typeof startFakeResend>>;
