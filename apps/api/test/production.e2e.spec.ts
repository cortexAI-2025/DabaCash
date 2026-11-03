import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Harness, startHarness } from "./helpers/harness";

describe("production mode", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness({
      throttle: true,
      env: { NODE_ENV: "production", BCRYPT_ROUNDS: "10", ENABLE_SWAGGER: undefined, CORS_ORIGINS: "https://app.dabacash.ma", WEB_URL: "https://dabacash.ma" },
    });
  });
  after(async () => { await h.close(); });

  it("serves the API but not the Swagger UI", async () => {
    assert.equal((await h.call("GET", "/cities")).status, 200);
    assert.equal((await fetch(`${h.url}/docs`)).status, 404);
  });

  it("only the configured web origin may call the API from a browser", async () => {
    const ok = await fetch(`${h.url}/api/v1/cities`, { headers: { Origin: "https://app.dabacash.ma" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "https://app.dabacash.ma");
    for (const origin of ["http://localhost:3000", "https://evil.example", "https://app.dabacash.ma.evil.example"]) {
      const r = await fetch(`${h.url}/api/v1/cities`, { headers: { Origin: origin } });
      assert.equal(r.headers.get("access-control-allow-origin"), null, origin);
    }
  });

  it("keeps the rate limiter and the security headers on", async () => {
    const r = await h.call("GET", "/cities");
    assert.ok(r.headers.get("strict-transport-security"));
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    let refused = 0;
    for (let i = 0; i < 12; i++) if ((await h.call("POST", "/auth/login", { body: { email: `x${i}@t.test`, password: "Wrong-Passw0rd" } })).status === 429) refused++;
    assert.ok(refused >= 1);
  });

  it("errors never leak stack traces or internals", async () => {
    const r = await h.call("GET", "/orders/anything");
    assert.equal(r.status, 401);
    assert.ok(!/at .*\.(ts|js):\d+|node_modules|prisma/i.test(JSON.stringify(r.body)));
  });
});
