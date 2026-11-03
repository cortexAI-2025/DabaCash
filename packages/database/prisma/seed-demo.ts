/**
 * CLI: DEMO data (fictitious accounts and indicative prices). Refuses to run in production.
 *   DEMO_PASSWORD   password for every demo account (a random one is generated and printed if unset)
 */
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { demoEmail, seedDemo } from "../src/seed/demo";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Refusing to load demo data in production (set ALLOW_DEMO_SEED=true only on a throwaway environment).");
  process.exit(1);
}
const password = process.env.DEMO_PASSWORD ?? `Demo-${randomBytes(6).toString("hex")}9`;
const prisma = new PrismaClient();
seedDemo(prisma, { password })
  .then(() => {
    console.log("Demo data loaded.");
    console.log(`  admin    ${demoEmail("admin")}`);
    console.log(`  client   ${demoEmail("client")}`);
    console.log(`  gérant   ${demoEmail("owner.casablanca")}  (and owner.<city-slug>)`);
    console.log(process.env.DEMO_PASSWORD ? "  password: the value of DEMO_PASSWORD" : `  password (generated, shown once): ${password}`);
  })
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
