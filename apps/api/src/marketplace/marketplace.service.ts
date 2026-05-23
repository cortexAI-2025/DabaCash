import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { Condition, DeviceType, ListingStatus } from "@dabacash/database";

export interface MarketplaceFilters {
  search?: string;
  brand?: string;
  deviceType?: DeviceType;
  condition?: Condition;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  page?: number;
  limit?: number;
  sortBy?: "price_asc" | "price_desc" | "newest" | "popular";
}

@Injectable()
export class MarketplaceService {
  constructor(private prisma: PrismaService) {}

  async getListings(filters: MarketplaceFilters) {
    const {
      search, brand, deviceType, condition, minPrice, maxPrice,
      city, page = 1, limit = 20, sortBy = "newest"
    } = filters;

    const skip = (page - 1) * limit;

    const where: any = {
      status: ListingStatus.ACTIVE,
      stockQuantity: { gt: 0 },
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { deviceModel: { name: { contains: search, mode: "insensitive" } } },
        { deviceModel: { brand: { name: { contains: search, mode: "insensitive" } } } },
      ];
    }

    if (brand) where.deviceModel = { ...where.deviceModel, brand: { slug: brand } };
    if (deviceType) where.deviceModel = { ...where.deviceModel, deviceType };
    if (condition) where.condition = condition;
    if (minPrice) where.listingPrice = { ...where.listingPrice, gte: minPrice };
    if (maxPrice) where.listingPrice = { ...where.listingPrice, lte: maxPrice };
    if (city) where.franchise = { city };

    const orderBy: any = {
      newest: { createdAt: "desc" },
      popular: { viewCount: "desc" },
      price_asc: { listingPrice: "asc" },
      price_desc: { listingPrice: "desc" },
    }[sortBy] ?? { createdAt: "desc" };

    const [items, total] = await Promise.all([
      this.prisma.productListing.findMany({
        where,
        include: {
          deviceModel: { include: { brand: true } },
          franchise: { select: { name: true, city: true, slug: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.productListing.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    };
  }

  async getListingById(id: string) {
    const listing = await this.prisma.productListing.findUniqueOrThrow({
      where: { id },
      include: {
        deviceModel: { include: { brand: true } },
        franchise: {
          select: {
            name: true,
            city: true,
            region: true,
            slug: true,
            phoneNumber: true,
            whatsappNumber: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });

    // Increment view count
    await this.prisma.productListing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return listing;
  }

  async getFeaturedListings() {
    return this.prisma.productListing.findMany({
      where: { status: ListingStatus.ACTIVE, stockQuantity: { gt: 0 } },
      include: {
        deviceModel: { include: { brand: true } },
        franchise: { select: { name: true, city: true } },
      },
      orderBy: { viewCount: "desc" },
      take: 8,
    });
  }

  async getBrands() {
    return this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async getDeviceModels(brandSlug?: string) {
    return this.prisma.deviceModel.findMany({
      where: {
        isActive: true,
        ...(brandSlug && { brand: { slug: brandSlug } }),
      },
      include: { brand: { select: { name: true, slug: true } } },
      orderBy: { name: "asc" },
    });
  }
}
