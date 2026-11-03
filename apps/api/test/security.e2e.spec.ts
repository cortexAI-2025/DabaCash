import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Harness, startHarness } from "./helpers/harness";

describe("security: access control, data exposure, transport, error handling", () => {
  let h: Harness;
  let admin: string, owner: string, ownerRabat: string, client: string, other: string;
  let listingId: string;

  before(async () => {
    h = await startHarness();
    admin = (await h.login("admin")).accessToken;
    owner = (await h.login("owner.casablanca")).accessToken;
    ownerRabat = (await h.login("owner.rabat")).accessToken;
    client = (await h.login("client")).accessToken;
    other = (await h.newCustomer("other")).accessToken;
    listingId = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items[0].id;
  });
  after(async () => { await h.close(); });

  describe("authentication is required", () => {
    const protectedRoutes: [string, string][] = [
      ["GET", "/users/me"], ["PATCH", "/users/me"], ["GET", "/users/me/export"], ["GET", "/orders/my"], ["POST", "/orders"], ["GET", "/buyback/my"],
      ["POST", "/buyback"], ["GET", "/products/my"], ["GET", "/inventory"], ["GET", "/franchises/dashboard"], ["GET", "/admin/stats"],
      ["GET", "/admin/users"], ["GET", "/admin/audit"], ["POST", "/payments/aslan/checkout"], ["GET", "/orders/anything"], ["GET", "/buyback/anything"],
    ];
    for (const [m, p] of protectedRoutes) {
      it(`${m} ${p} -> 401 without a token`, async () => { assert.equal((await h.call(m, p, m === "GET" ? {} : { body: {} })).status, 401); });
    }
  });

  describe("role matrix (403 for the wrong role, never 401/500)", () => {
    // [path, roles that may call it]
    const matrix: [string, string[]][] = [
      ["/admin/stats", ["admin"]], ["/admin/users", ["admin"]], ["/admin/audit", ["admin"]], ["/admin/payments", ["admin"]],
      ["/admin/catalog/models", ["admin"]], ["/admin/fraud/flagged", ["admin"]], ["/admin/orders", ["admin"]], ["/admin/analytics", ["admin"]],
      ["/orders/my", ["client"]], ["/orders/franchise", ["owner"]], ["/buyback/my", ["client"]], ["/buyback/franchise", ["owner"]],
      ["/products/my", ["owner"]], ["/inventory", ["owner"]], ["/inventory/summary", ["owner"]],
      ["/franchises/dashboard", ["owner"]], ["/franchises/dashboard/analytics", ["owner"]],
    ];
    for (const [path, allowed] of matrix) {
      it(`${path} is for ${allowed.join("/")} only`, async () => {
        const tokens: Record<string, string> = { admin, owner, client };
        for (const [role, token] of Object.entries(tokens)) {
          const r = await h.call("GET", path, { token });
          if (allowed.includes(role)) assert.ok(r.status < 400, `${role} should be allowed on ${path}, got ${r.status}`);
          else assert.equal(r.status, 403, `${role} must be refused on ${path}`);
        }
      });
    }
  });

  describe("objects belonging to someone else are invisible (404, not 403)", () => {
    let orderId: string, buybackId: string;
    before(async () => {
      orderId = (await h.call("POST", "/orders", { token: client, body: { items: [{ listingId, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" } })).body.id;
      const model = (await h.call("GET", "/marketplace/models")).body.find((m: any) => m.deviceType === "PHONE");
      buybackId = (await h.call("POST", "/buyback", { token: client, body: { deviceModelId: model.id, condition: "B", deliveryMethod: "DROP_IN_STORE", citySlug: "casablanca" } })).body.id;
    });

    it("another customer cannot read the order or the buyback request", async () => {
      assert.equal((await h.call("GET", `/orders/${orderId}`, { token: other })).status, 404);
      assert.equal((await h.call("GET", `/buyback/${buybackId}`, { token: other })).status, 404);
    });

    it("a franchise owner of another city cannot read or act on them", async () => {
      assert.equal((await h.call("GET", `/orders/${orderId}`, { token: ownerRabat })).status, 404);
      assert.equal((await h.call("GET", `/buyback/${buybackId}`, { token: ownerRabat })).status, 404);
      assert.equal((await h.call("PATCH", `/orders/${orderId}/status`, { token: ownerRabat, body: { status: "CONFIRMED" } })).status, 403);
      assert.equal((await h.call("PATCH", `/buyback/${buybackId}/review`, { token: ownerRabat, body: { decision: "ACCEPTED" } })).status, 404);
    });

    it("the owner, the fulfilling franchise and an admin can read them", async () => {
      assert.equal((await h.call("GET", `/orders/${orderId}`, { token: client })).status, 200);
      const asOwner = await h.call("GET", `/orders/${orderId}`, { token: owner });
      assert.equal(asOwner.status, 200);
      assert.ok(asOwner.body.customer.email, "the franchise sees who to serve");
      assert.equal((await h.call("GET", `/orders/${orderId}`, { token: admin })).status, 200);
      assert.equal((await h.call("GET", `/buyback/${buybackId}`, { token: owner })).status, 200);
    });

    it("an order response never exposes the franchise owner id", async () => {
      const r = await h.call("GET", `/orders/${orderId}`, { token: client });
      assert.ok(!JSON.stringify(r.body).includes("ownerId"));
    });

    it("a customer cannot cancel someone else's order, nor change statuses", async () => {
      assert.equal((await h.call("POST", `/orders/${orderId}/cancel`, { token: other })).status, 404);
      assert.equal((await h.call("PATCH", `/orders/${orderId}/status`, { token: client, body: { status: "DELIVERED" } })).status, 403);
    });

    it("a customer does not see the fraud internals of their own request", async () => {
      const r = await h.call("GET", `/buyback/${buybackId}`, { token: client });
      assert.equal(r.body.fraudScore, undefined);
      assert.equal(r.body.fraudReasons, undefined);
      assert.equal(r.body.isFlagged, undefined);
      const staff = await h.call("GET", `/buyback/${buybackId}`, { token: owner });
      assert.notEqual(staff.body.fraudScore, undefined);
    });

    it("an unknown id is a clean 404, never a 500", async () => {
      assert.equal((await h.call("GET", "/orders/does-not-exist", { token: admin })).status, 404);
      assert.equal((await h.call("GET", "/buyback/does-not-exist", { token: admin })).status, 404);
      assert.equal((await h.call("GET", "/marketplace/listings/does-not-exist")).status, 404);
      assert.equal((await h.call("GET", "/franchises/does-not-exist")).status, 404);
    });
  });

  describe("public endpoints do not leak internals", () => {
    const secretsIn = (v: unknown) => /buybackPrice|commissionRate|ownerId|passwordHash|"email"/.test(JSON.stringify(v));

    it("listings expose the sale price but not what the franchise paid", async () => {
      const list = await h.call("GET", "/marketplace/listings");
      assert.ok(list.body.items.length > 0);
      assert.ok(!secretsIn(list.body), "list leaks an internal field");
      assert.ok(list.body.items[0].listingPrice > 0);
      assert.ok(!secretsIn((await h.call("GET", `/marketplace/listings/${listingId}`)).body), "detail leaks an internal field");
      assert.ok(!secretsIn((await h.call("GET", "/marketplace/listings/featured")).body), "featured leaks an internal field");
    });

    it("the public franchise profile has no owner, commission rate or email", async () => {
      assert.ok(!secretsIn((await h.call("GET", "/franchises/demo-casablanca")).body));
      assert.ok(!secretsIn((await h.call("GET", "/franchises")).body));
    });

    it("a customer's own order does not reveal the franchise's purchase price", async () => {
      const mine = await h.call("GET", "/orders/my", { token: client });
      assert.ok(!/buybackPrice/.test(JSON.stringify(mine.body)));
    });

    it("the device-model list does not expose the market baselines", async () => {
      assert.ok(!/baseMarketPrice/.test(JSON.stringify((await h.call("GET", "/marketplace/models")).body)));
    });
  });

  describe("listing visibility", () => {
    it("archived and draft listings are hidden; sold ones stay readable; suspended franchises vanish and come back", async () => {
      const f = await h.prisma.franchise.findFirstOrThrow({ where: { slug: "demo-casablanca" } });
      const l = await h.prisma.productListing.findFirstOrThrow({ where: { franchiseId: f.id } });
      const visible = async () => (await h.call("GET", `/marketplace/listings/${l.id}`)).status;
      const inList = async () => (await h.call("GET", "/marketplace/listings?limit=50")).body.items.some((x: any) => x.id === l.id);

      assert.equal(await visible(), 200);
      for (const status of ["ARCHIVED", "DRAFT"] as const) {
        await h.prisma.productListing.update({ where: { id: l.id }, data: { status } });
        assert.equal(await visible(), 404, status);
        assert.equal(await inList(), false, status);
      }
      await h.prisma.productListing.update({ where: { id: l.id }, data: { status: "SOLD" } });
      assert.equal(await visible(), 200);
      await h.prisma.productListing.update({ where: { id: l.id }, data: { status: "ACTIVE" } });

      await h.prisma.franchise.update({ where: { id: f.id }, data: { status: "SUSPENDED" } });
      assert.equal(await visible(), 404);
      assert.equal(await inList(), false);
      assert.equal((await h.call("GET", "/franchises/demo-casablanca")).status, 404);
      await h.prisma.franchise.update({ where: { id: f.id }, data: { status: "ACTIVE" } });
      assert.equal(await visible(), 200);
    });
  });

  describe("transport and headers", () => {
    it("sets security headers and does not advertise the framework", async () => {
      const r = await h.call("GET", "/cities");
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
      assert.ok(r.headers.get("strict-transport-security"));
      assert.equal(r.headers.get("x-powered-by"), null);
    });

    it("CORS: an allowed origin is echoed, any other origin gets no CORS header", async () => {
      const allowed = await fetch(`${h.url}/api/v1/cities`, { headers: { Origin: "https://app.dabacash.test" } });
      assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.dabacash.test");
      const evil = await fetch(`${h.url}/api/v1/cities`, { headers: { Origin: "https://evil.example" } });
      assert.equal(evil.headers.get("access-control-allow-origin"), null);
    });

    it("CORS preflight allows Idempotency-Key and Authorization for the allowed origin only", async () => {
      const pre = (origin: string) => fetch(`${h.url}/api/v1/orders`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,idempotency-key,content-type" } });
      const ok = await pre("https://app.dabacash.test");
      assert.ok(ok.status < 300);
      assert.match(ok.headers.get("access-control-allow-headers") ?? "", /idempotency-key/i);
      assert.equal((await pre("https://evil.example")).headers.get("access-control-allow-origin"), null);
    });

    it("does not serve the Swagger UI when it is disabled", async () => {
      assert.equal((await fetch(`${h.url}/docs`)).status, 404);
    });
  });

  describe("errors", () => {
    it("every error has one JSON shape with a request id, echoed in X-Request-Id", async () => {
      const r = await h.call("GET", "/nope");
      assert.equal(r.status, 404);
      assert.equal(typeof r.body.message, "string");
      assert.ok(r.body.requestId);
      assert.equal(r.headers.get("x-request-id"), r.body.requestId);
    });

    it("honours a well-formed incoming request id and ignores a malicious one", async () => {
      const good = await h.call("GET", "/nope", { headers: { "x-request-id": "trace-12345678" } });
      assert.equal(good.body.requestId, "trace-12345678");
      const bad = await h.call("GET", "/nope", { headers: { "x-request-id": "<script>alert(1)</script> ../../etc" } });
      assert.notEqual(bad.body.requestId, "<script>alert(1)</script> ../../etc");
      assert.match(bad.body.requestId, /^[0-9a-f-]{36}$/, "a fresh uuid was generated instead");
    });

    it("answers malformed JSON with 400 and an oversized body with 413, never a stack trace", async () => {
      const bad = await h.call("POST", "/auth/login", { raw: "{not json" });
      assert.equal(bad.status, 400);
      assert.ok(!/at .*\.ts|node_modules/.test(JSON.stringify(bad.body)));
      const big = await h.call("POST", "/auth/login", { raw: JSON.stringify({ email: "a@b.co", password: "x".repeat(300_000) }) });
      assert.equal(big.status, 413);
    });

    it("rejects unknown properties instead of silently accepting them", async () => {
      const r = await h.call("POST", "/auth/login", { body: { email: "a@b.co", password: "x", extra: 1 } });
      assert.equal(r.status, 400);
    });
  });

  describe("webhook endpoint", () => {
    it("is public but refuses anything not signed by Aslan", async () => {
      assert.equal((await h.call("POST", "/payments/aslan/webhook", { body: { event: "payment.succeeded" } })).status, 401);
    });
  });
});
