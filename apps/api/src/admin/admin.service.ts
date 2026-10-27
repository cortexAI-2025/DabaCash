import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BuybackStatus, FranchiseStatus, FraudResolution } from "@dabacash/database";
import { PrismaService } from "../common/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ResolveFraudDto } from "./dto/admin.dto";

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService
  ) {}

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
      // GMV counts accepted sales only: cancelled and still-pending orders are not sales.
      this.prisma.order.aggregate({
        where: { status: { in: ["CONFIRMED", "IN_TRANSIT", "DELIVERED"] } },
        _sum: { totalAmount: true },
      }),
      this.prisma.commission.aggregate({ _sum: { amount: true } }),
      this.prisma.buybackRequest.count({ where: { isFlagged: true, fraudResolution: null } }),
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

  async updateFranchise(franchiseId: string, data: { status?: FranchiseStatus; commissionRate?: number }) {
    return this.prisma.franchise.update({
      where: { id: franchiseId },
      data,
    });
  }

  async getFlaggedBuybacks(status: "open" | "resolved" | "all" = "open") {
    return this.prisma.buybackRequest.findMany({
      where: {
        isFlagged: true,
        ...(status === "open" && { fraudResolution: null }),
        ...(status === "resolved" && { fraudResolution: { not: null } }),
      },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        model: { include: { brand: true } },
        franchise: { select: { name: true } },
        fraudReviewer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Closes a fraud flag. Clearing releases the request to its franchise; confirming cancels it
   * (the customer gets a neutral message: the detection rules are not disclosed).
   */
  async resolveFraud(requestId: string, adminId: string, dto: ResolveFraudDto) {
    const note = dto.note?.trim();
    if (dto.resolution === FraudResolution.CONFIRMED_FRAUD && !note) {
      throw new BadRequestException("Une note est requise pour confirmer une fraude");
    }

    const request = await this.prisma.buybackRequest.findUnique({ where: { id: requestId } });
    if (!request || !request.isFlagged) throw new NotFoundException("Demande signalée introuvable");

    const cancel =
      dto.resolution === FraudResolution.CONFIRMED_FRAUD &&
      (request.status === BuybackStatus.PENDING || request.status === BuybackStatus.UNDER_REVIEW);

    // Conditional on "still unresolved": two admins cannot both decide, and a decision is final.
    const { count } = await this.prisma.buybackRequest.updateMany({
      where: { id: requestId, fraudResolution: null },
      data: {
        fraudResolution: dto.resolution,
        fraudNote: note ?? null,
        fraudReviewedAt: new Date(),
        fraudReviewedById: adminId,
        ...(cancel && { status: BuybackStatus.CANCELLED }),
      },
    });
    if (!count) throw new ConflictException("Ce signalement a déjà été traité");

    if (cancel) {
      await this.notifications.notify(request.customerId, {
        title: "Demande de rachat non retenue",
        body: "Votre demande de rachat n'a pas pu être acceptée.",
        type: "buyback_update",
        data: { buybackId: requestId },
      });
    }
    return this.prisma.buybackRequest.findUniqueOrThrow({ where: { id: requestId } });
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
