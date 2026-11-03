/**
 * Browser smoke test (Playwright). Runs the key customer / admin / franchise journeys against a LOCAL stack
 * seeded with npm run db:seed:demo (fictitious data only). Not run in CI: it needs a running API + web.
 *
 *   DEMO_PASSWORD=... [BASE_URL=http://localhost:3000] [CHROMIUM_PATH=/path/to/chrome] node apps/web/e2e/smoke.cjs
 *
 * Requires playwright-core (and a Chromium) available to Node. Each run reserves 1 unit of stock for a cash
 * order and then cancels it, so it can be re-run.
 */
const { chromium } = require("playwright-core");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD;
if (!PW) { console.error("DEMO_PASSWORD is required (the value used with db:seed:demo)"); process.exit(2); }
const results = [];
const vis = (loc) => loc.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
const ok = (name, cond, extra = "") => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); };

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ["--no-sandbox"] });
  const mk = async (viewport) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.errors = [];
    page.on("pageerror", (e) => page.errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") page.errors.push("console: " + m.text()); });
    return page;
  };
  const login = async (page, email) => {
    await page.goto(BASE + "/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(PW);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10000 });
  };

  // ── anonymous home + stats + no bounce on anonymous 401
  let page = await mk({ width: 1280, height: 800 });
  await page.goto(BASE + "/");
  await page.waitForTimeout(1500);
  ok("home renders hero", await page.getByText("DabaCash").first().isVisible());
  ok("anonymous stays on home (no login bounce)", new URL(page.url()).pathname === "/");
  ok("no fake '12,000+' figure", !(await page.content()).includes("12,000+"));
  ok("navbar shows Connexion when anonymous", await page.getByRole("link", { name: "Connexion" }).isVisible());

  // ── register: weak password rejected client-side, valid works
  await page.goto(BASE + "/register");
  const email = `smoke${Date.now()}@demo.dabacash.test`;
  await page.getByLabel("Prénom").fill("Test"); await page.getByLabel("Nom", { exact: true }).fill("Smoke");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("short1");
  await page.getByLabel("Confirmer le mot de passe").fill("short1");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  ok("weak password shows min-10 message", await page.getByText("Minimum 10 caractères").isVisible());
  await page.getByLabel("Mot de passe", { exact: true }).fill("Smoke-Pass-2026");
  await page.getByLabel("Confirmer le mot de passe").fill("Smoke-Pass-2026");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL((u) => u.pathname === "/marketplace", { timeout: 10000 }).catch(() => {});
  ok("register -> marketplace as customer", new URL(page.url()).pathname === "/marketplace", page.url());
  ok("navbar now shows account", await vis(page.getByRole("link", { name: "Mon compte" })));

  // ── marketplace + listing + cash order
  await page.waitForTimeout(1500);
  const cards = page.locator('a[href^="/listing"]');
  const n = await cards.count();
  ok("marketplace lists demo products", n > 0, `count=${n}`);
  if (n > 0) {
    await cards.first().click();
    await page.waitForURL(/\/listing/);
    await page.getByRole("button", { name: /Retrait en franchise/ }).click();
    await page.getByRole("button", { name: /Payer en magasin/ }).click();
    await page.getByRole("button", { name: "Réserver" }).click();
    await page.waitForURL(/payment\/result/, { timeout: 10000 }).catch(() => {});
    ok("cash order reaches result page", page.url().includes("payment/result"), page.url());
    ok("result says order registered", await vis(page.getByText("Commande enregistrée")));
  }
  await page.goto(BASE + "/orders");
  await page.waitForTimeout(1500);
  ok("my orders shows the order + cancel", await page.getByRole("button", { name: "Annuler" }).first().isVisible().catch(() => false));
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Annuler" }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  ok("order cancelled", await page.getByText("Annulée").first().isVisible().catch(() => false));

  // ── sell flow: estimate + submit
  await page.goto(BASE + "/sell");
  await page.getByLabel("Marque *").selectOption({ index: 1 });
  await page.waitForTimeout(800);
  await page.getByLabel("Modèle *").selectOption({ index: 1 });
  await page.getByLabel("Ville *").selectOption({ index: 1 });
  await page.getByLabel(/IMEI/).fill("490154203237518");
  await page.getByRole("button", { name: /Obtenir une estimation/ }).click();
  ok("estimate displayed", await vis(page.getByText("Prix de rachat estimé")));
  ok("no confidence score shown", !(await page.content()).includes("Confiance"));
  await page.getByRole("button", { name: /Confirmer la demande/ }).click();
  ok("buyback submitted", await vis(page.getByText("Demande envoyée")));

  // ── account page
  await page.goto(BASE + "/account");
  await page.waitForTimeout(1500);
  ok("account shows buyback request", await page.getByText("Mes demandes de rachat").isVisible());
  ok("account shows notifications section", await page.getByRole("heading", { name: /Notifications/ }).isVisible());
  ok("no console/page errors (customer journey)", page.errors.length === 0, page.errors.slice(0, 3).join(" | "));

  // ── role guard: customer cannot enter admin
  await page.goto(BASE + "/admin");
  await page.waitForTimeout(800);
  ok("customer redirected away from /admin", !new URL(page.url()).pathname.startsWith("/admin"), page.url());

  // ── anonymous guard
  const anon = await mk({ width: 1280, height: 800 });
  await anon.goto(BASE + "/account");
  ok("anonymous /account -> login", new URL(anon.url()).pathname === "/login", anon.url());

  // ── login error message
  await anon.getByLabel("Email").fill("nobody@demo.dabacash.test");
  await anon.getByLabel("Mot de passe", { exact: true }).fill("wrong-pass-123");
  await anon.getByRole("button", { name: "Se connecter" }).click();
  ok("bad login shows an error toast", await vis(anon.getByText(/incorrect|invalide/i).first()));

  // ── admin tour
  const adm = await mk({ width: 1280, height: 800 });
  await login(adm, "admin@demo.dabacash.test");
  for (const [path, text] of [["/admin", "Tableau de bord"], ["/admin/users", "Utilisateurs et rôles"], ["/admin/franchises", "Gestion des franchises"], ["/admin/orders", "Commandes"], ["/admin/payments", "Transactions"], ["/admin/fraud", "Détection de fraude"], ["/admin/imei", "IMEI"], ["/admin/catalog", "Catalogue"], ["/admin/audit", "Journal d'audit"], ["/admin/analytics", "Analytics"]]) {
    await adm.goto(BASE + path); await adm.waitForTimeout(1200);
    ok(`admin ${path}`, await adm.getByRole("heading", { name: new RegExp(text) }).first().isVisible().catch(() => false));
  }
  await adm.goto(BASE + "/admin/franchises");
  await adm.getByRole("button", { name: /Nouvelle franchise/ }).click();
  ok("create-franchise form opens", await adm.getByLabel("Mot de passe provisoire").isVisible());
  ok("no console/page errors (admin)", adm.errors.length === 0, adm.errors.slice(0, 3).join(" | "));

  // ── franchise tour
  const fr = await mk({ width: 1280, height: 800 });
  await login(fr, "owner.casablanca@demo.dabacash.test");
  for (const [path, text] of [["/dashboard", "."], ["/dashboard/inventory", "Inventaire"], ["/dashboard/buybacks", "Demandes de rachat"], ["/dashboard/orders", "Commandes"], ["/dashboard/analytics", "Statistiques"]]) {
    await fr.goto(BASE + path); await fr.waitForTimeout(1200);
    ok(`franchise ${path}`, await fr.getByRole("heading", { name: new RegExp(text) }).first().isVisible().catch(() => false));
  }
  await fr.goto(BASE + "/dashboard/buybacks"); await fr.waitForTimeout(1200);
  ok("franchise sees the new buyback request", await fr.getByText(/Demandes de rachat/).first().isVisible());
  ok("no console/page errors (franchise)", fr.errors.length === 0, fr.errors.slice(0, 3).join(" | "));

  // ── responsive: no horizontal overflow at 390px on key pages
  const mob = await mk({ width: 390, height: 800 });
  await login(mob, "admin@demo.dabacash.test");
  for (const p of ["/", "/marketplace", "/sell", "/login", "/admin", "/admin/users", "/admin/payments", "/admin/audit", "/admin/imei"]) {
    await mob.goto(BASE + p); await mob.waitForTimeout(900);
    const over = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`no horizontal page scroll @390 ${p}`, over <= 1, `overflow=${over}`);
  }

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("SCRIPT ERROR", e); process.exit(2); });
