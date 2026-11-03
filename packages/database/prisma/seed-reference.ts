/** CLI: reference data only (cities + catalogue without prices). Idempotent. */
import { PrismaClient } from "@prisma/client";
import { seedReference } from "../src/seed/reference";

const prisma = new PrismaClient();
seedReference(prisma)
  .then((r) => console.log(`Reference data ready: ${Object.keys(r.cityIds).length} cities, ${Object.keys(r.modelIds).length} models (no prices).`))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
