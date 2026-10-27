import { strict as assert } from "assert";
import { afterEach, test } from "node:test";
import { NotificationsService } from "./notifications.service";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function setup(env: Record<string, string> = {}, opts: { user?: boolean; dbFails?: boolean } = {}) {
  const created: any[] = [];
  const prisma: any = {
    user: { findUnique: async () => (opts.user === false ? null : { email: "client@test.ma", firstName: "Yous<sef" }) },
    notification: {
      create: async (arg: any) => {
        if (opts.dbFails) throw new Error("db down");
        created.push(arg.data);
      },
    },
  };
  const config: any = { get: (k: string) => env[k] };
  return { svc: new NotificationsService(prisma, config), created };
}

const notice = { title: "Paiement reçu", body: "Total <b>500</b> MAD", type: "order_update" as const };

test("stores the notification and skips email when no provider key is set", async () => {
  let called = false;
  globalThis.fetch = (async () => ((called = true), new Response("{}"))) as any;
  const { svc, created } = setup();
  await svc.notify("u1", notice);
  assert.equal(created.length, 1);
  assert.equal(called, false);
});

test("sends an escaped email through Resend when configured", async () => {
  let url = "", init: any;
  globalThis.fetch = (async (u: string, i: any) => ((url = u), (init = i), new Response("{}", { status: 200 }))) as any;
  const { svc } = setup({ RESEND_API_KEY: "re_test", RESEND_API_URL: "http://mail.test", EMAIL_FROM: "DabaCash <n@dabacash.ma>" });
  await svc.notify("u1", notice);

  assert.equal(url, "http://mail.test/emails");
  assert.equal(init.headers.Authorization, "Bearer re_test");
  const body = JSON.parse(init.body);
  assert.deepEqual(body.to, ["client@test.ma"]);
  assert.equal(body.subject, "Paiement reçu");
  assert.ok(!body.html.includes("<b>500</b>") && body.html.includes("&lt;b&gt;500&lt;/b&gt;"), "body must be HTML-escaped");
  assert.ok(body.html.includes("Yous&lt;sef"), "name must be HTML-escaped");
});

test("never throws when the provider or the database fails", async () => {
  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as any;
  await setup({ RESEND_API_KEY: "k" }).svc.notify("u1", notice);
  globalThis.fetch = (async () => {
    throw new Error("network");
  }) as any;
  await setup({ RESEND_API_KEY: "k" }).svc.notify("u1", notice);
  await setup({}, { dbFails: true }).svc.notify("u1", notice);
  await setup({}, { user: false }).svc.notify("ghost", notice);
});
