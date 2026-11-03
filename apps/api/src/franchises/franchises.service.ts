import { Injectable, NotFoundException } from "@nestjs/common";
import { AnalyticsService } from "../analytics/analytics.service";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class FranchisesService {
  constructor(
    private prisma: PrismaService,
    private analytics: AnalyticsService
  ) {}

  async getAnalytics(franchiseOwnerId: string, days: number) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({ where: { ownerId: franchiseOwnerId } });
    return this.analytics.getAnalytics(days, franchise.id);
  }

  async findAll() {
    return this.prisma.franchise.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, name: true, slug: true, city: true, region: true,
        cityRef: { select: { slug: true, name: true } },
        address: true, latitude: true, longitude: true,
        phoneNumber: true, whatsappNumber: true, businessHours: true,
      },
      orderBy: { name: "asc" },
    });
  }

  /** Public profile: contact details and listings. Never the owner, the commission rate or internal fields. */
  async findBySlug(slug: string) {
    const franchise = await this.prisma.franchise.findFirst({
      where: { slug, status: "ACTIVE" },
      select: {
        id: true, name: true, slug: true, description: true, logoUrl: true, city: true, region: true, address: true,
        latitude: true, longitude: true, phoneNumber: true, whatsappNumber: true, businessHours: true,
        listings: {
          where: { status: "ACTIVE", stockQuantity: { gt: 0 } },
          select: {
            id: true, title: true, listingPrice: true, originalPrice: true, condition: true, images: true, warrantyMonths: true,
            deviceModel: { select: { name: true, brand: { select: { name: true } } } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    if (!franchise) throw new NotFoundException("Franchise introuvable");
    return franchise;
  }

  async getDashboardStats(franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });

    const [
      totalListings,
      activeListings,
      totalOrders,
      pendingBuybacks,
      totalRevenue,
      totalCommission,
    ] = await Promise.all([
      this.prisma.productListing.count({ where: { franchiseId: franchise.id } }),
      this.prisma.productListing.count({ where: { franchiseId: franchise.id, status: "ACTIVE" } }),
      this.prisma.order.count({ where: { franchiseId: franchise.id } }),
      this.prisma.buybackRequest.count({ where: { franchiseId: franchise.id, status: "PENDING", OR: [{ isFlagged: false }, { fraudResolution: { not: null } }] } }),
      this.prisma.order.aggregate({
        where: { franchiseId: franchise.id, status: "DELIVERED" },
        _sum: { totalAmount: true },
      }),
      this.prisma.commission.aggregate({
        where: { franchiseId: franchise.id },
        _sum: { amount: true },
      }),
    ]);

    return {
      franchise,
      stats: {
        totalListings,
        activeListings,
        totalOrders,
        pendingBuybacks,
        totalRevenue: totalRevenue._sum.totalAmount ?? 0,
        totalCommissionPaid: totalCommission._sum.amount ?? 0,
      },
    };
  }

  async getRecentSales(franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });
    return this.prisma.order.findMany({
      where: { franchiseId: franchise.id, status: { in: ["CONFIRMED", "DELIVERED"] } },
      include: {
        items: { include: { listing: { include: { deviceModel: { include: { brand: true } } } } } },
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }
}
