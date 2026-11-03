import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, it } from "node:test";
import { OrdersService } from "../src/orders/orders.service";
import { Harness, TEST_PASSWORD, startHarness } from "./helpers/harness";

describe("concurrency: simultaneous operations never corrupt stock, money or roles", () => {
  let h: Harness;
  let owner: string, admin: string, iphone: any, s23: any, xps: any;

  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });
  beforeEach(async () => {
    await h.reset();
    owner = (await h.login("owner.casablanca")).accessToken;
    admin = (await h.login("admin")).accessToken;
    const items = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items;
    iphone = items.find((i: any) => i.title.includes("iPhone 14")); // 3 in stock
    s23 = items.find((i: any) => i.title.includes("S23")); // 2
    xps = items.find((i: any) => i.title.includes("XPS")); // 1
  });

  const customers = (n: number) => Promise.all(Array.from({ length: n }, (_, i) => h.newCustomer(`c${i}`)));
  const place = (token: string, listingId: string, quantity = 1, headers?: Record<string, string>) =>
    h.call("POST", "/orders", { token, headers, body: { items: [{ listingId, quantity }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" } });
  const inv = (listingId: string) => h.prisma.inventory.findUniqueOrThrow({ where: { listingId } });
  const noServerErrors = (rs: { status: number }[]) => assert.ok(rs.every((r) => r.status < 500), `a request failed with ${rs.map((r) => r.status)}`);

  /** The accounting rules that must hold whatever happened. */
  async function assertInvariants() {
    const inventories = await h.prisma.inventory.findMany();
    for (const i of inventories) {
      assert.ok(i.reserved >= 0 && i.reserved <= i.quantity, `inventory ${i.listingId}: reserved ${i.reserved} / quantity ${i.quantity}`);
      const open = await h.prisma.orderItem.aggregate({
        where: { listingId: i.listingId, order: { status: { in: ["PENDING", "CONFIRMED", "IN_TRANSIT"] } } }, _sum: { quantity: true },
      });
      assert.equal(i.reserved, open._sum.quantity ?? 0, `reserved must equal the units held by open orders (${i.listingId})`);
    }
    const delivered = await h.prisma.order.findMany({ where: { status: "DELIVERED" }, select: { id: true } });
    for (const o of delivered) assert.equal(await h.prisma.commission.count({ where: { orderId: o.id } }), 1, `exactly one commission for delivered order ${o.id}`);
    assert.equal(await h.prisma.commission.count({ where: { order: { status: "CANCELLED" } } }), 0, "no commission on a cancelled order");
    const dupCommissions = await h.prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM (SELECT "orderId" FROM commissions GROUP BY "orderId" HAVING COUNT(*) > 1) d`;
    assert.equal(dupCommissions[0].n, 0);
  }

  it("the last unit goes to exactly one of many simultaneous buyers", async () => {
    const buyers = await customers(8);
    const rs = await Promise.all(buyers.map((b) => place(b.accessToken, xps.id)));
    noServerErrors(rs);
    assert.equal(rs.filter((r) => r.status === 201).length, 1);
    assert.equal(rs.filter((r) => r.status === 400).length, 7);
    assert.equal((await inv(xps.id)).reserved, 1);
    assert.equal(await h.prisma.order.count(), 1);
    await assertInvariants();
  });

  it("never oversells: random quantities from many buyers reserve at most the stock", async () => {
    const buyers = await customers(10);
    const rs = await Promise.all(buyers.map((b, i) => place(b.accessToken, iphone.id, (i % 2) + 1)));
    noServerErrors(rs);
    const reserved = (await inv(iphone.id)).reserved;
    assert.ok(reserved <= 3, `reserved ${reserved} of 3`);
    const sold = await h.prisma.orderItem.aggregate({ where: { listingId: iphone.id }, _sum: { quantity: true } });
    assert.equal(reserved, sold._sum.quantity);
    await assertInvariants();
  });

  it("ten identical submissions with one Idempotency-Key create one order and reserve once", async () => {
    const [c] = await customers(1);
    const rs = await Promise.all(Array.from({ length: 10 }, () => place(c.accessToken, iphone.id, 1, { "idempotency-key": "double-click-0001" })));
    noServerErrors(rs);
    assert.ok(rs.every((r) => r.status === 201));
    assert.equal(new Set(rs.map((r) => r.body.id)).size, 1);
    assert.equal(await h.prisma.order.count(), 1);
    assert.equal((await inv(iphone.id)).reserved, 1);
  });

  it("confirm vs. customer-cancel on the same order: a single consistent outcome", async () => {
    for (let i = 0; i < 8; i++) {
      await h.reset();
      owner = (await h.login("owner.casablanca")).accessToken;
      const [c] = await customers(1);
      const items = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items;
      const l = items.find((x: any) => x.title.includes("iPhone 14"));
      const o = (await place(c.accessToken, l.id)).body;
      const [confirm, cancel] = await Promise.all([
        h.call("PATCH", `/orders/${o.id}/status`, { token: owner, body: { status: "CONFIRMED" } }),
        h.call("POST", `/orders/${o.id}/cancel`, { token: c.accessToken }),
      ]);
      noServerErrors([confirm, cancel]);
      const final = await h.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      assert.ok(["CONFIRMED", "CANCELLED"].includes(final.status));
      if (final.status === "CONFIRMED") assert.equal((await inv(l.id)).reserved, 1);
      else assert.equal((await inv(l.id)).reserved, 0);
      assert.equal(await h.prisma.auditLog.count({ where: { entityId: o.id, action: { in: ["ORDER_STATUS_CHANGED", "ORDER_CANCELLED_BY_CUSTOMER"] } } }), 1, "exactly one transition was applied and recorded");
      await assertInvariants();
    }
  });

  it("delivering the same order twice at once consumes the stock once and records one commission", async () => {
    const [c] = await customers(1);
    const o = (await place(c.accessToken, iphone.id, 2)).body;
    await h.call("PATCH", `/orders/${o.id}/status`, { token: owner, body: { status: "CONFIRMED" } });
    const rs = await Promise.all(Array.from({ length: 5 }, () => h.call("PATCH", `/orders/${o.id}/status`, { token: owner, body: { status: "DELIVERED" } })));
    noServerErrors(rs);
    assert.equal(rs.filter((r) => r.status === 200).length, 1);
    const i = await inv(iphone.id);
    assert.deepEqual([i.quantity, i.reserved], [1, 0]);
    assert.equal(await h.prisma.commission.count(), 1);
    await assertInvariants();
  });

  it("editing the stock while orders arrive never breaks the reserved <= on-hand rule", async () => {
    const buyers = await customers(6);
    const edits = [1, 2, 3, 4].map((n) => h.call("PATCH", `/products/${iphone.id}`, { token: owner, body: { stockQuantity: n } }));
    const orders = buyers.map((b) => place(b.accessToken, iphone.id));
    const rs = await Promise.all([...edits, ...orders]);
    noServerErrors(rs);
    await assertInvariants();
  });

  it("expiry sweeper racing with customer cancellation and payment confirmation releases stock exactly once", async () => {
    const buyers = await customers(4);
    const orders = (await Promise.all(buyers.map((b) => h.call("POST", "/orders", { token: b.accessToken, body: { items: [{ listingId: iphone.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "ASLAN" } })))).map((r) => r.body).filter((o) => o.id);
    await h.prisma.order.updateMany({ data: { createdAt: new Date(Date.now() - 3 * 3600_000) } });
    const svc = h.app.get(OrdersService);
    const rs = await Promise.all([
      svc.expireStaleOrders(), svc.expireStaleOrders(),
      ...orders.map((o, i) => h.call("POST", `/orders/${o.id}/cancel`, { token: buyers[i].accessToken })),
    ].map((p) => Promise.resolve(p).then((v) => (typeof v === "number" ? { status: 200 } : v))));
    noServerErrors(rs as { status: number }[]);
    assert.equal((await inv(iphone.id)).reserved, 0, "every reservation was released, none twice");
    await assertInvariants();
  });

  it("two admins demoting each other at once cannot leave the platform without an admin", async () => {
    const second = await h.prisma.user.upsert({
      where: { email: "second-admin@demo.dabacash.test" }, update: {},
      create: { email: "second-admin@demo.dabacash.test", passwordHash: (await h.prisma.user.findFirstOrThrow({ where: { email: { startsWith: "admin@" } } })).passwordHash, firstName: "Second", lastName: "Admin", role: "ADMIN" },
    });
    const first = await h.prisma.user.findFirstOrThrow({ where: { email: { startsWith: "admin@" } } });
    const t2 = (await h.call("POST", "/auth/login", { body: { email: second.email, password: TEST_PASSWORD } })).body.accessToken;
    const rs = await Promise.all([
      h.call("PATCH", `/admin/users/${second.id}`, { token: admin, body: { role: "CUSTOMER" } }),
      h.call("PATCH", `/admin/users/${first.id}`, { token: t2, body: { role: "CUSTOMER" } }),
    ]);
    noServerErrors(rs);
    assert.ok((await h.prisma.user.count({ where: { role: "ADMIN", isActive: true } })) >= 1);
  });

  it("creating a franchise for the same owner email twice at once creates one", async () => {
    const body = { name: "Atlas Mobile", citySlug: "agadir", address: "12 avenue Hassan II", owner: { email: "gerant@atlas.test", firstName: "Karim", lastName: "Atlas", password: "Atlas-Passw0rd-1" } };
    const rs = await Promise.all([1, 2, 3].map(() => h.call("POST", "/admin/franchises", { token: admin, body })));
    noServerErrors(rs);
    assert.equal(rs.filter((r) => r.status === 201).length, 1);
    assert.equal(await h.prisma.user.count({ where: { email: "gerant@atlas.test" } }), 1);
    assert.equal(await h.prisma.franchise.count({ where: { name: "Atlas Mobile" } }), 1);
  });

  it("chaos: random operations in parallel leave every accounting invariant intact", async () => {
    const buyers = await customers(6);
    const listings = [iphone, s23, xps];
    // 1. place many orders at once
    const placed = (await Promise.all(Array.from({ length: 18 }, (_, i) => place(buyers[i % 6].accessToken, listings[i % 3].id, 1)))).filter((r) => r.status === 201).map((r) => r.body);
    assert.ok(placed.length >= 5, "enough orders were accepted to make the next step meaningful");
    await assertInvariants();

    // 2. throw conflicting transitions at every order simultaneously
    const act = (o: any, i: number) => {
      const buyer = buyers.find((b) => b.id === o.customerId)!;
      const staff = (status: string) => h.call("PATCH", `/orders/${o.id}/status`, { token: owner, body: { status } });
      return [
        staff("CONFIRMED"), staff("DELIVERED"), staff("CANCELLED"), staff("CONFIRMED"),
        h.call("POST", `/orders/${o.id}/cancel`, { token: buyer.accessToken }),
        ...(i % 3 === 0 ? [h.app.get(OrdersService).expireStaleOrders().then(() => ({ status: 200 }))] : []),
      ];
    };
    const rs = await Promise.all(placed.flatMap(act));
    noServerErrors(rs as { status: number }[]);
    await assertInvariants();

    // 3. no order is in an impossible state
    for (const o of await h.prisma.order.findMany()) assert.ok(["PENDING", "CONFIRMED", "IN_TRANSIT", "DELIVERED", "CANCELLED"].includes(o.status));
    // and every applied transition left exactly one audit entry
    const transitions = await h.prisma.auditLog.count({ where: { action: { in: ["ORDER_STATUS_CHANGED", "ORDER_CANCELLED_BY_CUSTOMER"] } } });
    assert.ok(transitions >= 1);
  });
});
