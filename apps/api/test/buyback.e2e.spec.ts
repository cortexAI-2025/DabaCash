import { strict as assert } from "node:assert";
import { after, before, beforeEach, describe, it } from "node:test";
import { Harness, startHarness, waitFor } from "./helpers/harness";

const IMEI = "490154203237518"; // valid Luhn
const IMEI_2 = "356938035643809"; // valid Luhn

describe("buyback: lifecycle, matching, fraud review, IMEI controls", () => {
  let h: Harness;
  let client: string, owner: string, ownerRabat: string, admin: string, phone: any;

  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });
  beforeEach(async () => {
    await h.reset();
    client = (await h.login("client")).accessToken;
    owner = (await h.login("owner.casablanca")).accessToken;
    ownerRabat = (await h.login("owner.rabat")).accessToken;
    admin = (await h.login("admin")).accessToken;
    phone = (await h.call("GET", "/marketplace/models")).body.find((m: any) => m.name === "iPhone 14");
  });

  const create = (over: Record<string, unknown> = {}, token = client, headers?: Record<string, string>) =>
    h.call("POST", "/buyback", { token, headers, body: { deviceModelId: phone.id, condition: "B", deliveryMethod: "DROP_IN_STORE", citySlug: "casablanca", ...over } });
  const review = (id: string, body: unknown, token = owner) => h.call("PATCH", `/buyback/${id}/review`, { token, body });
  const row = (id: string) => h.prisma.buybackRequest.findUniqueOrThrow({ where: { id } });
  const audit = async (entityId: string) => (await h.prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } })).map((a) => a.action);

  describe("request lifecycle", () => {
    it("estimate -> franchise accepts at the estimate -> device received -> completed, with emails and an audit trail", async () => {
      const r = (await create({ imei: IMEI_2 })).body;
      assert.equal(r.status, "PENDING");
      assert.equal(r.franchise.city, "Casablanca");
      for (const k of ["fraudScore", "fraudReasons", "isFlagged", "fraudNote", "fraudResolution"]) assert.equal(r[k], undefined, `the customer does not see ${k}`);

      const list = await h.call("GET", "/buyback/franchise", { token: owner });
      assert.equal(list.body.items[0].id, r.id);
      assert.equal(list.body.items[0].customer.email, "client@demo.dabacash.test");

      const acc = await review(r.id, { decision: "ACCEPTED" });
      assert.equal(acc.status, 200);
      assert.equal(acc.body.status, "ACCEPTED");
      assert.equal(acc.body.finalBuybackPrice, (await row(r.id)).estimatedBuybackPrice);
      assert.ok(await waitFor(() => h.resend.mails.find((m) => m.subject === "Rachat accepté")));

      const done = await h.call("POST", `/buyback/${r.id}/complete`, { token: owner });
      assert.equal(done.body.status, "COMPLETED");
      assert.ok((await row(r.id)).completedAt);
      assert.ok(await waitFor(() => h.resend.mails.find((m) => m.subject === "Rachat finalisé")));
      assert.deepEqual(await audit(r.id), ["BUYBACK_DECIDED", "BUYBACK_COMPLETED"]);
    });

    it("a rejection stores no price and the decision is final", async () => {
      const r = (await create()).body;
      const rej = await review(r.id, { decision: "REJECTED", franchiseNotes: "Écran fissuré" });
      assert.equal(rej.body.status, "REJECTED");
      assert.equal((await row(r.id)).finalBuybackPrice, null);
      assert.equal((await review(r.id, { decision: "ACCEPTED" })).status, 409);
      assert.equal((await h.call("POST", `/buyback/${r.id}/complete`, { token: owner })).status, 409, "only an accepted request can complete");
    });

    it("a price override beyond 50% of the estimate must be explained; zero and non-integers are refused", async () => {
      const r = (await create()).body;
      const est = (await row(r.id)).estimatedBuybackPrice!;
      assert.equal((await review(r.id, { decision: "ACCEPTED", finalBuybackPrice: 0 })).status, 400);
      assert.equal((await review(r.id, { decision: "ACCEPTED", finalBuybackPrice: 99.5 })).status, 400);
      assert.equal((await review(r.id, { decision: "ACCEPTED", finalBuybackPrice: est * 3 })).status, 400, "x3 without a note");
      const ok = await review(r.id, { decision: "ACCEPTED", finalBuybackPrice: Math.round(est * 0.8) });
      assert.equal(ok.status, 200, "a 20% adjustment needs no note");
      assert.equal(ok.body.finalBuybackPrice, Math.round(est * 0.8));
    });

    it("an override beyond the tolerance is accepted with a note, and the decision records that it overrode the estimate", async () => {
      const r = (await create()).body;
      const est = (await row(r.id)).estimatedBuybackPrice!;
      assert.equal((await review(r.id, { decision: "ACCEPTED", finalBuybackPrice: Math.round(est * 0.3), franchiseNotes: "Batterie à 60 %, écran rayé" })).status, 200);
      const a = await h.prisma.auditLog.findFirstOrThrow({ where: { entityId: r.id, action: "BUYBACK_DECIDED" } });
      assert.equal((a.metadata as any).overridden, true);
      assert.equal((a.metadata as any).estimate, est);
    });

    it("the customer can withdraw until the device is taken, never someone else's request", async () => {
      const a = (await create()).body;
      assert.equal((await h.call("POST", `/buyback/${a.id}/cancel`, { token: client })).body.status, "CANCELLED");
      assert.equal((await h.call("POST", `/buyback/${a.id}/cancel`, { token: client })).status, 409, "already cancelled");

      const b = (await create()).body;
      await review(b.id, { decision: "ACCEPTED" });
      assert.equal((await h.call("POST", `/buyback/${b.id}/cancel`, { token: client })).status, 200, "still allowed once accepted");

      const c = (await create()).body;
      await review(c.id, { decision: "ACCEPTED" });
      await h.call("POST", `/buyback/${c.id}/complete`, { token: owner });
      assert.equal((await h.call("POST", `/buyback/${c.id}/cancel`, { token: client })).status, 409, "the device was already handed over");

      const stranger = await h.newCustomer("stranger");
      const d = (await create()).body;
      assert.equal((await h.call("POST", `/buyback/${d.id}/cancel`, { token: stranger.accessToken })).status, 404);
    });

    it("no customer-facing endpoint reveals the detection internals, even for a flagged request", async () => {
      await create({ imei: IMEI });
      const other = await h.newCustomer("flagged");
      const dup = (await create({ imei: IMEI }, other.accessToken)).body;
      assert.equal((await row(dup.id)).isFlagged, true);
      const leaks = (v: unknown) => /fraudScore|fraudReasons|isFlagged|fraudNote|fraudResolution|liste de blocage|IMEI déjà présent/.test(JSON.stringify(v));
      assert.ok(!leaks(dup), "create");
      assert.ok(!leaks((await h.call("GET", "/buyback/my", { token: other.accessToken })).body), "list");
      assert.ok(!leaks((await h.call("GET", `/buyback/${dup.id}`, { token: other.accessToken })).body), "detail");
      assert.ok(!leaks((await h.call("POST", `/buyback/${dup.id}/cancel`, { token: other.accessToken })).body), "cancel");
      assert.ok(!leaks((await h.call("GET", "/users/me/export", { token: other.accessToken })).body), "export");
    });

    it("lists a customer's history with pagination and a status filter", async () => {
      for (let i = 0; i < 3; i++) await create({ condition: "C" });
      const r = (await h.call("GET", "/buyback/my?limit=2", { token: client })).body;
      assert.equal(r.items.length, 2);
      assert.equal(r.pagination.total, 3);
      assert.equal((await h.call("GET", "/buyback/my?status=COMPLETED", { token: client })).body.pagination.total, 0);
      assert.ok(!/baseMarketPrice/.test(JSON.stringify(r)), "the market baseline stays internal");
    });
  });

  describe("franchise matching", () => {
    it("assigns the franchise of the customer's city", async () => {
      assert.equal((await create({ citySlug: "rabat" })).body.franchise.city, "Rabat");
      assert.equal((await create({ citySlug: "oujda", deliveryMethod: "PICKUP_FROM_HOME", pickupAddress: "12 rue Mohammed V" })).body.franchise.city, "Oujda");
    });

    it("falls back to the nearest franchise for a drop-off, but refuses a home pickup without a local one", async () => {
      await h.prisma.franchise.update({ where: { slug: "demo-kenitra" }, data: { status: "SUSPENDED" } });
      assert.equal((await create({ citySlug: "kenitra" })).body.franchise.city, "Rabat", "Kénitra -> Rabat is the nearest");
      const pickup = await create({ citySlug: "kenitra", deliveryMethod: "PICKUP_FROM_HOME", pickupAddress: "12 rue Hassan II" });
      assert.equal(pickup.status, 400);
      assert.match(pickup.body.message, /enlèvement/);
    });

    it("fails clearly when no franchise at all is active", async () => {
      await h.prisma.franchise.updateMany({ data: { status: "SUSPENDED" } });
      const r = await create();
      assert.equal(r.status, 400);
      assert.match(r.body.message, /Aucune franchise/);
    });
  });

  describe("idempotency", () => {
    it("a retried submission returns the same request; parallel duplicates create one", async () => {
      const key = { "idempotency-key": "buyback-attempt-0001" };
      const a = await create({}, client, key);
      const b = await create({}, client, key);
      assert.equal(b.body.id, a.body.id);

      const k2 = { "idempotency-key": "buyback-attempt-0002" };
      const rs = await Promise.all(Array.from({ length: 6 }, () => create({}, client, k2)));
      assert.equal(new Set(rs.map((r) => r.body.id)).size, 1);
      assert.equal(await h.prisma.buybackRequest.count({ where: { idempotencyKey: "buyback-attempt-0002" } }), 1);
    });
  });

  describe("concurrent decisions", () => {
    it("two simultaneous decisions on one request: exactly one wins, the state is consistent", async () => {
      for (let i = 0; i < 6; i++) {
        // a fresh customer per round: five requests in a day from one account is itself (rightly) held for review
        const r = (await create({}, (await h.newCustomer(`racer${i}`)).accessToken)).body;
        const [a, b] = await Promise.all([review(r.id, { decision: "ACCEPTED" }), review(r.id, { decision: "REJECTED" })]);
        assert.deepEqual([a.status, b.status].sort(), [200, 409], `round ${i}`);
        const final = await row(r.id);
        assert.equal(final.status, a.status === 200 ? "ACCEPTED" : "REJECTED");
        assert.equal(await h.prisma.auditLog.count({ where: { entityId: r.id, action: "BUYBACK_DECIDED" } }), 1);
      }
    });

    it("another franchise cannot decide, and a customer cannot decide at all", async () => {
      const r = (await create()).body;
      assert.equal((await review(r.id, { decision: "ACCEPTED" }, ownerRabat)).status, 404);
      assert.equal((await review(r.id, { decision: "ACCEPTED" }, client)).status, 403);
      assert.equal((await review(r.id, { decision: "ACCEPTED" }, admin)).status, 403);
      assert.equal((await row(r.id)).status, "PENDING");
    });
  });

  describe("fraud detection and review", () => {
    it("flags a duplicate IMEI with an explainable reason, and holds the request: the franchise cannot decide", async () => {
      const first = (await create({ imei: IMEI })).body;
      const other = await h.newCustomer("second");
      const dup = (await create({ imei: IMEI }, other.accessToken)).body;
      assert.equal(first.status, "PENDING");

      const r = await row(dup.id);
      assert.equal(r.isFlagged, true);
      assert.ok((r.fraudReasons as string[]).some((x) => /IMEI déjà présent/.test(x)));
      assert.ok(r.fraudScore! >= 0.5);
      assert.ok((await audit(dup.id)).includes("FRAUD_FLAGGED"));

      const held = await review(dup.id, { decision: "ACCEPTED" });
      assert.equal(held.status, 409);
      assert.match(held.body.message, /antifraude/);
      assert.equal((await h.call("GET", "/franchises/dashboard", { token: owner })).body.stats.pendingBuybacks, 1, "the held request is not counted as actionable");
    });

    it("a clean request with a valid IMEI is not flagged", async () => {
      const r = await row((await create({ imei: IMEI })).body.id);
      assert.equal(r.isFlagged, false);
      assert.equal(r.fraudScore, 0);
    });

    it("a burst of requests raises the score with a stated reason", async () => {
      for (let i = 0; i < 3; i++) await create({ imei: i === 0 ? IMEI : undefined });
      const last = await h.prisma.buybackRequest.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
      assert.ok((last.fraudReasons as string[]).some((x) => /demandes en 24 h/.test(x)));
    });

    describe("the admin decides", () => {
      let dup: any;
      beforeEach(async () => {
        await create({ imei: IMEI });
        dup = (await create({ imei: IMEI }, (await h.newCustomer("suspect")).accessToken)).body;
      });
      const resolve = (body: unknown, id = dup.id) => h.call("PATCH", `/admin/fraud/${id}/resolve`, { token: admin, body });

      it("lists open flags with their reasons, never to a non-admin", async () => {
        const open = await h.call("GET", "/admin/fraud/flagged", { token: admin });
        assert.equal(open.body.items.length, 1);
        assert.ok(open.body.items[0].fraudReasons.length >= 1);
        assert.equal((await h.call("GET", "/admin/fraud/flagged", { token: owner })).status, 403);
        assert.equal((await h.call("GET", "/admin/stats", { token: admin })).body.flaggedBuybacks, 1);
      });

      it("confirming fraud requires a note, cancels the request, tells the customer neutrally, and is audited", async () => {
        assert.equal((await resolve({ resolution: "CONFIRMED_FRAUD" })).status, 400);
        assert.equal((await resolve({ resolution: "CONFIRMED_FRAUD", note: "   " })).status, 400);
        const ok = await resolve({ resolution: "CONFIRMED_FRAUD", note: "IMEI déjà vendu à un autre client" });
        assert.equal(ok.body.status, "CANCELLED");
        assert.equal(ok.body.fraudResolution, "CONFIRMED_FRAUD");

        const mail = await waitFor(() => h.resend.mails.find((m) => m.subject === "Demande de rachat non retenue"));
        assert.ok(mail);
        assert.ok(!/IMEI|fraude/i.test(mail.html), "the detection rule is not disclosed to the customer");
        const log = await h.prisma.auditLog.findFirstOrThrow({ where: { entityId: dup.id, action: "FRAUD_RESOLVED" } });
        assert.equal((log.metadata as any).resolution, "CONFIRMED_FRAUD");
        assert.ok((log.metadata as any).reasons.length >= 1, "the reasons that justified the flag are in the trail");
        assert.equal((await resolve({ resolution: "CLEARED" })).status, 409, "a decision is not overwritten silently");
      });

      it("clearing releases the request to the franchise, which can then decide", async () => {
        const cleared = await resolve({ resolution: "CLEARED", note: "Propriétaire vérifié" });
        assert.equal(cleared.body.status, "PENDING");
        assert.equal((await review(dup.id, { decision: "ACCEPTED" })).status, 200);
      });

      it("is reversible: a confirmed fraud can be reopened with a reason and goes back to the queue", async () => {
        await resolve({ resolution: "CONFIRMED_FRAUD", note: "Doublon présumé" });
        assert.equal((await h.call("POST", `/admin/fraud/${dup.id}/reopen`, { token: admin, body: { note: "ab" } })).status, 400, "reason required");
        const re = await h.call("POST", `/admin/fraud/${dup.id}/reopen`, { token: admin, body: { note: "Le vendeur a fourni la facture d'origine" } });
        assert.equal(re.status, 200);
        assert.equal(re.body.status, "PENDING", "no permanent sanction");
        assert.equal(re.body.fraudResolution, null);
        assert.equal((await h.call("GET", "/admin/fraud/flagged?status=open", { token: admin })).body.items.length, 1);
        assert.deepEqual((await audit(dup.id)).filter((a) => a.startsWith("FRAUD_")), ["FRAUD_FLAGGED", "FRAUD_RESOLVED", "FRAUD_REOPENED"]);
      });

      it("a cleared flag cannot be reopened once the franchise has acted", async () => {
        await resolve({ resolution: "CLEARED" });
        await review(dup.id, { decision: "ACCEPTED" });
        assert.equal((await h.call("POST", `/admin/fraud/${dup.id}/reopen`, { token: admin, body: { note: "Nouvel élément" } })).status, 409);
      });

      it("two admins resolving the same flag at once: one wins", async () => {
        const rs = await Promise.all([resolve({ resolution: "CLEARED" }), resolve({ resolution: "CONFIRMED_FRAUD", note: "doublon" })]);
        assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
      });

      it("filters resolved flags and shows who decided", async () => {
        await resolve({ resolution: "CLEARED", note: "ok" });
        const resolved = await h.call("GET", "/admin/fraud/flagged?status=resolved", { token: admin });
        assert.equal(resolved.body.items.length, 1);
        assert.equal(resolved.body.items[0].fraudReviewer.firstName, "Admin");
        assert.equal((await h.call("GET", "/admin/fraud/flagged?status=open", { token: admin })).body.items.length, 0);
        assert.equal((await h.call("GET", "/admin/fraud/flagged?status=bogus", { token: admin })).status, 400);
      });
    });
  });

  describe("IMEI controls", () => {
    it("blocking an IMEI holds every future request that carries it, with the reason shown, but never auto-rejects", async () => {
      const b = await h.call("POST", "/admin/imei/blocklist", { token: admin, body: { imei: IMEI, reason: "Déclaré volé par la police" } });
      assert.equal(b.status, 201);
      assert.equal((await h.call("POST", "/admin/imei/blocklist", { token: admin, body: { imei: IMEI, reason: "encore" } })).status, 409);

      const r = await row((await create({ imei: IMEI })).body.id);
      assert.equal(r.isFlagged, true);
      assert.deepEqual(r.fraudReasons, ["IMEI sur la liste de blocage"]);
      assert.equal(r.status, "PENDING", "held for a human, not rejected by the machine");

      assert.equal((await h.call("DELETE", `/admin/imei/blocklist/${IMEI}`, { token: admin })).status, 204);
      assert.equal((await h.call("DELETE", `/admin/imei/blocklist/${IMEI}`, { token: admin })).status, 404);
      const again = await row((await create({ imei: IMEI }, (await h.newCustomer("again")).accessToken)).body.id);
      assert.ok(!(again.fraudReasons as string[]).includes("IMEI sur la liste de blocage"));
      assert.deepEqual((await audit(b.body.id)), ["IMEI_BLOCKED"]);
    });

    it("confirming fraud can add the IMEI to the blocklist in the same decision", async () => {
      await create({ imei: IMEI });
      const dup = (await create({ imei: IMEI }, (await h.newCustomer("fraud")).accessToken)).body;
      await h.call("PATCH", `/admin/fraud/${dup.id}/resolve`, { token: admin, body: { resolution: "CONFIRMED_FRAUD", note: "Revente multiple", blockImei: true } });
      assert.equal(await h.prisma.blockedImei.count({ where: { imei: IMEI } }), 1);
      const noImei = (await create({})).body;
      await h.prisma.buybackRequest.update({ where: { id: noImei.id }, data: { isFlagged: true, fraudScore: 0.6 } });
      assert.equal((await h.call("PATCH", `/admin/fraud/${noImei.id}/resolve`, { token: admin, body: { resolution: "CONFIRMED_FRAUD", note: "x", blockImei: true } })).status, 400, "no IMEI to block");
    });

    it("looks an IMEI up across all requests", async () => {
      await create({ imei: IMEI });
      await create({ imei: IMEI }, (await h.newCustomer("looker")).accessToken);
      const r = await h.call("GET", `/admin/imei/${IMEI}`, { token: admin });
      assert.equal(r.body.requests.length, 2);
      assert.equal(r.body.blocked, null);
      assert.equal((await h.call("GET", `/admin/imei/${IMEI_2}`, { token: admin })).body.requests.length, 0);
    });
  });
});
