import { PrismaClient, Role, DeviceType, Condition } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding DabaCash database...");

  // Admin user
  const adminHash = await bcrypt.hash("Admin@DabaCash2024!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@dabacash.ma" },
    update: {},
    create: {
      email: "admin@dabacash.ma",
      passwordHash: adminHash,
      firstName: "Platform",
      lastName: "Admin",
      role: Role.ADMIN,
      isVerified: true,
    },
  });

  // Franchise owner
  const ownerHash = await bcrypt.hash("Owner@Casa2024!", 12);
  const franchiseOwner = await prisma.user.upsert({
    where: { email: "owner@techcasa.ma" },
    update: {},
    create: {
      email: "owner@techcasa.ma",
      passwordHash: ownerHash,
      firstName: "Hassan",
      lastName: "Amrani",
      phone: "+212600000001",
      role: Role.FRANCHISE_OWNER,
      isVerified: true,
    },
  });

  // Customer
  const customerHash = await bcrypt.hash("Customer@2024!", 12);
  const customer = await prisma.user.upsert({
    where: { email: "youssef@gmail.com" },
    update: {},
    create: {
      email: "youssef@gmail.com",
      passwordHash: customerHash,
      firstName: "Youssef",
      lastName: "Benali",
      phone: "+212600000002",
      role: Role.CUSTOMER,
      isVerified: true,
    },
  });

  // Franchise
  const franchise = await prisma.franchise.upsert({
    where: { slug: "techcasa-casablanca" },
    update: {},
    create: {
      ownerId: franchiseOwner.id,
      name: "TechCasa Casablanca",
      slug: "techcasa-casablanca",
      description: "Votre boutique de reconditionnement à Casablanca",
      status: "ACTIVE",
      commissionRate: 0.15,
      address: "123 Boulevard Mohammed V",
      city: "Casablanca",
      region: "Grand Casablanca",
      country: "MA",
      latitude: 33.5731,
      longitude: -7.5898,
      phoneNumber: "+212522000001",
      whatsappNumber: "+212600000001",
      email: "contact@techcasa.ma",
      businessHours: {
        mon: "09:00-18:00",
        tue: "09:00-18:00",
        wed: "09:00-18:00",
        thu: "09:00-18:00",
        fri: "09:00-12:00",
        sat: "10:00-16:00",
        sun: "closed",
      },
    },
  });

  // Brands
  const brands = await Promise.all([
    prisma.brand.upsert({
      where: { slug: "apple" },
      update: {},
      create: { name: "Apple", slug: "apple" },
    }),
    prisma.brand.upsert({
      where: { slug: "samsung" },
      update: {},
      create: { name: "Samsung", slug: "samsung" },
    }),
    prisma.brand.upsert({
      where: { slug: "huawei" },
      update: {},
      create: { name: "Huawei", slug: "huawei" },
    }),
    prisma.brand.upsert({
      where: { slug: "xiaomi" },
      update: {},
      create: { name: "Xiaomi", slug: "xiaomi" },
    }),
    prisma.brand.upsert({
      where: { slug: "dell" },
      update: {},
      create: { name: "Dell", slug: "dell" },
    }),
  ]);

  const [apple, samsung, huawei, xiaomi, dell] = brands;

  // Device models
  const iphone14 = await prisma.deviceModel.upsert({
    where: { brandId_slug: { brandId: apple.id, slug: "iphone-14" } },
    update: {},
    create: {
      brandId: apple.id,
      name: "iPhone 14",
      slug: "iphone-14",
      deviceType: DeviceType.PHONE,
      releaseYear: 2022,
      baseMarketPrice: 9500,
      specs: { storage: ["128GB", "256GB", "512GB"], colors: ["Black", "Blue", "Purple", "Yellow", "Red"] },
    },
  });

  const samsungS23 = await prisma.deviceModel.upsert({
    where: { brandId_slug: { brandId: samsung.id, slug: "galaxy-s23" } },
    update: {},
    create: {
      brandId: samsung.id,
      name: "Galaxy S23",
      slug: "galaxy-s23",
      deviceType: DeviceType.PHONE,
      releaseYear: 2023,
      baseMarketPrice: 8200,
      specs: { storage: ["128GB", "256GB"], colors: ["Black", "Green", "Lavender", "Cream"] },
    },
  });

  const dellXps = await prisma.deviceModel.upsert({
    where: { brandId_slug: { brandId: dell.id, slug: "xps-13" } },
    update: {},
    create: {
      brandId: dell.id,
      name: "XPS 13",
      slug: "xps-13",
      deviceType: DeviceType.LAPTOP,
      releaseYear: 2022,
      baseMarketPrice: 15000,
      specs: { ram: "16GB", storage: "512GB SSD", processor: "Intel Core i7" },
    },
  });

  // Seed listings + inventory
  const listing1 = await prisma.productListing.create({
    data: {
      franchiseId: franchise.id,
      deviceModelId: iphone14.id,
      condition: Condition.A,
      status: "ACTIVE",
      title: "iPhone 14 128GB – État Excellent",
      description: "iPhone 14 en parfait état, batterie 94%, complet avec boîte et câble d'origine.",
      buybackPrice: 4200,
      listingPrice: 5800,
      originalPrice: 9500,
      stockQuantity: 2,
      images: ["/images/iphone14-black-1.jpg", "/images/iphone14-black-2.jpg"],
      specs: { storage: "128GB", color: "Midnight", batteryHealth: "94%" },
      warrantyMonths: 6,
    },
  });

  const listing2 = await prisma.productListing.create({
    data: {
      franchiseId: franchise.id,
      deviceModelId: samsungS23.id,
      condition: Condition.B,
      status: "ACTIVE",
      title: "Samsung Galaxy S23 – Bon État",
      description: "Très beau Galaxy S23, quelques micro-rayures sur l'écran. Fonctionne parfaitement.",
      buybackPrice: 3100,
      listingPrice: 4500,
      originalPrice: 8200,
      stockQuantity: 1,
      images: ["/images/s23-green-1.jpg"],
      specs: { storage: "256GB", color: "Phantom Green" },
      warrantyMonths: 3,
    },
  });

  const listing3 = await prisma.productListing.create({
    data: {
      franchiseId: franchise.id,
      deviceModelId: dellXps.id,
      condition: Condition.B,
      status: "ACTIVE",
      title: "Dell XPS 13 i7 16GB – Très Bon État",
      description: "Laptop Dell XPS 13 en excellent état. Idéal pour les professionnels.",
      buybackPrice: 5500,
      listingPrice: 8200,
      originalPrice: 15000,
      stockQuantity: 1,
      images: ["/images/dell-xps13-1.jpg"],
      specs: { ram: "16GB", storage: "512GB", processor: "Intel Core i7-1250U" },
      warrantyMonths: 6,
    },
  });

  // Inventory
  await prisma.inventory.createMany({
    data: [
      { franchiseId: franchise.id, listingId: listing1.id, deviceModelId: iphone14.id, quantity: 2 },
      { franchiseId: franchise.id, listingId: listing2.id, deviceModelId: samsungS23.id, quantity: 1 },
      { franchiseId: franchise.id, listingId: listing3.id, deviceModelId: dellXps.id, quantity: 1 },
    ],
    skipDuplicates: true,
  });

  // Price history
  await prisma.priceHistory.createMany({
    data: [
      {
        deviceModelId: iphone14.id,
        condition: Condition.A,
        marketPrice: 9500,
        buybackMin: 3800,
        buybackMax: 5225,
        resaleMin: 4560,
        resaleMax: 9405,
        source: "system",
      },
      {
        deviceModelId: samsungS23.id,
        condition: Condition.B,
        marketPrice: 8200,
        buybackMin: 2870,
        buybackMax: 4510,
        resaleMin: 3444,
        resaleMax: 8118,
        source: "system",
      },
    ],
  });

  console.log("✅ Seed complete.");
  console.log(`   Admin:          admin@dabacash.ma`);
  console.log(`   Franchise owner: owner@techcasa.ma`);
  console.log(`   Customer:       youssef@gmail.com`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
