import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { JwtService } from "@nestjs/jwt";
import { demoEmail } from "@dabacash/database";
import { Harness, TEST_PASSWORD, startHarness } from "./helpers/harness";

describe("auth: registration, sessions, lockout, password, privacy", () => {
  let h: Harness;
  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });

  const auditActions = async (actorId?: string) =>
    (await h.prisma.auditLog.findMany({ where: actorId ? { actorId } : {}, select: { action: true } })).map((a) => a.action);

  describe("registration", () => {
    it("always creates a CUSTOMER: a role in the request body is rejected, nothing is created", async () => {
      const email = "evil@test.dabacash.test";
      const r = await h.call("POST", "/auth/register", { body: { email, password: TEST_PASSWORD, firstName: "E", lastName: "V", role: "ADMIN" } });
      assert.equal(r.status, 400);
      assert.equal(await h.prisma.user.count({ where: { email } }), 0);
    });

    it("registers a customer, normalises the email and never returns the password hash", async () => {
      const r = await h.call("POST", "/auth/register", { body: { email: "  MiXed@Case.Test ", password: TEST_PASSWORD, firstName: " Sara ", lastName: "Alaoui" } });
      assert.equal(r.status, 201);
      assert.equal(r.body.role, "CUSTOMER");
      assert.equal(r.body.user.email, "mixed@case.test");
      assert.equal(r.body.user.firstName, "Sara");
      assert.ok(!JSON.stringify(r.body).includes("passwordHash"));
      assert.ok((await auditActions(r.body.user.id)).includes("REGISTER"));
    });

    it("stores only a hash of the refresh token", async () => {
      const u = await h.newCustomer("hash");
      const rows = await h.prisma.session.findMany({ where: { userId: u.id } });
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].refreshTokenHash, u.refreshToken);
      assert.match(rows[0].refreshTokenHash, /^[0-9a-f]{64}$/);
    });

    it("rejects weak passwords, bad emails and bad phones", async () => {
      const base = { email: "w@test.dabacash.test", firstName: "A", lastName: "B" };
      for (const password of ["short1", "onlyletterslong", "1234567890123", "a1".repeat(40)]) {
        assert.equal((await h.call("POST", "/auth/register", { body: { ...base, password } })).status, 400, password);
      }
      assert.equal((await h.call("POST", "/auth/register", { body: { ...base, password: TEST_PASSWORD, email: "not-an-email" } })).status, 400);
      assert.equal((await h.call("POST", "/auth/register", { body: { ...base, password: TEST_PASSWORD, phone: "abc" } })).status, 400);
    });

    it("refuses a duplicate email regardless of case (409)", async () => {
      const u = await h.newCustomer("dup");
      const r = await h.call("POST", "/auth/register", { body: { email: u.email.toUpperCase(), password: TEST_PASSWORD, firstName: "A", lastName: "B" } });
      assert.equal(r.status, 409);
    });

    it("two simultaneous registrations with the same email: exactly one succeeds", async () => {
      const body = { email: "race@test.dabacash.test", password: TEST_PASSWORD, firstName: "R", lastName: "C" };
      const rs = await Promise.all([1, 2, 3, 4].map(() => h.call("POST", "/auth/register", { body })));
      assert.equal(rs.filter((r) => r.status === 201).length, 1);
      assert.equal(rs.filter((r) => r.status === 409).length, 3);
      assert.equal(await h.prisma.user.count({ where: { email: body.email } }), 1);
    });
  });

  describe("login and lockout", () => {
    it("logs in, and answers identically for a wrong password and an unknown email", async () => {
      const ok = await h.call("POST", "/auth/login", { body: { email: demoEmail("client"), password: TEST_PASSWORD } });
      assert.equal(ok.status, 200);
      const wrong = await h.call("POST", "/auth/login", { body: { email: demoEmail("client"), password: "Wrong-Passw0rd" } });
      const unknown = await h.call("POST", "/auth/login", { body: { email: "nobody@test.dabacash.test", password: "Wrong-Passw0rd" } });
      assert.equal(wrong.status, 401);
      assert.equal(unknown.status, 401);
      assert.equal(wrong.body.message, unknown.body.message);
    });

    it("locks the account after 5 failures, even for the correct password, until an admin unlocks it", async () => {
      const u = await h.newCustomer("lock");
      for (let i = 0; i < 5; i++) {
        assert.equal((await h.call("POST", "/auth/login", { body: { email: u.email, password: `Wrong-Passw0rd-${i}` } })).status, 401);
      }
      const locked = await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } });
      assert.equal(locked.status, 429);
      assert.ok(Number(locked.headers.get("retry-after")) > 0, "Retry-After header");
      assert.ok((await auditActions(u.id)).includes("LOGIN_LOCKED"));

      const admin = await h.login("admin");
      assert.equal((await h.call("POST", `/admin/users/${u.id}/unlock`, { token: admin.accessToken })).status, 204);
      assert.equal((await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } })).status, 200);
    });

    it("a successful login resets the failure counter", async () => {
      const u = await h.newCustomer("reset");
      for (let i = 0; i < 3; i++) await h.call("POST", "/auth/login", { body: { email: u.email, password: `Wrong-Passw0rd-${i}` } });
      assert.equal((await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } })).status, 200);
      assert.equal((await h.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginCount, 0);
    });

    it("parallel wrong guesses cannot slip past the lockout counter", async () => {
      const u = await h.newCustomer("burst");
      await Promise.all(Array.from({ length: 12 }, (_, i) => h.call("POST", "/auth/login", { body: { email: u.email, password: `Wrong-Passw0rd-${i}` } })));
      const after = await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } });
      assert.equal(after.status, 429, "locked after a burst of guesses");
    });

    it("a deactivated account cannot log in, refresh, or use an existing access token", async () => {
      const u = await h.newCustomer("off");
      const admin = await h.login("admin");
      assert.equal((await h.call("PATCH", `/admin/users/${u.id}`, { token: admin.accessToken, body: { isActive: false } })).status, 200);

      assert.equal((await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } })).status, 403);
      assert.equal((await h.call("GET", "/users/me", { token: u.accessToken })).status, 401);
      assert.equal((await h.call("POST", "/auth/refresh", { body: { refreshToken: u.refreshToken } })).status, 401);
    });
  });

  describe("tokens", () => {
    it("rotates refresh tokens; replaying a used one revokes every session and is audited", async () => {
      const u = await h.newCustomer("rot");
      const r1 = await h.call("POST", "/auth/refresh", { body: { refreshToken: u.refreshToken } });
      assert.equal(r1.status, 200);
      assert.notEqual(r1.body.refreshToken, u.refreshToken);
      assert.equal((await h.call("GET", "/users/me", { token: r1.body.accessToken })).status, 200);

      const replay = await h.call("POST", "/auth/refresh", { body: { refreshToken: u.refreshToken } });
      assert.equal(replay.status, 401);
      // the legitimate newer token is now dead too: the thief and the owner are both signed out
      assert.equal((await h.call("POST", "/auth/refresh", { body: { refreshToken: r1.body.refreshToken } })).status, 401);
      assert.ok((await auditActions(u.id)).includes("TOKEN_REUSE_DETECTED"));
    });

    it("of two parallel refreshes with the same token, only one wins", async () => {
      const u = await h.newCustomer("par");
      const rs = await Promise.all([1, 2, 3].map(() => h.call("POST", "/auth/refresh", { body: { refreshToken: u.refreshToken } })));
      assert.equal(rs.filter((r) => r.status === 200).length, 1);
    });

    it("rejects garbage, an access token used as a refresh token, and missing tokens", async () => {
      const u = await h.newCustomer("bad");
      assert.equal((await h.call("POST", "/auth/refresh", { body: { refreshToken: "garbage" } })).status, 401);
      assert.equal((await h.call("POST", "/auth/refresh", { body: { refreshToken: u.accessToken } })).status, 401);
      assert.equal((await h.call("POST", "/auth/refresh", { body: {} })).status, 400);
      assert.equal((await h.call("GET", "/users/me")).status, 401);
      assert.equal((await h.call("GET", "/users/me", { token: "not.a.jwt" })).status, 401);
    });

    it("rejects an expired token and trusts the database for the role, not the token", async () => {
      const u = await h.newCustomer("forge");
      const jwt = h.app.get(JwtService);
      const expired = jwt.sign({ sub: u.id, role: "CUSTOMER" }, { expiresIn: "-10s" });
      assert.equal((await h.call("GET", "/users/me", { token: expired })).status, 401);

      const forged = jwt.sign({ sub: u.id, email: u.email, role: "ADMIN" }); // validly signed, lying about the role
      assert.equal((await h.call("GET", "/users/me", { token: forged })).status, 200);
      assert.equal((await h.call("GET", "/admin/stats", { token: forged })).status, 403);
    });

    it("logout revokes that session; logout-all revokes every device", async () => {
      const u = await h.newCustomer("out");
      const second = (await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } })).body;

      assert.equal((await h.call("POST", "/auth/logout", { body: { refreshToken: u.refreshToken } })).status, 204);
      assert.equal((await h.call("POST", "/auth/refresh", { body: { refreshToken: u.refreshToken } })).status, 401);

      assert.equal((await h.call("POST", "/auth/logout-all", { token: second.accessToken })).status, 204);
      assert.equal((await h.call("POST", "/auth/refresh", { body: { refreshToken: second.refreshToken } })).status, 401);
      assert.equal(await h.prisma.session.count({ where: { userId: u.id } }), 0);
    });

    it("keeps at most 10 sessions per user", async () => {
      const u = await h.newCustomer("many");
      for (let i = 0; i < 12; i++) await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } });
      assert.equal(await h.prisma.session.count({ where: { userId: u.id } }), 10);
    });
  });

  describe("password change", () => {
    it("requires the current password, enforces the policy, and signs every device out", async () => {
      const u = await h.newCustomer("pw");
      const newPassword = "Brand-New-Passw0rd";
      assert.equal((await h.call("PATCH", "/users/me/password", { token: u.accessToken, body: { currentPassword: "Wrong-Passw0rd", newPassword } })).status, 401);
      assert.equal((await h.call("PATCH", "/users/me/password", { token: u.accessToken, body: { currentPassword: TEST_PASSWORD, newPassword: "weak" } })).status, 400);
      assert.equal((await h.call("PATCH", "/users/me/password", { token: u.accessToken, body: { currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD } })).status, 409);

      await new Promise((r) => setTimeout(r, 1100)); // iat has 1 s resolution
      assert.equal((await h.call("PATCH", "/users/me/password", { token: u.accessToken, body: { currentPassword: TEST_PASSWORD, newPassword } })).status, 204);

      assert.equal((await h.call("GET", "/users/me", { token: u.accessToken })).status, 401, "old access token is void");
      assert.equal((await h.call("POST", "/auth/refresh", { body: { refreshToken: u.refreshToken } })).status, 401, "old refresh token is void");
      assert.equal((await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } })).status, 401, "old password no longer works");
      assert.equal((await h.call("POST", "/auth/login", { body: { email: u.email, password: newPassword } })).status, 200);
      assert.ok((await auditActions(u.id)).includes("PASSWORD_CHANGED"));
    });
  });

  describe("profile and privacy", () => {
    it("lets a user edit name, phone and avatar only: role, email and status are refused", async () => {
      const u = await h.newCustomer("prof");
      for (const forbidden of [{ role: "ADMIN" }, { email: "x@y.z" }, { isActive: false }, { passwordHash: "x" }]) {
        assert.equal((await h.call("PATCH", "/users/me", { token: u.accessToken, body: forbidden })).status, 400, JSON.stringify(forbidden));
      }
      assert.equal((await h.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).role, "CUSTOMER");

      const ok = await h.call("PATCH", "/users/me", { token: u.accessToken, body: { firstName: "Nadia", phone: "+212 600 000 123" } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.firstName, "Nadia");
      assert.equal((await h.call("PATCH", "/users/me", { token: u.accessToken, body: { phone: "nope" } })).status, 400);
      assert.equal((await h.call("PATCH", "/users/me", { token: u.accessToken, body: { avatarUrl: "http://insecure.example/a.png" } })).status, 400);
      assert.ok(!JSON.stringify((await h.call("GET", "/users/me", { token: u.accessToken })).body).includes("passwordHash"));
    });

    it("exports everything held about the user, without credentials, and audits the export", async () => {
      const c = await h.login("client");
      const r = await h.call("GET", "/users/me/export", { token: c.accessToken });
      assert.equal(r.status, 200);
      assert.equal(r.body.profile.email, demoEmail("client"));
      assert.ok(Array.isArray(r.body.orders) && Array.isArray(r.body.buybackRequests) && Array.isArray(r.body.notifications));
      const text = JSON.stringify(r.body);
      assert.ok(!/passwordHash|refreshToken|"jti"/.test(text));
      assert.ok((await auditActions()).includes("DATA_EXPORTED"));
    });

    it("erases an account by anonymisation, keeps financial records, and blocks reuse of the old session", async () => {
      const u = await h.newCustomer("erase");
      const listing = (await h.call("GET", "/marketplace/listings?city=casablanca")).body.items[0];
      const order = (await h.call("POST", "/orders", { token: u.accessToken, body: { items: [{ listingId: listing.id, quantity: 1 }], deliveryMethod: "DROP_IN_STORE", paymentMethod: "CASH", notes: "appeler avant" } })).body;

      assert.equal((await h.call("DELETE", "/users/me", { token: u.accessToken, body: { password: "Wrong-Passw0rd" } })).status, 401);
      assert.equal((await h.call("DELETE", "/users/me", { token: u.accessToken, body: { password: TEST_PASSWORD } })).status, 409, "open order blocks deletion");

      assert.equal((await h.call("POST", `/orders/${order.id}/cancel`, { token: u.accessToken })).status, 200);
      assert.equal((await h.call("DELETE", "/users/me", { token: u.accessToken, body: { password: TEST_PASSWORD } })).status, 204);

      const row = await h.prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      assert.match(row.email, /^deleted-.+@deleted\.invalid$/);
      assert.equal(row.firstName, "Compte");
      assert.equal(row.phone, null);
      assert.ok(row.deletedAt);
      const kept = await h.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { payment: true } });
      assert.equal(kept.totalAmount, order.totalAmount, "amounts are kept for accounting");
      assert.equal(kept.notes, null, "free text is erased");
      assert.equal(await h.prisma.session.count({ where: { userId: u.id } }), 0);

      assert.equal((await h.call("GET", "/users/me", { token: u.accessToken })).status, 401);
      assert.equal((await h.call("POST", "/auth/login", { body: { email: u.email, password: TEST_PASSWORD } })).status, 401);
      assert.ok((await auditActions(u.id)).includes("ACCOUNT_DELETED"));
    });

    it("does not let a franchise owner delete their account in self-service", async () => {
      const o = await h.login("owner.casablanca");
      assert.equal((await h.call("DELETE", "/users/me", { token: o.accessToken, body: { password: TEST_PASSWORD } })).status, 409);
    });
  });

  describe("notifications", () => {
    it("lists, counts unread, marks one and all as read, and never touches another user's", async () => {
      const a = await h.newCustomer("na");
      const b = await h.newCustomer("nb");
      await h.prisma.notification.createMany({ data: [
        { userId: a.id, title: "t1", body: "b", type: "system" }, { userId: a.id, title: "t2", body: "b", type: "system" }, { userId: b.id, title: "other", body: "b", type: "system" },
      ] });
      const list = await h.call("GET", "/users/me/notifications", { token: a.accessToken });
      assert.equal(list.body.items.length, 2);
      assert.equal(list.body.unread, 2);

      const bId = (await h.prisma.notification.findFirstOrThrow({ where: { userId: b.id } })).id;
      assert.equal((await h.call("PATCH", `/users/me/notifications/${bId}/read`, { token: a.accessToken })).status, 404);
      assert.equal((await h.call("PATCH", `/users/me/notifications/${list.body.items[0].id}/read`, { token: a.accessToken })).status, 204);
      assert.equal((await h.call("POST", "/users/me/notifications/read-all", { token: a.accessToken })).body.updated, 1);
      assert.equal((await h.call("GET", "/users/me/notifications", { token: a.accessToken })).body.unread, 0);
      assert.equal((await h.call("GET", "/users/me/notifications", { token: b.accessToken })).body.unread, 1);
    });
  });
});
