/**
 * DEMO DATA ONLY: fictitious accounts, franchises, listings and indicative prices, to let a tester
 * click through the platform. Everything uses the reserved ".test" domain so no real person's
 * address is ever involved. The CLI wrapper (prisma/seed-demo.ts) refuses to run in production.
 */
import * as bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { CATALOG } from "../catalog";
import { MOROCCO_CITIES } from "../cities";
import { seedReference } from "./reference";

export const DEMO_DOMAIN = "demo.dabacash.test";
export const demoEmail = (local: string) => `${local}@${DEMO_DOMAIN}`;

export async function seedDemo(prisma: PrismaClient, opts: { password: string; rounds?: number }) {
  const hash = await bcrypt.hash(opts.password, opts.rounds ?? 10);
  const { cityIds, modelIds } = await seedReference(prisma);

  // Indicative baselines, so the estimator works in the demo.
  for (const m of CATALOG) {
    await prisma.deviceModel.update({ where: { id: modelIds[`${m.brand}/${m.name}`] }, data: { baseMarketPrice: m.demoPrice } });
  }

  const user = (local: string, role: Role, firstName: string, lastName: string) =>
    prisma.user.upsert({
      where: { email: demoEmail(local) },
      update: { passwordHash: hash, role, isActive: true, deletedAt: null, failedLoginCount: 0, lockedUntil: null },
      create: { email: demoEmail(local), passwordHash: hash, firstName, lastName, role, isVerified: true },
    });

  await user("admin", Role.ADMIN, "Admin", "Démo");
  await user("client", Role.CUSTOMER, "Youssef", "Benali");

  const franchises: Record<string, string> = {};
  for (const c of MOROCCO_CITIES) {
    const owner = await user(`owner.${c.slug}`, Role.FRANCHISE_OWNER, "Gérant", c.name);
    const f = await prisma.franchise.upsert({
      where: { slug: `demo-${c.slug}` },
      update: { cityId: cityIds[c.slug], status: "ACTIVE" },
      create: {
        ownerId: owner.id, cityId: cityIds[c.slug], name: `DabaCash ${c.name} (démo)`, slug: `demo-${c.slug}`, status: "ACTIVE",
        commissionRate: 0.15, address: `Centre-ville, ${c.name}`, city: c.name, region: c.region, country: "MA", latitude: c.latitude, longitude: c.longitude,
      },
    });
    franchises[c.slug] = f.id;
  }

  // A few listings for the Casablanca demo franchise.
  const casa = franchises["casablanca"];
  const listings = [
    { model: "Apple/iPhone 14", condition: "A" as const, title: "iPhone 14 128GB – Excellent état", buyback: 4200, price: 5800, orig: 9500, stock: 3, warranty: 6 },
    { model: "Samsung/Galaxy S23", condition: "B" as const, title: "Galaxy S23 256GB – Bon état", buyback: 3100, price: 4500, orig: 8200, stock: 2, warranty: 3 },
    { model: "Dell/XPS 13", condition: "B" as const, title: "Dell XPS 13 i7 16GB – Très bon état", buyback: 5500, price: 8200, orig: 15000, stock: 1, warranty: 6 },
  ];
  for (const l of listings) {
    const deviceModelId = modelIds[l.model];
    const exists = await prisma.productListing.findFirst({ where: { franchiseId: casa, title: l.title } });
    if (exists) continue;
    const created = await prisma.productListing.create({
      data: { franchiseId: casa, deviceModelId, condition: l.condition, status: "ACTIVE", title: l.title, buybackPrice: l.buyback, listingPrice: l.price, originalPrice: l.orig, stockQuantity: l.stock, images: [], warrantyMonths: l.warranty },
    });
    await prisma.inventory.create({ data: { franchiseId: casa, listingId: created.id, deviceModelId, quantity: l.stock } });
  }
  return { franchises, cityIds, modelIds };
}
