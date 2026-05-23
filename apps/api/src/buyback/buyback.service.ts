import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PricingService } from "../pricing/pricing.service";
import { CreateBuybackDto, ReviewBuybackDto } from "./dto/buyback.dto";
import { BuybackStatus, Role } from "@dabacash/database";

@Injectable()
export class BuybackService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService
  ) {}

  async create(customerId: string, dto: CreateBuybackDto) {
    // Run pricing engine
    const estimate = await this.pricing.estimate({
      deviceModelId: dto.deviceModelId,
      condition: dto.condition,
    });

    const fraudScore = this.pricing.computeFraudScore({
      claimedCondition: dto.condition,
      claimedAge: 0, // TODO: derive from model release year
    });

    // Assign nearest franchise (simplified – take first active)
    const franchise = await this.prisma.franchise.findFirst({
      where: { status: "ACTIVE" },
    });

    return this.prisma.buybackRequest.create({
      data: {
        customerId,
        franchiseId: franchise?.id,
        deviceModelId: dto.deviceModelId,
        condition: dto.condition,
        deliveryMethod: dto.deliveryMethod,
        description: dto.description,
        images: dto.images ?? [],
        imei: dto.imei,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
        pickupAddress: dto.pickupAddress,
        estimatedBuybackPrice: estimate.buybackPrice,
        estimatedResaleMin: estimate.resaleMin,
        estimatedResaleMax: estimate.resaleMax,
        fraudScore,
        isFlagged: fraudScore > 0.5,
      },
      include: {
        model: { include: { brand: true } },
        franchise: { select: { name: true, city: true } },
      },
    });
  }

  async findAllForCustomer(customerId: string) {
    return this.prisma.buybackRequest.findMany({
      where: { customerId },
      include: {
        model: { include: { brand: true } },
        franchise: { select: { name: true, city: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findAllForFranchise(franchiseId: string) {
    return this.prisma.buybackRequest.findMany({
      where: { franchiseId },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        model: { include: { brand: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async review(requestId: string, franchiseOwnerId: string, dto: ReviewBuybackDto) {
    const request = await this.prisma.buybackRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { franchise: true },
    });

    if (request.franchise?.ownerId !== franchiseOwnerId) {
      throw new ForbiddenException("Not your franchise");
    }

    const newStatus =
      dto.decision === "ACCEPTED" ? BuybackStatus.ACCEPTED : BuybackStatus.REJECTED;

    return this.prisma.buybackRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        finalBuybackPrice: dto.finalBuybackPrice ?? request.estimatedBuybackPrice,
        franchiseNotes: dto.franchiseNotes,
        completedAt: newStatus === BuybackStatus.ACCEPTED ? new Date() : null,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.buybackRequest.findUniqueOrThrow({
      where: { id },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        model: { include: { brand: true } },
        franchise: { select: { name: true, city: true, address: true } },
      },
    });
  }
}
