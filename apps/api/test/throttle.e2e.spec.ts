import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Harness, startHarness } from "./helpers/harness";

describe("rate limiting (limiter enabled)", () => {
  let h: Harness;
  before(async () => { h = await startHarness({ throttle: true, env: { THROTTLE_LIMIT: "60" } }); });
  after(async () => { await h.close(); });

  it("limits login attempts per IP: the 11th within a minute is refused with Retry-After", async () => {
    const statuses: number[] = [];
    let last: any;
    for (let i = 0; i < 12; i++) {
      last = await h.call("POST", "/auth/login", { body: { email: `nobody${i}@test.dabacash.test`, password: "Wrong-Passw0rd" } });
      statuses.push(last.status);
    }
    assert.equal(statuses.slice(0, 10).every((s) => s === 401), true, JSON.stringify(statuses));
    assert.deepEqual(statuses.slice(10), [429, 429]);
    assert.ok(Number(last.headers.get("retry-after")) > 0);
    assert.equal(typeof last.body.message, "string");
  });

  it("limits registrations per IP per hour", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await h.call("POST", "/auth/register", { body: { email: `r${i}@test.dabacash.test`, password: "Test-Passw0rd-2024", firstName: "R", lastName: "L" } });
      statuses.push(r.status);
    }
    assert.equal(statuses.filter((s) => s === 201).length, 10);
    assert.equal(statuses.filter((s) => s === 429).length, 2);
  });

  it("limits the public price estimator so it cannot be hammered", async () => {
    const q = "/pricing/estimate?brandSlug=apple&modelSlug=iphone-14&condition=B";
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) statuses.push((await h.call("GET", q)).status);
    assert.equal(statuses.filter((s) => s === 200).length, 30);
    assert.equal(statuses.filter((s) => s === 429).length, 2);
  });

  it("applies a global ceiling to ordinary endpoints", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 70; i++) statuses.push((await h.call("GET", "/cities")).status);
    assert.ok(statuses.includes(429), "a global limit exists");
    assert.ok(statuses.slice(0, 20).every((s) => s === 200));
  });

  it("never throttles the health check or the signed payment webhook", async () => {
    for (let i = 0; i < 80; i++) assert.equal((await h.call("GET", "/health")).status, 200);
    const statuses = new Set<number>();
    for (let i = 0; i < 80; i++) statuses.add((await h.call("POST", "/payments/aslan/webhook", { body: { event: "x" } })).status);
    assert.deepEqual([...statuses], [401], "answered by the signature check, never by the limiter");
  });
});
