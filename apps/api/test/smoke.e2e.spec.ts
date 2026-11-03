import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Harness, startHarness } from "./helpers/harness";

describe("smoke: the full application boots against a real database", () => {
  let h: Harness;
  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });

  it("answers the health check with a database ping", async () => {
    const r = await h.call("GET", "/health");
    assert.equal(r.status, 200);
    assert.equal(r.body.database, "up");
  });

  it("lists the 10 launch cities from the reference data", async () => {
    const r = await h.call("GET", "/cities");
    assert.equal(r.body.length, 10);
  });

  it("logs a demo admin in", async () => {
    const t = await h.login("admin");
    assert.equal(t.role, "ADMIN");
  });
});
