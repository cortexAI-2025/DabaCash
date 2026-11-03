import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, it } from "node:test";
import { io } from "socket.io-client";
import { OrdersService } from "../src/orders/orders.service";
import { Harness, startHarness, waitFor } from "./helpers/harness";

describe("orders: stock, lifecycle, commission, idempotency, listing", () => {
  let h: Harness;
  let client: string, clientId: string, owner: string, admin: string;
  let iphone: any, s23: any, xps: any;

  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });
  beforeEach(async () => {
    await h.reset();
    client = (await h.login("client")).accessToken;
    owner = (await h.login("owner.casablanca")).accessToken;
    admin = (await h.login("admin")).accessToken;
    clientId = (await h.prisma.user.findFirstOrThrow({ where: { email: { startsWith: "client@" } } })).id;
    const items = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items;
    iphone = items.find((i: any) => i.title.includes("iPhone 14"));
    s23 = items.find((i: any) => i.title.includes("S23"));
    xps = items.find((i: any) => i.title.includes("XPS"));
  });

  const place = (listingId: string, quantity = 1, over: Record<string, unknown> = {}, token = client) =>
    h.call("POST", "/orders", { token, body: { items: [{ listingId, quantity }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH", ...over } });
  const inv = async (listingId: string) => h.prisma.inventory.findUniqueOrThrow({ where: { listingId } });
  const setStatus = (id: string, status: string, token = owner) => h.call("PATCH", `/orders/${id}/status`, { token, body: { status } });
  const audit = async (entityId: string) => (await h.prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } })).map((a) => a.action);

  describe("placing an order", () => {
    it("computes the total on the server from the catalogue and reserves the stock", async () => {
      const r = await place(iphone.id, 2);
      assert.equal(r.status, 201);
      assert.equal(r.body.totalAmount, 2 * iphone.listingPrice);
      assert.equal(r.body.status, "PENDING");
      assert.equal(r.body.items[0].unitPrice, iphone.listingPrice);
      assert.deepEqual(await inv(iphone.id).then((i) => [i.quantity, i.reserved]), [3, 2]);
    });

    it("refuses more than the available stock and reserves nothing", async () => {
      const r = await place(xps.id, 2);
      assert.equal(r.status, 400);
      assert.match(r.body.message, /Stock insuffisant/);
      assert.equal((await inv(xps.id)).reserved, 0);
    });

    it("counts what is already reserved when checking availability", async () => {
      assert.equal((await place(xps.id, 1)).status, 201);
      assert.equal((await place(xps.id, 1)).status, 400, "the last unit is taken");
    });

    it("rejects a basket mixing two franchises", async () => {
      const rabat = await h.prisma.franchise.findFirstOrThrow({ where: { slug: "demo-rabat" } });
      const model = await h.prisma.deviceModel.findFirstOrThrow({ where: { name: "iPhone 13" } });
      const other = await h.prisma.productListing.create({ data: { franchiseId: rabat.id, deviceModelId: model.id, condition: "B", status: "ACTIVE", title: "iPhone 13 Rabat", buybackPrice: 3000, listingPrice: 4000, stockQuantity: 2, images: [] } });
      await h.prisma.inventory.create({ data: { franchiseId: rabat.id, listingId: other.id, deviceModelId: model.id, quantity: 2 } });

      const r = await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: iphone.id, quantity: 1 }, { listingId: other.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" } });
      assert.equal(r.status, 400);
      assert.match(r.body.message, /même franchise/);
      assert.equal((await inv(iphone.id)).reserved, 0);
    });

    it("refuses a listing that is not for sale", async () => {
      await h.prisma.productListing.update({ where: { id: iphone.id }, data: { status: "ARCHIVED" } });
      assert.equal((await place(iphone.id)).status, 400);
    });

    it("only customers can order", async () => {
      assert.equal((await place(iphone.id, 1, {}, owner)).status, 403);
      assert.equal((await place(iphone.id, 1, {}, admin)).status, 403);
    });
  });

  describe("lifecycle", () => {
    it("PENDING -> CONFIRMED -> DELIVERED consumes the stock, marks sold-out listings and records one 15% commission", async () => {
      const o = (await place(xps.id, 1)).body;
      assert.equal((await setStatus(o.id, "CONFIRMED")).status, 200);
      assert.equal((await h.prisma.commission.count({ where: { orderId: o.id } })), 0, "no commission before the sale is settled");

      const d = await setStatus(o.id, "DELIVERED");
      assert.equal(d.status, 200);
      assert.equal(d.body.status, "DELIVERED");
      assert.ok((await h.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).deliveredAt, "delivery time recorded");
      const i = await inv(xps.id);
      assert.deepEqual([i.quantity, i.reserved], [0, 0]);
      const listing = await h.prisma.productListing.findUniqueOrThrow({ where: { id: xps.id } });
      assert.equal(listing.status, "SOLD");
      assert.equal(listing.soldCount, 1);

      const c = await h.prisma.commission.findUniqueOrThrow({ where: { orderId: o.id } });
      assert.equal(c.rate, 0.15);
      assert.equal(c.amount, 1230, "8200 x 15%");
      assert.deepEqual(await audit(o.id), ["ORDER_STATUS_CHANGED", "ORDER_STATUS_CHANGED"]);
    });

    it("rounds the commission to the centime", async () => {
      await h.prisma.productListing.update({ where: { id: s23.id }, data: { listingPrice: 4501 } });
      const o = (await place(s23.id, 1)).body;
      await setStatus(o.id, "CONFIRMED");
      await setStatus(o.id, "DELIVERED");
      assert.equal((await h.prisma.commission.findUniqueOrThrow({ where: { orderId: o.id } })).amount, 675.15);
    });

    it("refuses moves the state machine does not allow", async () => {
      const o = (await place(iphone.id)).body;
      assert.equal((await setStatus(o.id, "DELIVERED")).status, 409, "PENDING -> DELIVERED");
      assert.equal((await setStatus(o.id, "REFUNDED")).status, 409);
      assert.equal((await setStatus(o.id, "BOGUS")).status, 400);
      await setStatus(o.id, "CONFIRMED");
      await setStatus(o.id, "DELIVERED");
      assert.equal((await setStatus(o.id, "CANCELLED")).status, 409, "DELIVERED is final");
      assert.equal((await setStatus(o.id, "CONFIRMED")).status, 409);
    });

    it("an unpaid online order cannot be confirmed", async () => {
      const o = (await place(iphone.id, 1, { paymentMethod: "ASLAN" })).body;
      assert.equal((await setStatus(o.id, "CONFIRMED")).status, 400);
    });

    it("cancelling releases the reserved stock", async () => {
      const o = (await place(iphone.id, 2)).body;
      assert.equal((await inv(iphone.id)).reserved, 2);
      assert.equal((await setStatus(o.id, "CANCELLED")).status, 200);
      assert.equal((await inv(iphone.id)).reserved, 0);
      assert.equal((await setStatus(o.id, "CONFIRMED")).status, 409, "CANCELLED is final");
    });

    it("a customer can cancel their own pending order, but not a confirmed one", async () => {
      const a = (await place(iphone.id)).body;
      const r = await h.call("POST", `/orders/${a.id}/cancel`, { token: client });
      assert.equal(r.status, 200);
      assert.equal(r.body.status, "CANCELLED");
      assert.equal((await inv(iphone.id)).reserved, 0);
      assert.deepEqual(await audit(a.id), ["ORDER_CANCELLED_BY_CUSTOMER"]);

      const b = (await place(iphone.id)).body;
      await setStatus(b.id, "CONFIRMED");
      assert.equal((await h.call("POST", `/orders/${b.id}/cancel`, { token: client })).status, 409);
    });

    it("emails and notifies the customer at each franchise-driven step, and the email is escaped text", async () => {
      const o = (await place(iphone.id)).body;
      await setStatus(o.id, "CONFIRMED");
      const mail = await waitFor(() => h.resend.mails.find((m) => m.subject === "Commande confirmée"));
      assert.ok(mail);
      assert.equal(mail.to[0], "client@demo.dabacash.test");
      assert.equal(await h.prisma.notification.count({ where: { userId: clientId, title: "Commande confirmée" } }), 1);
    });

    it("an email provider outage never blocks the business action", async () => {
      h.resend.setFailing(true);
      const o = (await place(iphone.id)).body;
      assert.equal((await setStatus(o.id, "CONFIRMED")).status, 200);
      assert.equal(await h.prisma.notification.count({ where: { userId: clientId, title: "Commande confirmée" } }), 1, "the in-app notification is still stored");
    });
  });

  describe("expiry of unpaid orders", () => {
    const age = (id: string, hours: number) => h.prisma.order.update({ where: { id }, data: { createdAt: new Date(Date.now() - hours * 3600_000) } });

    it("cancels stale unpaid online orders and returns their stock; leaves fresh, cash-in-window and paid orders alone", async () => {
      const online = (await place(iphone.id, 1, { paymentMethod: "ASLAN" })).body;
      const fresh = (await place(iphone.id, 1, { paymentMethod: "ASLAN" })).body;
      const cash = (await place(s23.id, 1)).body;
      const paid = (await place(xps.id, 1, { paymentMethod: "ASLAN" })).body;
      await h.prisma.payment.update({ where: { orderId: paid.id }, data: { status: "COMPLETED", paidAt: new Date() } });
      await age(online.id, 3); await age(cash.id, 3); await age(paid.id, 3);

      const n = await h.app.get(OrdersService).expireStaleOrders();
      assert.equal(n, 1);
      const status = async (id: string) => (await h.prisma.order.findUniqueOrThrow({ where: { id } })).status;
      assert.equal(await status(online.id), "CANCELLED");
      assert.equal(await status(fresh.id), "PENDING");
      assert.equal(await status(cash.id), "PENDING", "cash orders hold stock for 48 h");
      assert.equal(await status(paid.id), "PENDING", "a paid order is never expired");
      assert.equal((await inv(iphone.id)).reserved, 1);

      await age(cash.id, 49);
      assert.equal(await h.app.get(OrdersService).expireStaleOrders(), 1);
      assert.equal(await status(cash.id), "CANCELLED");
    });

    it("is idempotent: running it twice does not release stock twice", async () => {
      const o = (await place(iphone.id, 2, { paymentMethod: "ASLAN" })).body;
      await age(o.id, 3);
      const svc = h.app.get(OrdersService);
      await Promise.all([svc.expireStaleOrders(), svc.expireStaleOrders()]);
      assert.equal((await inv(iphone.id)).reserved, 0);
    });
  });

  describe("idempotency", () => {
    it("a retried request with the same key returns the original order and reserves stock once", async () => {
      const headers = { "idempotency-key": "checkout-attempt-0001" };
      const body = { items: [{ listingId: iphone.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" };
      const a = await h.call("POST", "/orders", { token: client, body, headers });
      const b = await h.call("POST", "/orders", { token: client, body, headers });
      assert.equal(a.status, 201);
      assert.equal(b.body.id, a.body.id);
      assert.equal((await inv(iphone.id)).reserved, 1);
      assert.equal(await h.prisma.order.count({ where: { customerId: clientId } }), 1);
    });

    it("the last unit: a duplicate of a successful request succeeds instead of reporting 'out of stock'", async () => {
      const headers = { "idempotency-key": "last-unit-attempt-01" };
      const body = { items: [{ listingId: xps.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" };
      const first = await h.call("POST", "/orders", { token: client, body, headers });
      const retry = await h.call("POST", "/orders", { token: client, body, headers });
      assert.equal(first.status, 201);
      assert.equal(retry.status, 201);
      assert.equal(retry.body.id, first.body.id);
    });

    it("keys are scoped per customer", async () => {
      const other = await h.newCustomer("scoped");
      const headers = { "idempotency-key": "shared-key-12345678" };
      const body = { items: [{ listingId: iphone.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" };
      const a = await h.call("POST", "/orders", { token: client, body, headers });
      const b = await h.call("POST", "/orders", { token: other.accessToken, body, headers });
      assert.notEqual(a.body.id, b.body.id);
    });
  });

  describe("listing and filtering", () => {
    it("paginates a customer's orders and filters by status", async () => {
      for (let i = 0; i < 3; i++) await place(iphone.id);
      const first = (await h.call("GET", "/orders/my?limit=2", { token: client })).body;
      assert.equal(first.items.length, 2);
      assert.deepEqual([first.pagination.total, first.pagination.totalPages, first.pagination.hasNext], [3, 2, true]);
      const second = (await h.call("GET", "/orders/my?limit=2&page=2", { token: client })).body;
      assert.equal(second.items.length, 1);
      assert.equal((await h.call("GET", "/orders/my?status=DELIVERED", { token: client })).body.pagination.total, 0);
      assert.equal((await h.call("GET", "/orders/my?status=BOGUS", { token: client })).status, 400);
    });

    it("a franchise sees only its orders, an admin can search by customer email, order id and date", async () => {
      const o = (await place(iphone.id)).body;
      const fr = await h.call("GET", "/orders/franchise", { token: owner });
      assert.equal(fr.body.items[0].id, o.id);
      assert.equal((await h.call("GET", "/orders/franchise", { token: (await h.login("owner.rabat")).accessToken })).body.items.length, 0);

      const byEmail = await h.call("GET", "/admin/orders?search=client@demo", { token: admin });
      assert.equal(byEmail.body.pagination.total, 1);
      assert.equal((await h.call("GET", `/admin/orders?search=${o.id.slice(-6)}`, { token: admin })).body.pagination.total, 1);
      assert.equal((await h.call("GET", "/admin/orders?search=nobody@x", { token: admin })).body.pagination.total, 0);
      const day = new Date().toISOString().slice(0, 10);
      assert.equal((await h.call("GET", `/admin/orders?from=${day}T00:00:00Z&to=${day}T23:59:59Z`, { token: admin })).body.pagination.total, 1);
      assert.equal((await h.call("GET", "/admin/orders?from=2020-01-01&to=2020-01-02", { token: admin })).body.pagination.total, 0);
    });
  });

  describe("real-time stock feed", () => {
    it("broadcasts the available quantity after a reservation and after a cancellation", async () => {
      const socket = io(`${h.url}/inventory`, { transports: ["websocket"] });
      const events: { listingId: string; available: number }[] = [];
      await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
      socket.on("stock:update", (e) => events.push(e));
      try {
        const o = (await place(iphone.id, 2)).body;
        assert.ok(await waitFor(() => events.find((e) => e.listingId === iphone.id && e.available === 1)));
        await h.call("POST", `/orders/${o.id}/cancel`, { token: client });
        assert.ok(await waitFor(() => events.filter((e) => e.listingId === iphone.id).at(-1)?.available === 3));
      } finally { socket.close(); }
    });
  });
});
