import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Harness, startHarness } from "./helpers/harness";

describe("validation: every input is bounded and typed", () => {
  let h: Harness;
  let client: string, owner: string, admin: string, listingId: string, phoneModelId: string;

  before(async () => {
    h = await startHarness();
    client = (await h.login("client")).accessToken;
    owner = (await h.login("owner.casablanca")).accessToken;
    admin = (await h.login("admin")).accessToken;
    listingId = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items[0].id;
    phoneModelId = (await h.call("GET", "/marketplace/models")).body.find((m: any) => m.deviceType === "PHONE").id;
  });
  after(async () => { await h.close(); });

  const order = (over: Record<string, unknown> = {}, headers?: Record<string, string>) =>
    h.call("POST", "/orders", { token: client, headers, body: { items: [{ listingId, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH", ...over } });
  const buyback = (over: Record<string, unknown> = {}) =>
    h.call("POST", "/buyback", { token: client, body: { deviceModelId: phoneModelId, condition: "B", deliveryMethod: "DROP_IN_STORE", citySlug: "casablanca", ...over } });

  describe("orders", () => {
    const bad: [string, Record<string, unknown>][] = [
      ["empty basket", { items: [] }],
      ["more than 20 lines", { items: Array.from({ length: 21 }, () => ({ listingId, quantity: 1 })) }],
      ["quantity 0", { items: [{ listingId, quantity: 0 }] }],
      ["quantity 11", { items: [{ listingId, quantity: 11 }] }],
      ["fractional quantity", { items: [{ listingId, quantity: 1.5 }] }],
      ["negative quantity", { items: [{ listingId, quantity: -1 }] }],
      ["string quantity", { items: [{ listingId, quantity: "1" }] }],
      ["same listing twice", { items: [{ listingId, quantity: 1 }, { listingId, quantity: 1 }] }],
      ["missing delivery method", { deliveryMethod: undefined }],
      ["PICKUP_FROM_HOME (buyback only)", { deliveryMethod: "PICKUP_FROM_HOME" }],
      ["unimplemented payment method CARD", { paymentMethod: "CARD" }],
      ["unimplemented payment method STRIPE", { paymentMethod: "STRIPE" }],
      ["courier without an address", { deliveryMethod: "COURIER", paymentMethod: "ASLAN" }],
      ["courier paid in cash", { deliveryMethod: "COURIER", paymentMethod: "CASH", deliveryAddress: { address: "12 rue des Orangers", city: "Casablanca" } }],
      ["address with extra properties", { deliveryMethod: "COURIER", paymentMethod: "ASLAN", deliveryAddress: { address: "12 rue des Orangers", city: "Casablanca", "<script>": "x" } }],
      ["address too short", { deliveryMethod: "COURIER", paymentMethod: "ASLAN", deliveryAddress: { address: "x", city: "Casablanca" } }],
      ["bad zip", { deliveryMethod: "COURIER", paymentMethod: "ASLAN", deliveryAddress: { address: "12 rue des Orangers", city: "Casablanca", zip: "ab" } }],
      ["notes over 500 chars", { notes: "n".repeat(501) }],
      ["unknown property", { total: 1 }],
      ["client-supplied price", { items: [{ listingId, quantity: 1, price: 1 }] }],
    ];
    for (const [name, over] of bad) it(`rejects: ${name}`, async () => { assert.equal((await order(over)).status, 400); });

    it("answers 404 for an unknown listing", async () => {
      assert.equal((await order({ items: [{ listingId: "nope", quantity: 1 }] })).status, 404);
    });

    it("rejects a malformed Idempotency-Key", async () => {
      for (const key of ["short", "has spaces in it!", "x".repeat(101)]) assert.equal((await order({}, { "idempotency-key": key })).status, 400, key);
    });

    it("stores a normalised address, nothing more", async () => {
      const r = await order({ deliveryMethod: "COURIER", paymentMethod: "ASLAN", deliveryAddress: { address: "  12 rue des Orangers ", city: "Casablanca", region: "Casablanca-Settat", zip: "20250" } });
      assert.equal(r.status, 201);
      assert.deepEqual(r.body.deliveryAddress, { address: "12 rue des Orangers", city: "Casablanca", region: "Casablanca-Settat", zip: "20250" });
    });
  });

  describe("buyback requests", () => {
    const bad: [string, Record<string, unknown>][] = [
      ["IMEI with letters", { imei: "49015420323751X" }],
      ["IMEI too short", { imei: "12345" }],
      ["IMEI 5000 chars", { imei: "x".repeat(5000) }],
      ["image that is not a URL", { images: ["javascript:alert(1)"] }],
      ["plain http image", { images: ["http://insecure.example/a.jpg"] }],
      ["image that is not a string", { images: [12] }],
      ["more than 8 images", { images: Array.from({ length: 9 }, (_, i) => `https://img.example/${i}.jpg`) }],
      ["description over 1000 chars", { description: "d".repeat(1001) }],
      ["pickup without an address", { deliveryMethod: "PICKUP_FROM_HOME" }],
      ["COURIER (orders only)", { deliveryMethod: "COURIER" }],
      ["invalid condition", { condition: "Z" }],
      ["city with unsafe characters", { citySlug: "../etc/passwd" }],
      ["bad preferred date", { preferredDate: "tomorrow-ish" }],
      ["unknown property", { fraudScore: 0 }],
    ];
    for (const [name, over] of bad) it(`rejects: ${name}`, async () => { assert.equal((await buyback(over)).status, 400); });

    it("rejects an unknown city with a clear message and an unknown model with 404", async () => {
      const city = await buyback({ citySlug: "atlantis" });
      assert.equal(city.status, 400);
      assert.match(city.body.message, /Ville inconnue/);
      assert.equal((await buyback({ deviceModelId: "nope" })).status, 404);
    });

    it("refuses to quote a model that has no market baseline (422), instead of offering 0 MAD", async () => {
      const brand = await h.prisma.brand.findFirstOrThrow();
      const m = await h.prisma.deviceModel.create({ data: { brandId: brand.id, name: "Unpriced", slug: "unpriced", deviceType: "PHONE" } });
      const r = await buyback({ deviceModelId: m.id });
      assert.equal(r.status, 422);
      const est = await h.call("GET", `/pricing/estimate?brandSlug=${brand.slug}&modelSlug=unpriced&condition=B`);
      assert.equal(est.status, 422);
    });

    it("accepts a clean request", async () => {
      const r = await buyback({ imei: "490154203237518", description: "Écran impeccable", images: ["https://img.example/a.jpg"] });
      assert.equal(r.status, 201);
      assert.equal(r.body.status, "PENDING");
      assert.ok(r.body.estimatedBuybackPrice > 0);
      assert.ok(!JSON.stringify(r.body).includes("baseMarketPrice"));
    });
  });

  describe("marketplace queries", () => {
    const bad = ["limit=51", "limit=0", "limit=-1", "limit=abc", "limit=100000", "page=0", "page=abc", "page=1.5", "minPrice=-1", "minPrice=abc", "minPrice=500&maxPrice=100",
      "sortBy=hack", "deviceType=FAX", "condition=Z", "city=../x", "brand=%3Cscript%3E", `search=${"s".repeat(101)}`, "unknown=1"];
    for (const q of bad) it(`rejects ?${q.slice(0, 40)}`, async () => { assert.equal((await h.call("GET", `/marketplace/listings?${q}`)).status, 400, q); });

    it("caps the page size at 50 and reports pagination", async () => {
      const r = await h.call("GET", "/marketplace/listings?limit=50");
      assert.equal(r.status, 200);
      assert.equal(r.body.pagination.limit, 50);
      assert.ok(r.body.pagination.total >= 3);
    });

    it("treats search text as data: SQL metacharacters change nothing", async () => {
      const r = await h.call("GET", `/marketplace/listings?search=${encodeURIComponent("'; DROP TABLE users; --")}`);
      assert.equal(r.status, 200);
      assert.equal(r.body.items.length, 0);
      assert.ok((await h.prisma.user.count()) > 0);
    });
  });

  describe("pricing estimate", () => {
    it("is read-only: anonymous calls never write to the database", async () => {
      const before = await h.prisma.priceHistory.count();
      for (let i = 0; i < 5; i++) assert.equal((await h.call("GET", "/pricing/estimate?brandSlug=apple&modelSlug=iphone-14&condition=B")).status, 200);
      assert.equal(await h.prisma.priceHistory.count(), before);
    });

    it("returns whole dirhams, ordered by condition, with consistent ranges", async () => {
      const q = async (c: string) => (await h.call("GET", `/pricing/estimate?brandSlug=apple&modelSlug=iphone-14&condition=${c}`)).body;
      const [a, b, c, d] = [await q("A"), await q("B"), await q("C"), await q("D")];
      assert.ok(a.buybackPrice > b.buybackPrice && b.buybackPrice > c.buybackPrice && c.buybackPrice > d.buybackPrice);
      for (const e of [a, b, c, d]) {
        assert.ok(Object.values(e).filter((v) => typeof v === "number").every((v: any) => Number.isInteger(v)), "whole dirhams");
        assert.ok(e.buybackMin <= e.buybackPrice && e.buybackPrice <= e.buybackMax);
        assert.ok(e.resaleMin >= e.buybackPrice && e.resaleMax >= e.resaleMin);
        assert.equal(e.confidenceScore, undefined, "no invented confidence figure");
      }
    });

    it("validates its parameters and answers 404 for an unknown model", async () => {
      assert.equal((await h.call("GET", "/pricing/estimate?brandSlug=apple&modelSlug=iphone-14&condition=Z")).status, 400);
      assert.equal((await h.call("GET", "/pricing/estimate?brandSlug=Apple!&modelSlug=iphone-14&condition=B")).status, 400);
      assert.equal((await h.call("GET", "/pricing/estimate?brandSlug=apple&modelSlug=nokia-3310&condition=B")).status, 404);
    });
  });

  describe("franchise listings", () => {
    const base = async () => ({ deviceModelId: phoneModelId, condition: "B", title: "iPhone test 128GB", buybackPrice: 1000, listingPrice: 1500, stockQuantity: 2, images: ["https://img.example/a.jpg"] });
    const create = async (over: Record<string, unknown>) => h.call("POST", "/products", { token: owner, body: { ...(await base()), ...over } });

    const bad: [string, Record<string, unknown>][] = [
      ["fractional price (payment provider needs whole MAD)", { listingPrice: 1500.5 }],
      ["negative price", { buybackPrice: -1 }],
      ["selling below purchase price", { buybackPrice: 2000, listingPrice: 1500 }],
      ["price above 10 million", { listingPrice: 10_000_001 }],
      ["plain http image", { images: ["http://x.example/a.jpg"] }],
      ["title too short", { title: "abc" }],
      ["stock above 1000", { stockQuantity: 1001 }],
      ["negative stock", { stockQuantity: -1 }],
      ["warranty above 36 months", { warrantyMonths: 37 }],
      ["unknown property (specs)", { specs: { a: 1 } }],
      ["status injection", { status: "SOLD" }],
    ];
    for (const [name, over] of bad) it(`rejects: ${name}`, async () => { assert.equal((await create(over)).status, 400); });

    it("rejects an unknown or disabled model", async () => {
      assert.equal((await create({ deviceModelId: "nope" })).status, 400);
      await h.prisma.deviceModel.update({ where: { id: phoneModelId }, data: { isActive: false } });
      assert.equal((await create({})).status, 400);
      await h.prisma.deviceModel.update({ where: { id: phoneModelId }, data: { isActive: true } });
    });

    it("creates the listing and its inventory together", async () => {
      const r = await create({});
      assert.equal(r.status, 201);
      const inv = await h.prisma.inventory.findUniqueOrThrow({ where: { listingId: r.body.id } });
      assert.equal(inv.quantity, 2);
      assert.equal(inv.reserved, 0);
    });

    it("update: only allowed statuses, price floor, and never below reserved stock", async () => {
      const created = (await create({ stockQuantity: 3 })).body;
      const patch = (body: unknown) => h.call("PATCH", `/products/${created.id}`, { token: owner, body });
      assert.equal((await patch({ status: "SOLD" })).status, 400);
      assert.equal((await patch({ listingPrice: 900 })).status, 400, "below the purchase price");
      assert.equal((await patch({ buybackPrice: 1 })).status, 400, "purchase price is not editable");

      await h.call("POST", "/orders", { token: client, body: { items: [{ listingId: created.id, quantity: 2 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH" } });
      assert.equal((await patch({ stockQuantity: 1 })).status, 409, "2 units are reserved");
      assert.equal((await patch({ stockQuantity: 2 })).status, 200);
      assert.equal((await patch({ listingPrice: 1800, status: "ARCHIVED" })).status, 200);
    });

    it("lets one franchise touch only its own listings", async () => {
      const ownerRabat = (await h.login("owner.rabat")).accessToken;
      const mine = (await create({})).body;
      assert.equal((await h.call("PATCH", `/products/${mine.id}`, { token: ownerRabat, body: { listingPrice: 2000 } })).status, 404);
      assert.equal((await h.call("DELETE", `/products/${mine.id}`, { token: ownerRabat })).status, 404);
    });
  });

  describe("admin inputs", () => {
    it("rejects an out-of-range or non-numeric analytics window", async () => {
      for (const days of ["1", "6", "366", "9999", "abc", "12abc", "1.5", ""]) assert.equal((await h.call("GET", `/admin/analytics?days=${days}`, { token: admin })).status, 400, days);
      for (const days of ["7", "30", "365"]) assert.equal((await h.call("GET", `/admin/analytics?days=${days}`, { token: admin })).status, 200, days);
    });

    it("rejects pagination abuse on admin lists", async () => {
      for (const q of ["limit=101", "limit=0", "page=0", "page=x"]) assert.equal((await h.call("GET", `/admin/users?${q}`, { token: admin })).status, 400, q);
    });

    it("rejects a commission rate outside 0-50% and unknown fields on franchise updates", async () => {
      const f = await h.prisma.franchise.findFirstOrThrow({ where: { slug: "demo-casablanca" } });
      for (const body of [{ commissionRate: 5 }, { commissionRate: -0.1 }, { commissionRate: 0.51 }, { ownerId: "x" }, { status: "DELETED" }, { name: "x" }]) {
        assert.equal((await h.call("PATCH", `/admin/franchises/${f.id}`, { token: admin, body })).status, 400, JSON.stringify(body));
      }
      assert.equal((await h.call("PATCH", `/admin/franchises/${f.id}`, { token: admin, body: { commissionRate: 0.12 } })).status, 200);
    });

    it("validates the IMEI path parameter and the model price", async () => {
      assert.equal((await h.call("GET", "/admin/imei/12345", { token: admin })).status, 400);
      assert.equal((await h.call("GET", "/admin/imei/490154203237518", { token: admin })).status, 200);
      assert.equal((await h.call("PATCH", `/admin/catalog/models/${phoneModelId}`, { token: admin, body: { baseMarketPrice: 50.5 } })).status, 400);
      assert.equal((await h.call("PATCH", `/admin/catalog/models/${phoneModelId}`, { token: admin, body: { baseMarketPrice: 10 } })).status, 400);
    });
  });
});
