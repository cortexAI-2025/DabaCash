import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from "@nestjs/common";
import { BuybackStatus, DeliveryMethod, Prisma, Role } from "@dabacash/database";
import { AuditAction, AuditService } from "../audit/audit.service";
import { haversineKm } from "../common/geo";
import { paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { FLAG_THRESHOLD, scoreFraud } from "../pricing/fraud";
import { PricingService } from "../pricing/pricing.service";
import { BuybackListQueryDto, CreateBuybackDto, ReviewBuybackDto } from "./dto/buyback.dto";

type Actor = { id: string; role: Role };

// The model as shown to users: the market baseline that drives offers is an internal parameter.
const MODEL = { select: { id: true, name: true, slug: true, deviceType: true, releaseYear: true, brand: { select: { name: true, slug: true } } } } as const;

const VIEW = {
  model: MODEL,
  franchise: { select: { name: true, city: true } },
} satisfies Prisma.BuybackRequestInclude;

/** Staff-only detection internals: showing them to the customer would teach a fraudster which rule fired. */
const FRAUD_FIELDS = ["fraudScore", "fraudReasons", "fraudNote", "fraudResolution", "fraudReviewedAt", "fraudReviewedById", "isFlagged"] as const;
function forCustomer<T extends object>(r: T): Omit<T, (typeof FRAUD_FIELDS)[number]> {
  const copy = { ...r } as Record<string, unknown>;
  for (const k of FRAUD_FIELDS) delete copy[k];
  return copy as Omit<T, (typeof FRAUD_FIELDS)[number]>;
}

const REVIEWABLE: BuybackStatus[] = [BuybackStatus.PENDING, BuybackStatus.UNDER_REVIEW];
// A customer may withdraw until the franchise has taken the device.
const CUSTOMER_CANCELLABLE: BuybackStatus[] = [BuybackStatus.PENDING, BuybackStatus.UNDER_REVIEW, BuybackStatus.ACCEPTED];
// Overriding the estimate by more than this ratio must be explained.
const OVERRIDE_TOLERANCE = 0.5;

@Injectable()
export class BuybackService {
  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private notifications: NotificationsService,
    private audit: AuditService
  ) {}

  async create(customerId: string, dto: CreateBuybackDto, idempotencyKey?: string) {
    if (dto.deliveryMethod === DeliveryMethod.PICKUP_FROM_HOME && !dto.pickupAddress) {
      throw new BadRequestException("Une adresse d'enlèvement est requise");
    }

    if (idempotencyKey) {
      const existing = await this.prisma.buybackRequest.findUnique({
        where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
        include: VIEW,
      });
      if (existing) return forCustomer(existing);
    }

    const model = await this.prisma.deviceModel.findUniqueOrThrow({ where: { id: dto.deviceModelId } });
    const estimate = this.pricing.estimateFor(model, dto.condition);

    const city = await this.prisma.city.findUnique({ where: { slug: dto.citySlug } });
    if (!city || !city.isActive) throw new BadRequestException(`Ville inconnue : ${dto.citySlug}`);
    const franchise = await this.matchFranchise(city, dto.deliveryMethod);
    if (!franchise) throw new BadRequestException("Aucune franchise disponible pour le moment");

    const fraud = await this.assessFraud(customerId, dto, model, estimate.buybackPrice);
    const flagged = fraud.score >= FLAG_THRESHOLD;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const created = await tx.buybackRequest.create({
          data: {
            customerId,
            franchiseId: franchise.id,
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
            fraudScore: fraud.score,
            fraudReasons: fraud.reasons,
            isFlagged: flagged,
            idempotencyKey,
          },
          include: VIEW,
        });
        if (flagged) {
          // Explainable by construction: the reasons that produced the flag are part of the trail.
          await this.audit.record({ action: AuditAction.FRAUD_FLAGGED, entity: "BuybackRequest", entityId: created.id, metadata: { score: fraud.score, reasons: fraud.reasons } }, tx);
        }
        return created;
      });
      return forCustomer(created);
    } catch (err) {
      // Two identical submissions raced past the lookup: the unique key stops the second one.
      if (idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.prisma.buybackRequest.findUnique({
          where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
          include: VIEW,
        });
        if (existing) return forCustomer(existing);
      }
      throw err;
    }
  }

  private async assessFraud(
    customerId: string,
    dto: CreateBuybackDto,
    model: { releaseYear: number | null; deviceType: any },
    estimatedPrice: number
  ) {
    const [customer, recent, imeiClash, blocked] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: customerId }, select: { createdAt: true } }),
      this.prisma.buybackRequest.count({ where: { customerId, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } } }),
      dto.imei
        ? this.prisma.buybackRequest.count({
            where: {
              imei: dto.imei,
              status: { in: [BuybackStatus.PENDING, BuybackStatus.UNDER_REVIEW, BuybackStatus.ACCEPTED, BuybackStatus.COMPLETED] },
              OR: [{ fraudResolution: null }, { fraudResolution: { not: "CONFIRMED_FRAUD" } }],
            },
          })
        : Promise.resolve(0),
      dto.imei ? this.prisma.blockedImei.findUnique({ where: { imei: dto.imei } }) : Promise.resolve(null),
    ]);

    return scoreFraud({
      condition: dto.condition,
      deviceType: model.deviceType,
      ageYears: model.releaseYear ? new Date().getFullYear() - model.releaseYear : null,
      imei: dto.imei,
      imeiSeenElsewhere: imeiClash > 0,
      imeiBlocked: !!blocked,
      requestsLast24h: recent + 1,
      accountAgeHours: (Date.now() - customer.createdAt.getTime()) / 3600_000,
      estimatedPrice,
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

  async findAllForCustomer(customerId: string, q: BuybackListQueryDto) {
    const where: Prisma.BuybackRequestWhereInput = { customerId, ...(q.status && { status: q.status }) };
    const [items, total] = await Promise.all([
      this.prisma.buybackRequest.findMany({ where, include: VIEW, orderBy: { createdAt: "desc" }, ...skipTake(q.page, q.limit) }),
      this.prisma.buybackRequest.count({ where }),
    ]);
    return paginated(items.map(forCustomer), total, q.page, q.limit);
  }

  async findAllForFranchise(franchiseOwnerId: string, q: BuybackListQueryDto) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({ where: { ownerId: franchiseOwnerId } });
    const where: Prisma.BuybackRequestWhereInput = { franchiseId: franchise.id, ...(q.status && { status: q.status }) };
    const [items, total] = await Promise.all([
      this.prisma.buybackRequest.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
          model: MODEL,
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.buybackRequest.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  /** Visible to the customer, the assigned franchise and admins. Anyone else gets a 404. */
  async findById(id: string, actor: Actor) {
    const r = await this.prisma.buybackRequest.findUnique({
      where: { id },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        model: MODEL,
        franchise: { select: { name: true, city: true, address: true, ownerId: true } },
      },
    });
    const allowed =
      !!r &&
      (actor.role === Role.ADMIN ||
        r.customerId === actor.id ||
        (actor.role === Role.FRANCHISE_OWNER && r.franchise?.ownerId === actor.id));
    if (!r || !allowed) throw new NotFoundException("Demande introuvable");

    const { ownerId: _omit, ...franchise } = r.franchise ?? ({} as { ownerId?: string });
    const isCustomer = actor.role === Role.CUSTOMER;
    return {
      ...r,
      franchise: r.franchise ? franchise : null,
      // The customer already knows their own data; the fraud internals are for staff only.
      ...(isCustomer && Object.fromEntries(FRAUD_FIELDS.map((k) => [k, undefined]))),
    };
  }

  async review(requestId: string, franchiseOwnerId: string, dto: ReviewBuybackDto) {
    const request = await this.prisma.buybackRequest.findUnique({ where: { id: requestId }, include: { franchise: true } });
    if (!request || request.franchise?.ownerId !== franchiseOwnerId) throw new NotFoundException("Demande introuvable");

    // A flagged request is the admin's to clear first: a franchise must not price a suspect device.
    if (request.isFlagged && !request.fraudResolution) {
      throw new ConflictException("Demande en cours de vérification antifraude");
    }
    if (!REVIEWABLE.includes(request.status)) throw new ConflictException("Cette demande a déjà été traitée");

    const accepted = dto.decision === "ACCEPTED";
    const estimate = request.estimatedBuybackPrice ?? 0;
    const finalPrice = dto.finalBuybackPrice ?? estimate;
    const note = dto.franchiseNotes?.trim();
    const overridden = dto.finalBuybackPrice !== undefined && dto.finalBuybackPrice !== estimate;

    if (accepted) {
      if (finalPrice <= 0) throw new BadRequestException("Le prix de rachat doit être supérieur à 0");
      if (overridden && estimate > 0 && Math.abs(finalPrice - estimate) / estimate > OVERRIDE_TOLERANCE && !note) {
        throw new BadRequestException("Un écart de plus de 50 % avec l'estimation doit être justifié dans la note");
      }
    }

    const newStatus = accepted ? BuybackStatus.ACCEPTED : BuybackStatus.REJECTED;
    await this.prisma.$transaction(async (tx) => {
      // The decision applies only if the request is still undecided and not under fraud hold: of two
      // simultaneous decisions exactly one wins, the other gets a 409.
      const { count } = await tx.buybackRequest.updateMany({
        where: {
          id: requestId,
          status: { in: REVIEWABLE },
          OR: [{ isFlagged: false }, { fraudResolution: { not: null } }],
        },
        data: { status: newStatus, finalBuybackPrice: accepted ? finalPrice : null, franchiseNotes: note },
      });
      if (!count) throw new ConflictException("Cette demande a déjà été traitée");
      await this.audit.record(
        {
          actor: { id: franchiseOwnerId, role: Role.FRANCHISE_OWNER },
          action: AuditAction.BUYBACK_DECIDED,
          entity: "BuybackRequest",
          entityId: requestId,
          metadata: { decision: dto.decision, estimate, finalPrice: accepted ? finalPrice : null, overridden },
        },
        tx
      );
    });

    const who = request.franchise?.name ?? "La franchise";
    await this.notifications.notify(request.customerId, {
      title: accepted ? "Rachat accepté" : "Rachat refusé",
      body: accepted
        ? `${who} accepte votre appareil pour ${Math.round(finalPrice)} MAD.`
        : `${who} ne peut pas racheter votre appareil.${note ? ` Motif : ${note}` : ""}`,
      type: "buyback_update",
      data: { buybackId: requestId },
    });
    return this.prisma.buybackRequest.findUniqueOrThrow({ where: { id: requestId }, include: VIEW });
  }

  /** The franchise has received the device and paid the customer. */
  async complete(requestId: string, franchiseOwnerId: string) {
    const request = await this.prisma.buybackRequest.findUnique({ where: { id: requestId }, include: { franchise: true } });
    if (!request || request.franchise?.ownerId !== franchiseOwnerId) throw new NotFoundException("Demande introuvable");

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.buybackRequest.updateMany({
        where: { id: requestId, status: BuybackStatus.ACCEPTED },
        data: { status: BuybackStatus.COMPLETED, completedAt: new Date() },
      });
      if (!count) throw new ConflictException("Seule une demande acceptée peut être finalisée");
      await this.audit.record({ actor: { id: franchiseOwnerId, role: Role.FRANCHISE_OWNER }, action: AuditAction.BUYBACK_COMPLETED, entity: "BuybackRequest", entityId: requestId, metadata: { finalPrice: request.finalBuybackPrice } }, tx);
    });
    await this.notifications.notify(request.customerId, {
      title: "Rachat finalisé",
      body: `${request.franchise?.name ?? "La franchise"} a bien reçu votre appareil. Merci !`,
      type: "buyback_update",
      data: { buybackId: requestId },
    });
    return this.prisma.buybackRequest.findUniqueOrThrow({ where: { id: requestId }, include: VIEW });
  }

  /** The customer withdraws, as long as the franchise has not taken the device. */
  async cancel(requestId: string, customerId: string) {
    const request = await this.prisma.buybackRequest.findUnique({ where: { id: requestId } });
    if (!request || request.customerId !== customerId) throw new NotFoundException("Demande introuvable");

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.buybackRequest.updateMany({
        where: { id: requestId, customerId, status: { in: CUSTOMER_CANCELLABLE } },
        data: { status: BuybackStatus.CANCELLED },
      });
      if (!count) throw new ConflictException("Cette demande ne peut plus être annulée");
      await this.audit.record({ actor: { id: customerId, role: Role.CUSTOMER }, action: AuditAction.BUYBACK_CANCELLED, entity: "BuybackRequest", entityId: requestId }, tx);
    });
    return forCustomer(await this.prisma.buybackRequest.findUniqueOrThrow({ where: { id: requestId }, include: VIEW }));
  }
}
