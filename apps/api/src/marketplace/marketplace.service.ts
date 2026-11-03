import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ListingStatus, Prisma } from "@dabacash/database";
import { paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { ListingsQueryDto } from "./dto/marketplace.dto";

// A listing is public only while it is for sale AND its franchise is in good standing.
// Suspended or closed franchises disappear from the marketplace immediately.
const PUBLIC_FRANCHISE: Prisma.FranchiseWhereInput = { status: "ACTIVE" };

// What a shopper may see. Deliberately a select, not an include: a new column added to the table
// must not become public by accident. Never exposed: buybackPrice (the franchise's margin),
// the model's market baseline, view counters.
const PUBLIC_MODEL = { select: { name: true, slug: true, deviceType: true, releaseYear: true, brand: { select: { name: true, slug: true } } } } as const;
const PUBLIC_LISTING = {
  id: true, title: true, description: true, condition: true, status: true, listingPrice: true, originalPrice: true,
  stockQuantity: true, images: true, warrantyMonths: true, isNegotiable: true, createdAt: true,
} as const;
const CARD = {
  ...PUBLIC_LISTING,
  deviceModel: PUBLIC_MODEL,
  franchise: { select: { id: true, name: true, city: true, slug: true } },
} satisfies Prisma.ProductListingSelect;

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  constructor(private prisma: PrismaService) {}

  async getListings(q: ListingsQueryDto) {
    if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) {
      throw new BadRequestException("minPrice doit être inférieur ou égal à maxPrice");
    }

    const where: Prisma.ProductListingWhereInput = {
      status: ListingStatus.ACTIVE,
      stockQuantity: { gt: 0 },
      franchise: { ...PUBLIC_FRANCHISE, ...(q.city && { cityRef: { slug: q.city } }) },
      ...(q.condition && { condition: q.condition }),
      ...((q.minPrice !== undefined || q.maxPrice !== undefined) && {
        listingPrice: { ...(q.minPrice !== undefined && { gte: q.minPrice }), ...(q.maxPrice !== undefined && { lte: q.maxPrice }) },
      }),
      ...((q.brand || q.deviceType) && {
        deviceModel: { ...(q.brand && { brand: { slug: q.brand } }), ...(q.deviceType && { deviceType: q.deviceType }) },
      }),
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: "insensitive" } },
          { deviceModel: { name: { contains: q.search, mode: "insensitive" } } },
          { deviceModel: { brand: { name: { contains: q.search, mode: "insensitive" } } } },
        ],
      }),
    };

    const orderBy: Prisma.ProductListingOrderByWithRelationInput = {
      newest: { createdAt: "desc" as const },
      popular: { viewCount: "desc" as const },
      price_asc: { listingPrice: "asc" as const },
      price_desc: { listingPrice: "desc" as const },
    }[q.sortBy];

    const [items, total] = await Promise.all([
      this.prisma.productListing.findMany({ where, select: CARD, orderBy: [orderBy, { id: "asc" }], ...skipTake(q.page, q.limit) }),
      this.prisma.productListing.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  async getListingById(id: string) {
    const listing = await this.prisma.productListing.findFirst({
      where: { id, status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] }, franchise: PUBLIC_FRANCHISE },
      select: {
        ...PUBLIC_LISTING,
        deviceModel: PUBLIC_MODEL,
        franchise: {
          select: { name: true, city: true, region: true, slug: true, phoneNumber: true, whatsappNumber: true, latitude: true, longitude: true },
        },
      },
    });
    if (!listing) throw new NotFoundException("Annonce introuvable");

    // Best effort: a failed counter update must never fail a page view.
    this.prisma.productListing
      .update({ where: { id }, data: { viewCount: { increment: 1 } } })
      .catch((err) => this.logger.warn(`viewCount update failed: ${err.message}`));
    return listing;
  }

  getFeaturedListings() {
    return this.prisma.productListing.findMany({
      where: { status: ListingStatus.ACTIVE, stockQuantity: { gt: 0 }, franchise: PUBLIC_FRANCHISE },
      select: CARD,
      orderBy: [{ viewCount: "desc" }, { id: "asc" }],
      take: 8,
    });
  }

  getBrands() {
    return this.prisma.brand.findMany({
      where: { isActive: true },
      select: { id: true, name: true, slug: true, logoUrl: true },
      orderBy: { name: "asc" },
    });
  }

  getDeviceModels(brandSlug?: string) {
    return this.prisma.deviceModel.findMany({
      where: { isActive: true, baseMarketPrice: { gt: 0 }, ...(brandSlug && { brand: { slug: brandSlug } }) },
      select: { id: true, name: true, slug: true, deviceType: true, releaseYear: true, brand: { select: { name: true, slug: true } } },
      orderBy: { name: "asc" },
    });
  }

  /** Real figures for the public home page, replacing marketing placeholders. */
  async getPublicStats() {
    const [franchises, cities, listings, sold] = await Promise.all([
      this.prisma.franchise.count({ where: { status: "ACTIVE" } }),
      this.prisma.city.count({ where: { isActive: true, franchises: { some: { status: "ACTIVE" } } } }),
      this.prisma.productListing.count({ where: { status: ListingStatus.ACTIVE, stockQuantity: { gt: 0 }, franchise: PUBLIC_FRANCHISE } }),
      this.prisma.orderItem.aggregate({ where: { order: { status: "DELIVERED" } }, _sum: { quantity: true } }),
    ]);
    return { franchises, cities, listings, devicesSold: sold._sum.quantity ?? 0 };
  }
}
