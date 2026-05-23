import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getPlatformStats() {
    const [
      totalUsers,
      totalFranchises,
      totalListings,
      totalOrders,
      totalRevenue,
      totalCommissions,
      flaggedBuybacks,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.franchise.count({ where: { status: "ACTIVE" } }),
      this.prisma.productListing.count({ where: { status: "ACTIVE" } }),
      this.prisma.order.count(),
      this.prisma.order.aggregate({ _sum: { totalAmount: true } }),
      this.prisma.commission.aggregate({ _sum: { amount: true } }),
      this.prisma.buybackRequest.count({ where: { isFlagged: true } }),
    ]);

    return {
      totalUsers,
      totalFranchises,
      totalListings,
      totalOrders,
      gmv: totalRevenue._sum.totalAmount ?? 0,
      totalCommissions: totalCommissions._sum.amount ?? 0,
      flaggedBuybacks,
    };
  }

  async getFranchises() {
    return this.prisma.franchise.findMany({
      include: {
        owner: { select: { firstName: true, lastName: true, email: true } },
        _count: { select: { listings: true, orders: true, buybackRequests: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateFranchise(franchiseId: string, data: { status?: string; commissionRate?: number }) {
    return this.prisma.franchise.update({
      where: { id: franchiseId },
      data,
    });
  }

  async getFlaggedBuybacks() {
    return this.prisma.buybackRequest.findMany({
      where: { isFlagged: true },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        model: { include: { brand: true } },
        franchise: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getTopSellingCategories() {
    return this.prisma.orderItem.groupBy({
      by: ["listingId"],
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: "desc" } },
      take: 10,
    });
  }

  async getAllOrders() {
    return this.prisma.order.findMany({
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        franchise: { select: { name: true, city: true } },
        items: { include: { listing: { select: { title: true, listingPrice: true } } } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
}
