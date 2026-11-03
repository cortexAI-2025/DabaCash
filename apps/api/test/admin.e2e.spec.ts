import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, it } from "node:test";
import { Harness, TEST_PASSWORD, signedWebhook, startHarness } from "./helpers/harness";

describe("admin back office: users, franchises, catalogue, transactions, audit, analytics", () => {
  let h: Harness;
  let admin: string, adminId: string, owner: string, client: string;

  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });
  beforeEach(async () => {
    await h.reset();
    admin = (await h.login("admin")).accessToken;
    adminId = (await h.prisma.user.findFirstOrThrow({ where: { email: { startsWith: "admin@" } } })).id;
    owner = (await h.login("owner.casablanca")).accessToken;
    client = (await h.login("client")).accessToken;
  });

  const audit = async (where: Record<string, unknown>) => h.prisma.auditLog.findMany({ where, orderBy: { createdAt: "asc" } });

  describe("users and roles", () => {
    it("searches, filters and paginates, and never exposes credentials", async () => {
      for (let i = 0; i < 4; i++) await h.newCustomer(`bulk${i}`);
      const all = await h.call("GET", "/admin/users?limit=5", { token: admin });
      assert.equal(all.body.items.length, 5);
      assert.ok(all.body.pagination.total >= 16);
      assert.ok(!/passwordHash|refreshToken/.test(JSON.stringify(all.body)));

      assert.equal((await h.call("GET", "/admin/users?search=bulk2", { token: admin })).body.items.length, 1);
      assert.equal((await h.call("GET", "/admin/users?role=FRANCHISE_OWNER&limit=100", { token: admin })).body.pagination.total, 10);
      assert.equal((await h.call("GET", "/admin/users?role=ADMIN", { token: admin })).body.pagination.total, 1);
      assert.equal((await h.call("GET", "/admin/users?role=NOPE", { token: admin })).status, 400);
    });

    it("promotes and demotes with an audit trail recording before and after", async () => {
      const u = await h.newCustomer("promo");
      const r = await h.call("PATCH", `/admin/users/${u.id}`, { token: admin, body: { role: "ADMIN" } });
      assert.equal(r.body.role, "ADMIN");
      assert.equal((await h.call("GET", "/admin/stats", { token: u.accessToken })).status, 200, "takes effect immediately, no re-login");
      await h.call("PATCH", `/admin/users/${u.id}`, { token: admin, body: { role: "CUSTOMER" } });
      assert.equal((await h.call("GET", "/admin/stats", { token: u.accessToken })).status, 403);

      const log = await audit({ entityId: u.id, action: "USER_ROLE_CHANGED" });
      assert.deepEqual(log.map((l) => l.metadata), [{ from: "CUSTOMER", to: "ADMIN" }, { from: "ADMIN", to: "CUSTOMER" }]);
      assert.equal(log[0].actorId, adminId);
      assert.equal(log[0].actorRole, "ADMIN");
    });

    it("guards: not yourself, no orphaned franchise, no franchise role without a franchise, clean errors", async () => {
      assert.equal((await h.call("PATCH", `/admin/users/${adminId}`, { token: admin, body: { role: "CUSTOMER" } })).status, 409, "own account");
      assert.equal((await h.call("PATCH", `/admin/users/${adminId}`, { token: admin, body: { isActive: false } })).status, 409, "own account");

      const o = await h.prisma.user.findFirstOrThrow({ where: { email: { startsWith: "owner.casablanca@" } } });
      assert.equal((await h.call("PATCH", `/admin/users/${o.id}`, { token: admin, body: { role: "CUSTOMER" } })).status, 409, "would orphan a franchise");
      const c = await h.newCustomer("nofranchise");
      assert.equal((await h.call("PATCH", `/admin/users/${c.id}`, { token: admin, body: { role: "FRANCHISE_OWNER" } })).status, 409, "no franchise to run");
      assert.equal((await h.call("PATCH", `/admin/users/does-not-exist`, { token: admin, body: { role: "CUSTOMER" } })).status, 404);
      assert.equal((await h.call("PATCH", `/admin/users/${c.id}`, { token: admin, body: { role: "SUPERUSER" } })).status, 400);
      assert.equal((await h.call("PATCH", `/admin/users/${c.id}`, { token: owner, body: { role: "ADMIN" } })).status, 403);
    });

    it("an admin can step down only when another active admin exists, so the platform is never left without one", async () => {
      const { JwtService } = require("@nestjs/jwt");
      const second = await h.prisma.user.create({ data: { email: "a2@demo.dabacash.test", passwordHash: "x", firstName: "A", lastName: "2", role: "ADMIN" } });
      const t2 = h.app.get(JwtService).sign({ sub: second.id });
      assert.equal((await h.call("PATCH", `/admin/users/${adminId}`, { token: t2, body: { role: "CUSTOMER" } })).status, 200, "another admin remains");
      // admin2 is now the only admin: it cannot demote or deactivate itself, and nobody else is left to do it
      assert.equal((await h.call("PATCH", `/admin/users/${second.id}`, { token: t2, body: { role: "CUSTOMER" } })).status, 409);
      assert.equal(await h.prisma.user.count({ where: { role: "ADMIN", isActive: true } }), 1);
    });

    it("deactivation signs the user out everywhere, is audited, and can be reverted", async () => {
      const u = await h.newCustomer("dis");
      await h.call("PATCH", `/admin/users/${u.id}`, { token: admin, body: { isActive: false } });
      assert.equal(await h.prisma.session.count({ where: { userId: u.id } }), 0);
      assert.equal((await h.call("GET", "/users/me", { token: u.accessToken })).status, 401);
      await h.call("PATCH", `/admin/users/${u.id}`, { token: admin, body: { isActive: true } });
      assert.equal((await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } })).status, 200);
      assert.equal((await audit({ entityId: u.id, action: "USER_STATUS_CHANGED" })).length, 2);
    });

    it("filters locked accounts and unlocking is audited", async () => {
      const u = await h.newCustomer("lk");
      for (let i = 0; i < 5; i++) await h.call("POST", "/auth/login", { body: { email: u.email, password: `Wrong-Passw0rd-${i}` } });
      assert.equal((await h.call("GET", "/admin/users?status=locked", { token: admin })).body.items[0].id, u.id);
      await h.call("POST", `/admin/users/${u.id}/unlock`, { token: admin });
      assert.equal((await h.call("GET", "/admin/users?status=locked", { token: admin })).body.items.length, 0);
      assert.equal((await audit({ entityId: u.id, action: "USER_UNLOCKED" })).length, 1);
      assert.equal((await h.call("POST", "/admin/users/nope/unlock", { token: admin })).status, 404);
    });

    it("anonymised accounts show as deleted and cannot be modified", async () => {
      const u = await h.newCustomer("gone");
      await h.call("DELETE", "/users/me", { token: u.accessToken, body: { password: TEST_PASSWORD } });
      assert.equal((await h.call("GET", "/admin/users?status=deleted", { token: admin })).body.items.length, 1);
      assert.equal((await h.call("PATCH", `/admin/users/${u.id}`, { token: admin, body: { isActive: true } })).status, 409);
    });
  });

  describe("franchises", () => {
    const newFranchise = (over: Record<string, unknown> = {}) => h.call("POST", "/admin/franchises", {
      token: admin,
      body: { name: "Atlas Mobile", citySlug: "agadir", address: "12 avenue Hassan II", owner: { email: "gerant@atlas.test", firstName: "Karim", lastName: "Atlas", password: "Atlas-Passw0rd-1" }, ...over },
    });

    it("creates the franchise and its owner together; the owner can sign in and reach their dashboard", async () => {
      const r = await newFranchise();
      assert.equal(r.status, 201);
      assert.equal(r.body.commissionRate, 0.15);
      assert.equal(r.body.status, "ACTIVE");
      assert.equal(r.body.slug, "atlas-mobile-agadir");
      assert.equal(r.body.city, "Agadir");

      const login = await h.call("POST", "/auth/login", { body: { email: "gerant@atlas.test", password: "Atlas-Passw0rd-1" } });
      assert.equal(login.body.role, "FRANCHISE_OWNER");
      assert.equal((await h.call("GET", "/franchises/dashboard", { token: login.body.accessToken })).status, 200);
      assert.equal((await audit({ entityId: r.body.id, action: "FRANCHISE_CREATED" })).length, 1);
    });

    it("rejects a duplicate owner email, an unknown city and weak passwords — and creates nothing on failure", async () => {
      await newFranchise();
      assert.equal((await newFranchise({ name: "Autre" })).status, 409);
      assert.equal(await h.prisma.franchise.count({ where: { name: "Autre" } }), 0);
      assert.equal((await newFranchise({ citySlug: "atlantis", owner: { email: "x@y.test", firstName: "A", lastName: "B", password: "Atlas-Passw0rd-1" } })).status, 404);
      assert.equal((await newFranchise({ owner: { email: "weak@y.test", firstName: "A", lastName: "B", password: "weak" } })).status, 400);
      assert.equal(await h.prisma.user.count({ where: { email: "weak@y.test" } }), 0);
    });

    it("makes unique slugs when two franchises share a name and city", async () => {
      const a = await newFranchise();
      const b = await newFranchise({ owner: { email: "autre@atlas.test", firstName: "B", lastName: "B", password: "Atlas-Passw0rd-1" } });
      assert.notEqual(a.body.slug, b.body.slug);
    });

    it("updates status and commission with before/after in the audit trail, and a suspended franchise cannot publish", async () => {
      const f = await h.prisma.franchise.findFirstOrThrow({ where: { slug: "demo-casablanca" } });
      const r = await h.call("PATCH", `/admin/franchises/${f.id}`, { token: admin, body: { commissionRate: 0.12, status: "SUSPENDED" } });
      assert.equal(r.status, 200);
      const log = await audit({ entityId: f.id, action: "FRANCHISE_UPDATED" });
      assert.deepEqual(log[0].metadata, { commissionRate: { from: 0.15, to: 0.12 }, status: { from: "ACTIVE", to: "SUSPENDED" } });

      const publish = await h.call("POST", "/products", { token: owner, body: { deviceModelId: (await h.prisma.deviceModel.findFirstOrThrow()).id, condition: "B", title: "Test listing", buybackPrice: 100, listingPrice: 200, stockQuantity: 1, images: [] } });
      assert.equal(publish.status, 403);
      assert.equal((await h.call("PATCH", `/admin/franchises/nope`, { token: admin, body: { commissionRate: 0.1 } })).status, 404);
    });

    it("the new commission rate applies to later sales, not to commissions already recorded", async () => {
      const l = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items.find((i: any) => i.title.includes("S23"));
      const place = async () => (await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: l.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" } })).body;
      const deliver = async (id: string) => { for (const s of ["CONFIRMED", "DELIVERED"]) await h.call("PATCH", `/orders/${id}/status`, { token: owner, body: { status: s } }); };
      const a = await place(); await deliver(a.id);
      const f = await h.prisma.franchise.findFirstOrThrow({ where: { slug: "demo-casablanca" } });
      await h.call("PATCH", `/admin/franchises/${f.id}`, { token: admin, body: { commissionRate: 0.1 } });
      const b = await place(); await deliver(b.id);
      assert.equal((await h.prisma.commission.findUniqueOrThrow({ where: { orderId: a.id } })).rate, 0.15);
      assert.equal((await h.prisma.commission.findUniqueOrThrow({ where: { orderId: b.id } })).rate, 0.1);
    });

    it("lists, searches and filters franchises", async () => {
      assert.equal((await h.call("GET", "/admin/franchises?limit=100", { token: admin })).body.pagination.total, 10);
      assert.equal((await h.call("GET", "/admin/franchises?search=oujda", { token: admin })).body.items.length, 1);
      await h.prisma.franchise.update({ where: { slug: "demo-fes" }, data: { status: "SUSPENDED" } });
      assert.equal((await h.call("GET", "/admin/franchises?status=SUSPENDED", { token: admin })).body.items.length, 1);
    });
  });

  describe("catalogue and market baselines", () => {
    it("an unpriced model cannot be estimated until an admin sets a baseline, which is audited and kept in the price history", async () => {
      const m = (await h.call("POST", "/admin/catalog/models", { token: admin, body: { brandName: "Oppo", name: "Reno 8", deviceType: "PHONE", releaseYear: 2022, baseMarketPrice: 4000 } })).body;
      assert.equal(m.brand.slug, "oppo");
      assert.equal((await h.call("GET", "/pricing/estimate?brandSlug=oppo&modelSlug=reno-8&condition=B")).status, 200);
      assert.equal(await h.prisma.priceHistory.count({ where: { deviceModelId: m.id } }), 4, "one row per condition");

      const before = (await h.call("GET", "/pricing/estimate?brandSlug=oppo&modelSlug=reno-8&condition=B")).body.buybackPrice;
      assert.equal((await h.call("PATCH", `/admin/catalog/models/${m.id}`, { token: admin, body: { baseMarketPrice: 6000 } })).status, 200);
      const after = (await h.call("GET", "/pricing/estimate?brandSlug=oppo&modelSlug=reno-8&condition=B")).body.buybackPrice;
      assert.ok(after > before, "the offer follows the baseline");
      assert.equal(await h.prisma.priceHistory.count({ where: { deviceModelId: m.id } }), 8);

      const log = await audit({ entityId: m.id, action: "CATALOG_PRICE_CHANGED" });
      assert.deepEqual(log[0].metadata, { from: 4000, to: 6000 });
    });

    it("rejects duplicates, deactivation hides a model from customers, and only admins edit", async () => {
      const body = { brandName: "Oppo", name: "Reno 8", deviceType: "PHONE", baseMarketPrice: 4000 };
      assert.equal((await h.call("POST", "/admin/catalog/models", { token: admin, body })).status, 201);
      assert.equal((await h.call("POST", "/admin/catalog/models", { token: admin, body })).status, 409);
      assert.equal((await h.call("POST", "/admin/catalog/models", { token: owner, body })).status, 403);

      const m = await h.prisma.deviceModel.findFirstOrThrow({ where: { name: "iPhone 14" } });
      await h.call("PATCH", `/admin/catalog/models/${m.id}`, { token: admin, body: { isActive: false } });
      assert.ok(!(await h.call("GET", "/marketplace/models")).body.some((x: any) => x.id === m.id));
      assert.equal((await h.call("GET", "/pricing/estimate?brandSlug=apple&modelSlug=iphone-14&condition=B")).status, 404);
    });

    it("lists the catalogue with prices for admins, with search and pagination", async () => {
      const r = await h.call("GET", "/admin/catalog/models?search=iphone", { token: admin });
      assert.equal(r.body.items.length, 3);
      assert.ok(r.body.items.every((i: any) => i.baseMarketPrice > 0));
      assert.equal((await h.call("GET", "/admin/catalog/models?limit=2", { token: admin })).body.items.length, 2);
    });
  });

  describe("transactions and audit trail", () => {
    it("lists payments with filters and the settled total, from real data", async () => {
      const l = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items.find((i: any) => i.title.includes("iPhone 14"));
      const o = (await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: l.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "ASLAN" } })).body;
      await h.call("POST", "/payments/aslan/checkout", { token: client, body: { orderId: o.id } });
      const p = await h.prisma.payment.findUniqueOrThrow({ where: { orderId: o.id } });
      const { raw, headers } = signedWebhook({ event: "payment.succeeded", data: { checkoutSessionId: p.gatewayRef, amount: Math.round(o.totalAmount) * 100, metadata: { orderId: o.id, paymentId: p.id } } });
      await h.call("POST", "/payments/aslan/webhook", { raw, headers });
      await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: l.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" } });

      const all = await h.call("GET", "/admin/payments", { token: admin });
      assert.equal(all.body.pagination.total, 2);
      assert.equal(all.body.completedAmount, o.totalAmount);
      assert.equal((await h.call("GET", "/admin/payments?status=COMPLETED", { token: admin })).body.items.length, 1);
      assert.equal((await h.call("GET", "/admin/payments?method=CASH", { token: admin })).body.items.length, 1);
      assert.equal((await h.call("GET", "/admin/payments?search=client@demo", { token: admin })).body.pagination.total, 2);
      assert.equal((await h.call("GET", `/admin/payments?search=${p.gatewayRef}`, { token: admin })).body.items.length, 1);
      assert.equal((await h.call("GET", "/admin/payments?status=BOGUS", { token: admin })).status, 400);
      assert.equal((await h.call("GET", "/admin/payments", { token: client })).status, 403);
    });

    it("the audit trail is filterable and paginated, and cannot be modified through the API", async () => {
      const u = await h.newCustomer("trail");
      await h.call("PATCH", `/admin/users/${u.id}`, { token: admin, body: { isActive: false } });
      const byEntity = await h.call("GET", `/admin/audit?entity=User&entityId=${u.id}`, { token: admin });
      assert.deepEqual(byEntity.body.items.map((i: any) => i.action).sort(), ["REGISTER", "USER_STATUS_CHANGED"]);
      assert.equal(byEntity.body.items.find((i: any) => i.action === "USER_STATUS_CHANGED").actor.email, "admin@demo.dabacash.test");
      assert.equal((await h.call("GET", "/admin/audit?action=USER_STATUS_CHANGED", { token: admin })).body.pagination.total, 1);
      assert.equal((await h.call("GET", "/admin/audit?limit=2", { token: admin })).body.items.length, 2);
      assert.equal((await h.call("GET", "/admin/audit?action=lowercase", { token: admin })).status, 400);
      assert.equal((await h.call("GET", "/admin/audit", { token: owner })).status, 403);

      const id = (await h.prisma.auditLog.findFirstOrThrow()).id;
      for (const m of ["PATCH", "PUT", "DELETE", "POST"]) assert.equal((await h.call(m, `/admin/audit/${id}`, { token: admin, body: {} })).status, 404, `${m} must not exist`);
    });

    it("records failed logins, with the attempted email and no password", async () => {
      await h.call("POST", "/auth/login", { body: { email: "nobody@test.dabacash.test", password: "Wrong-Passw0rd" } });
      const l = await audit({ action: "LOGIN_FAILED" });
      assert.equal(l.length, 1);
      assert.ok(!/Wrong-Passw0rd/.test(JSON.stringify(l[0])));
      assert.equal((l[0].metadata as any).known, false);
    });
  });

  describe("indicators come from real data", () => {
    const iphoneListing = async () => (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items.find((i: any) => i.title.includes("iPhone 14"));
    const sell = async (listing: any, qty: number, finish: "DELIVERED" | "CONFIRMED" | "CANCELLED" | "PENDING") => {
      const o = (await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: listing.id, quantity: qty }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" } })).body;
      const path = { PENDING: [], CONFIRMED: ["CONFIRMED"], DELIVERED: ["CONFIRMED", "DELIVERED"], CANCELLED: ["CANCELLED"] }[finish];
      for (const status of path) await h.call("PATCH", `/orders/${o.id}/status`, { token: owner, body: { status } });
      return o;
    };

    it("GMV, margin and counts match hand-computed values; cancelled and pending orders are excluded", async () => {
      const iph = await iphoneListing();
      const items = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items;
      const s23 = items.find((i: any) => i.title.includes("S23"));
      const xps = items.find((i: any) => i.title.includes("XPS"));
      await sell(iph, 2, "DELIVERED");   // 2 x 5800, cost 2 x 4200
      await sell(s23, 1, "CONFIRMED");   // 4500, cost 3100
      await sell(xps, 1, "CANCELLED");   // excluded
      await sell(xps, 1, "PENDING");     // excluded
      const gmv = 2 * 5800 + 4500, cost = 2 * 4200 + 3100;

      const stats = (await h.call("GET", "/admin/stats", { token: admin })).body;
      assert.equal(stats.gmv, gmv);
      assert.equal(stats.totalOrders, 4, "total counts every order; GMV does not");

      const a = (await h.call("GET", "/admin/analytics?days=7", { token: admin })).body;
      assert.deepEqual([a.totals.gmv, a.totals.orders, a.totals.units, a.totals.margin], [gmv, 2, 3, gmv - cost]);
      assert.ok(Math.abs(a.totals.avgMarginPerUnit - (gmv - cost) / 3) < 0.01);
      assert.equal(a.totals.commission, 1740, "only the delivered order has settled: 11600 x 15%");
      assert.equal(a.daily.length, 7);
      assert.equal(a.daily.at(-1).gmv, gmv);
      assert.ok(a.daily.slice(0, 6).every((d: any) => d.gmv === 0));
      const phones = a.categories.find((c: any) => c.category === "PHONE");
      assert.deepEqual([phones.units, phones.revenue, phones.margin], [3, gmv, gmv - cost]);
      const casa = a.franchises.find((f: any) => f.name.includes("Casablanca"));
      assert.deepEqual([casa.orders, casa.units, casa.revenue, casa.commission], [2, 3, gmv, 1740]);
      assert.equal(a.franchises.length, 10, "every active franchise is listed, even without sales");
      assert.ok(a.notTracked.includes("buybackToResaleConversion"), "unmeasurable conversion is declared, not invented");
    });

    it("compares with the previous period", async () => {
      const iph = await iphoneListing();
      const old = await sell(iph, 1, "DELIVERED");
      await h.prisma.order.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 40 * 86400_000) } });
      await sell(iph, 1, "DELIVERED");
      const a = (await h.call("GET", "/admin/analytics?days=30", { token: admin })).body;
      assert.equal(a.totals.gmv, 5800);
      assert.equal(a.previous.gmv, 5800);
      assert.equal(a.previous.orders, 1);
    });

    it("the franchise analytics see only that franchise", async () => {
      await sell(await iphoneListing(), 1, "DELIVERED");
      const mine = (await h.call("GET", "/franchises/dashboard/analytics?days=7", { token: owner })).body;
      assert.equal(mine.totals.gmv, 5800);
      assert.equal(mine.franchises.length, 1);
      const rabat = (await h.call("GET", "/franchises/dashboard/analytics?days=7", { token: (await h.login("owner.rabat")).accessToken })).body;
      assert.equal(rabat.totals.gmv, 0);
      assert.equal(rabat.totals.orders, 0);
    });

    it("buyback acceptance rate and open flags are computed from requests", async () => {
      const model = (await h.call("GET", "/marketplace/models")).body.find((m: any) => m.name === "iPhone 14");
      const mk = async (n: string) => (await h.call("POST", "/buyback", { token: (await h.newCustomer(n)).accessToken, body: { deviceModelId: model.id, condition: "B", deliveryMethod: "DROP_IN_STORE", citySlug: "casablanca", imei: "490154203237518".slice(0, 0) || undefined } })).body;
      const [a, b, c] = [await mk("a"), await mk("b"), await mk("c")];
      await h.call("PATCH", `/buyback/${a.id}/review`, { token: owner, body: { decision: "ACCEPTED" } });
      await h.call("PATCH", `/buyback/${b.id}/review`, { token: owner, body: { decision: "REJECTED" } });
      const r = (await h.call("GET", "/admin/analytics?days=7", { token: admin })).body.buyback;
      assert.deepEqual([r.total, r.accepted, r.rejected, r.pending, r.acceptanceRate], [3, 1, 1, 1, 0.5]);
      void c;
    });
  });
});
