import { Injectable, ForbiddenException, BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PricingService } from "../pricing/pricing.service";
import { CreateBuybackDto, ReviewBuybackDto } from "./dto/buyback.dto";
import { BuybackStatus, DeliveryMethod } from "@dabacash/database";
import { haversineKm } from "../common/geo";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class BuybackService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private notifications: NotificationsService
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

    const city = await this.prisma.city.findUnique({ where: { slug: dto.citySlug } });
    if (!city || !city.isActive) throw new BadRequestException(`Unknown city: ${dto.citySlug}`);

    const franchise = await this.matchFranchise(city, dto.deliveryMethod);

    return this.prisma.buybackRequest.create({
      data: {
        customerId,
        franchiseId: franchise?.id,
        cityId: city.id,
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

  /**
   * Same-city franchise first; otherwise the nearest active one (drop-in only,
   * since a home pickup needs a local franchise to dispatch from).
   */
  private async matchFranchise(
    city: { id: string; latitude: number; longitude: number },
    deliveryMethod: DeliveryMethod
  ) {
    const franchises = await this.prisma.franchise.findMany({
      where: { status: "ACTIVE" },
      include: { cityRef: { select: { latitude: true, longitude: true } } },
    });

    const local = franchises.find((f) => f.cityId === city.id);
    if (local) return local;

    if (deliveryMethod === DeliveryMethod.PICKUP_FROM_HOME) {
      throw new BadRequestException(
        "L'enlèvement à domicile n'est pas encore disponible dans cette ville. Déposez votre appareil en franchise."
      );
    }

    let best: (typeof franchises)[number] | undefined;
    let bestKm = Infinity;
    for (const f of franchises) {
      const lat = f.latitude ?? f.cityRef?.latitude;
      const lng = f.longitude ?? f.cityRef?.longitude;
      if (lat == null || lng == null) continue;
      const km = haversineKm(city, { latitude: lat, longitude: lng });
      if (km < bestKm) {
        bestKm = km;
        best = f;
      }
    }
    return best;
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

  async findAllForFranchise(franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });
    return this.prisma.buybackRequest.findMany({
      where: { franchiseId: franchise.id },
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

    // A decision is final: re-reviewing an accepted/rejected request would let a franchise
    // change the price the customer already agreed to.
    if (request.status !== BuybackStatus.PENDING && request.status !== BuybackStatus.UNDER_REVIEW) {
      throw new ConflictException("Cette demande a déjà été traitée");
    }

    const newStatus =
      dto.decision === "ACCEPTED" ? BuybackStatus.ACCEPTED : BuybackStatus.REJECTED;
    const finalPrice = dto.finalBuybackPrice ?? request.estimatedBuybackPrice;

    const updated = await this.prisma.buybackRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        finalBuybackPrice: finalPrice,
        franchiseNotes: dto.franchiseNotes,
        completedAt: newStatus === BuybackStatus.ACCEPTED ? new Date() : null,
      },
    });

    await this.notifications.notify(request.customerId, {
      title: newStatus === BuybackStatus.ACCEPTED ? "Rachat accepté" : "Rachat refusé",
      body:
        newStatus === BuybackStatus.ACCEPTED
          ? `${request.franchise?.name ?? "La franchise"} accepte votre appareil pour ${Math.round(finalPrice ?? 0)} MAD.`
          : `${request.franchise?.name ?? "La franchise"} ne peut pas racheter votre appareil.${dto.franchiseNotes ? ` Motif : ${dto.franchiseNotes}` : ""}`,
      type: "buyback_update",
      data: { buybackId: requestId },
    });

    return updated;
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
