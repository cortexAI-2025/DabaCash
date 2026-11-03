/**
 * Reference data every environment needs: the 10 launch cities, and the brand / model catalogue.
 * Idempotent. Contains NO prices, NO users and NO credentials: model baselines are set by an
 * admin, and a model without one cannot be estimated (the API answers "estimation indisponible").
 */
import { PrismaClient } from "@prisma/client";
import { CATALOG, slugify } from "../catalog";
import { MOROCCO_CITIES } from "../cities";

export async function seedReference(prisma: PrismaClient) {
  const cityIds: Record<string, string> = {};
  for (const [position, c] of MOROCCO_CITIES.entries()) {
    const row = await prisma.city.upsert({
      where: { slug: c.slug },
      update: { name: c.name, nameAr: c.nameAr, region: c.region, latitude: c.latitude, longitude: c.longitude, position },
      create: { ...c, position },
    });
    cityIds[c.slug] = row.id;
  }

  const modelIds: Record<string, string> = {};
  for (const m of CATALOG) {
    const brand = await prisma.brand.upsert({ where: { slug: slugify(m.brand) }, update: {}, create: { name: m.brand, slug: slugify(m.brand) } });
    const slug = slugify(m.name);
    const model = await prisma.deviceModel.upsert({
      where: { brandId_slug: { brandId: brand.id, slug } },
      update: {},
      create: { brandId: brand.id, name: m.name, slug, deviceType: m.deviceType, releaseYear: m.releaseYear }, // no baseMarketPrice
    });
    modelIds[`${m.brand}/${m.name}`] = model.id;
  }
  return { cityIds, modelIds };
}
