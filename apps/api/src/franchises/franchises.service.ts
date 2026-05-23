import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class FranchisesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.franchise.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true, name: true, slug: true, city: true, region: true,
        address: true, latitude: true, longitude: true,
        phoneNumber: true, whatsappNumber: true, businessHours: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.franchise.findUniqueOrThrow({
      where: { slug },
      include: {
        listings: {
          where: { status: "ACTIVE" },
          include: { deviceModel: { include: { brand: true } } },
          take: 20,
        },
      },
    });
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
      this.prisma.buybackRequest.count({ where: { franchiseId: franchise.id, status: "PENDING" } }),
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
