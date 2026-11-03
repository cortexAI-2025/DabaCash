import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, it } from "node:test";
import { Harness, signedWebhook, startHarness, waitFor } from "./helpers/harness";

describe("payments (Aslan): checkout, signed webhook, idempotency, races", () => {
  let h: Harness;
  let client: string, owner: string, admin: string, iphone: any;

  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });
  beforeEach(async () => {
    await h.reset();
    client = (await h.login("client")).accessToken;
    owner = (await h.login("owner.casablanca")).accessToken;
    admin = (await h.login("admin")).accessToken;
    iphone = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items.find((i: any) => i.title.includes("iPhone 14"));
  });

  const orderOnline = async () =>
    (await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: iphone.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "ASLAN" } })).body;
  const checkout = (orderId: string, token = client) => h.call("POST", "/payments/aslan/checkout", { token, body: { orderId } });
  const payment = (orderId: string) => h.prisma.payment.findUniqueOrThrow({ where: { orderId } });
  const order = (id: string) => h.prisma.order.findUniqueOrThrow({ where: { id } });
  const eventFor = async (o: any, event: string, extra: Record<string, unknown> = {}) => {
    const p = await payment(o.id);
    return { event, data: { id: "txn_1", checkoutSessionId: p.gatewayRef, amount: Math.round(o.totalAmount) * 100, metadata: { orderId: o.id, paymentId: p.id }, ...extra } };
  };
  const hook = async (evt: unknown, opts?: { secret?: string; t?: number }) => {
    const { raw, headers } = signedWebhook(evt, opts);
    return h.call("POST", "/payments/aslan/webhook", { raw, headers });
  };

  describe("starting a checkout", () => {
    it("creates a hosted session: centimes, https return URLs, idempotency key, order/payment ids in metadata", async () => {
      const o = await orderOnline();
      const r = await checkout(o.id);
      assert.equal(r.status, 200);
      assert.match(r.body.checkoutUrl, /^https:\/\/pay\.aslan\.ma\//);

      const call = h.aslan.calls.at(-1)!;
      assert.equal(call.body.amount, Math.round(o.totalAmount) * 100);
      assert.equal(call.key, `order_${o.id}_1`);
      assert.deepEqual(call.body.metadata, { orderId: o.id, paymentId: (await payment(o.id)).id });
      assert.match(call.body.successUrl, /^https:\/\/dabacash\.test\/payment\/result\?order=/);
      assert.match(call.body.cancelUrl, /^https:\/\//);
      assert.equal(call.body.customer.email, "client@demo.dabacash.test");
    });

    it("reuses a still-valid session instead of opening a second one", async () => {
      const o = await orderOnline();
      const a = await checkout(o.id);
      const b = await checkout(o.id);
      assert.equal(b.body.checkoutUrl, a.body.checkoutUrl);
      assert.equal(h.aslan.calls.length, 1);
    });

    it("a provider outage is a clean 502 and leaves the order payable later", async () => {
      const o = await orderOnline();
      h.aslan.failNext();
      const r = await checkout(o.id);
      assert.equal(r.status, 502);
      assert.ok(!/sk_test|Bearer/.test(JSON.stringify(r.body)), "no credential in the error");
      assert.equal((await checkout(o.id)).status, 200);
    });

    it("refuses other people's orders, cash orders, paid and cancelled orders", async () => {
      const o = await orderOnline();
      const stranger = await h.newCustomer("stranger");
      assert.equal((await checkout(o.id, stranger.accessToken)).status, 404);
      assert.equal((await checkout(o.id, owner)).status, 403);

      const cash = (await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: iphone.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" } })).body;
      assert.equal((await checkout(cash.id)).status, 400);

      await checkout(o.id);
      await hook(await eventFor(o, "payment.succeeded"));
      assert.equal((await checkout(o.id)).status, 409, "already paid");

      const c = await orderOnline();
      await h.call("POST", `/orders/${c.id}/cancel`, { token: client });
      assert.equal((await checkout(c.id)).status, 400);
    });

    it("exposes the payment status to its owner and an admin only", async () => {
      const o = await orderOnline();
      assert.equal((await h.call("GET", `/payments/order/${o.id}`, { token: client })).body.status, "PENDING");
      assert.equal((await h.call("GET", `/payments/order/${o.id}`, { token: admin })).status, 200);
      assert.equal((await h.call("GET", `/payments/order/${o.id}`, { token: (await h.newCustomer("peek")).accessToken })).status, 404);
    });
  });

  describe("webhook authenticity", () => {
    it("rejects unsigned, mis-signed, tampered and stale deliveries without changing anything", async () => {
      const o = await orderOnline();
      await checkout(o.id);
      const evt = await eventFor(o, "payment.succeeded");

      assert.equal((await h.call("POST", "/payments/aslan/webhook", { body: evt })).status, 401, "unsigned");
      assert.equal((await hook(evt, { secret: "whsec_wrong" })).status, 401, "wrong secret");
      assert.equal((await hook(evt, { t: Math.floor(Date.now() / 1000) - 600 })).status, 401, "stale timestamp (replay)");
      assert.equal((await hook(evt, { t: Math.floor(Date.now() / 1000) + 600 })).status, 401, "timestamp from the future");

      const { raw, headers } = signedWebhook(evt);
      assert.equal((await h.call("POST", "/payments/aslan/webhook", { raw: raw.replace('"txn_1"', '"txn_2"'), headers })).status, 401, "tampered body");
      assert.equal((await h.call("POST", "/payments/aslan/webhook", { raw, headers: { "x-webhook-signature": "garbage" } })).status, 401);

      assert.equal((await payment(o.id)).status, "PENDING");
      assert.equal((await order(o.id)).status, "PENDING");
    });
  });

  describe("settlement", () => {
    it("a signed success confirms the order, records the commission, notifies and emails — once", async () => {
      const o = await orderOnline();
      await checkout(o.id);
      assert.equal((await hook(await eventFor(o, "payment.succeeded"))).status, 200);

      const p = await payment(o.id);
      assert.equal(p.status, "COMPLETED");
      assert.ok(p.paidAt);
      assert.equal((await order(o.id)).status, "CONFIRMED");
      assert.equal((await h.prisma.commission.findUniqueOrThrow({ where: { orderId: o.id } })).amount, Math.round(o.totalAmount * 0.15 * 100) / 100);
      assert.ok(await waitFor(() => h.resend.mails.find((m) => m.subject === "Paiement reçu")));
      assert.equal(await h.prisma.notification.count({ where: { title: "Paiement reçu" } }), 1);
      assert.equal(await h.prisma.auditLog.count({ where: { action: "PAYMENT_SETTLED", entityId: o.id } }), 1);
    });

    it("replays and parallel duplicates are idempotent: one commission, one notification, one email", async () => {
      const o = await orderOnline();
      await checkout(o.id);
      const evt = await eventFor(o, "payment.succeeded");
      const rs = await Promise.all(Array.from({ length: 6 }, () => hook(evt)));
      assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.status)));
      assert.equal(await h.prisma.commission.count({ where: { orderId: o.id } }), 1);
      assert.equal(await h.prisma.notification.count({ where: { title: "Paiement reçu" } }), 1);
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(h.resend.mails.filter((m) => m.subject === "Paiement reçu").length, 1);
    });

    it("ignores a 'paid' event whose amount differs from the order", async () => {
      const o = await orderOnline();
      await checkout(o.id);
      assert.equal((await hook(await eventFor(o, "payment.succeeded", { amount: 100 }))).status, 200);
      assert.equal((await payment(o.id)).status, "PENDING");
      assert.equal((await order(o.id)).status, "PENDING");
    });

    it("a failed payment can be retried with a new idempotency key; a cash-agent reference puts it in PROCESSING", async () => {
      const o = await orderOnline();
      await checkout(o.id);
      await hook(await eventFor(o, "payment.failed"));
      assert.equal((await payment(o.id)).status, "FAILED");
      assert.equal((await order(o.id)).status, "PENDING", "the order stays payable");

      const retry = await checkout(o.id);
      assert.equal(retry.status, 200);
      assert.equal(h.aslan.calls.at(-1)!.key, `order_${o.id}_2`);

      await hook(await eventFor(o, "payment.pending_cash"));
      assert.equal((await payment(o.id)).status, "PROCESSING");
      assert.equal((await h.call("POST", `/orders/${o.id}/cancel`, { token: client })).status, 409, "a pending cash payment blocks self-cancel");
    });

    it("acknowledges unknown payments and unknown events without side effects", async () => {
      assert.equal((await hook({ event: "payment.succeeded", data: { checkoutSessionId: "cs_unknown", amount: 100, metadata: {} } })).status, 200);
      const o = await orderOnline();
      await checkout(o.id);
      assert.equal((await hook(await eventFor(o, "subscription.renewed"))).status, 200);
      assert.equal((await payment(o.id)).status, "PENDING");
    });

    it("metadata wins over the session id: a mismatched pair cannot touch another payment", async () => {
      const a = await orderOnline();
      const b = (await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: iphone.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "ASLAN" } })).body;
      await checkout(a.id);
      await checkout(b.id);
      const evt = await eventFor(b, "payment.succeeded", { checkoutSessionId: (await payment(a.id)).gatewayRef });
      await hook(evt);
      assert.equal((await payment(b.id)).status, "COMPLETED");
      assert.equal((await payment(a.id)).status, "PENDING", "the other payment is untouched");
    });

    it("a payment that arrives after cancellation is recorded as 'refund required', not silently confirmed", async () => {
      const o = await orderOnline();
      await checkout(o.id);
      await h.call("POST", `/orders/${o.id}/cancel`, { token: client });
      await hook(await eventFor(o, "payment.succeeded"));

      assert.equal((await order(o.id)).status, "CANCELLED", "the order stays cancelled");
      assert.equal((await payment(o.id)).status, "COMPLETED", "the money really was taken");
      assert.equal(await h.prisma.commission.count({ where: { orderId: o.id } }), 0);
      assert.equal(await h.prisma.auditLog.count({ where: { action: "PAYMENT_LATE_REFUND_REQUIRED", entityId: o.id } }), 1);
      const row = (await h.call("GET", `/admin/payments?search=${o.id.slice(-6)}`, { token: admin })).body.items[0];
      assert.equal(row.status, "COMPLETED");
      assert.equal(row.order.status, "CANCELLED", "an admin can spot the mismatch");
    });

    it("a paid order cannot be cancelled by a status change: it needs a refund", async () => {
      const o = await orderOnline();
      await checkout(o.id);
      await hook(await eventFor(o, "payment.succeeded"));
      assert.equal((await h.call("PATCH", `/orders/${o.id}/status`, { token: owner, body: { status: "CANCELLED" } })).status, 409);
      assert.equal((await h.call("POST", `/orders/${o.id}/cancel`, { token: client })).status, 409);
    });
  });

  describe("races", () => {
    it("customer cancellation vs. payment confirmation: no 500, no deadlock, never confirmed AND cancelled", async () => {
      for (let round = 0; round < 12; round++) {
        await h.reset();
        client = (await h.login("client")).accessToken;
        iphone = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items.find((i: any) => i.title.includes("iPhone 14"));
        const o = await orderOnline();
        await checkout(o.id);
        const evt = await eventFor(o, "payment.succeeded");

        const [c, w] = await Promise.all([h.call("POST", `/orders/${o.id}/cancel`, { token: client }), hook(evt)]);
        assert.ok(c.status === 200 || c.status === 409, `cancel answered ${c.status}`);
        assert.equal(w.status, 200, "webhook answered " + w.status);

        const final = await order(o.id);
        const p = await payment(o.id);
        const stock = await h.prisma.inventory.findFirstOrThrow({ where: { listingId: iphone.id } });
        if (final.status === "CONFIRMED") {
          assert.equal(p.status, "COMPLETED");
          assert.equal(stock.reserved, 1, "stock stays reserved for a confirmed order");
          assert.equal(await h.prisma.commission.count({ where: { orderId: o.id } }), 1);
        } else {
          assert.equal(final.status, "CANCELLED");
          assert.equal(stock.reserved, 0, "stock released exactly once");
          assert.equal(await h.prisma.commission.count({ where: { orderId: o.id } }), 0);
          if (p.status === "COMPLETED") assert.equal(await h.prisma.auditLog.count({ where: { action: "PAYMENT_LATE_REFUND_REQUIRED", entityId: o.id } }), 1, "a paid+cancelled order is always flagged for refund");
        }
      }
    });
  });
});
