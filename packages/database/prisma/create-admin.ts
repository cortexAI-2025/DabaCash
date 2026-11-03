/**
 * Creates the first administrator from environment variables, so no credential ever lives in the repository.
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:create-admin
 * Refuses to touch an existing account, and refuses a weak password.
 */
import * as bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";

async function main() {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("ADMIN_EMAIL is required and must be a valid address");
  if (!/^(?=.*[A-Za-z])(?=.*\d).{10,72}$/.test(password)) throw new Error("ADMIN_PASSWORD must be 10-72 characters with at least one letter and one digit");

  const prisma = new PrismaClient();
  try {
    if (await prisma.user.findUnique({ where: { email } })) throw new Error(`An account with ${email} already exists; nothing was changed`);
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
    const user = await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, rounds), firstName: "Admin", lastName: "DabaCash", role: Role.ADMIN, isVerified: true },
    });
    await prisma.auditLog.create({ data: { actorId: user.id, actorRole: Role.ADMIN, action: "REGISTER", entity: "User", entityId: user.id, metadata: { via: "create-admin script" } } });
    console.log(`Administrator created: ${email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
