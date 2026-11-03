import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BuybackStatus, FraudResolution, Prisma, Role } from "@dabacash/database";
import { AuditAction, AuditService } from "../audit/audit.service";
import { paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { BlockImeiDto, FraudListQueryDto, ReopenFraudDto, ResolveFraudDto } from "./dto/admin.dto";

type Admin = { id: string };
const asAdmin = (a: Admin) => ({ id: a.id, role: Role.ADMIN });

@Injectable()
export class AdminFraudService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService
  ) {}

  async listFlagged(q: FraudListQueryDto) {
    const where: Prisma.BuybackRequestWhereInput = {
      isFlagged: true,
      ...(q.status === "open" && { fraudResolution: null }),
      ...(q.status === "resolved" && { fraudResolution: { not: null } }),
    };
    const [items, total] = await Promise.all([
      this.prisma.buybackRequest.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true, email: true } },
          model: { include: { brand: true } },
          franchise: { select: { name: true } },
          fraudReviewer: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.buybackRequest.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  /**
   * Closes a fraud flag. Clearing releases the request to its franchise; confirming cancels it
   * (the customer gets a neutral message: the detection rules are not disclosed). Both are
   * reversible through `reopen`, and both leave an audit entry.
   */
  async resolve(requestId: string, admin: Admin, dto: ResolveFraudDto) {
    const note = dto.note?.trim();
    const confirming = dto.resolution === FraudResolution.CONFIRMED_FRAUD;
    if (confirming && !note) throw new BadRequestException("Une note est requise pour confirmer une fraude");

    const request = await this.prisma.buybackRequest.findUnique({ where: { id: requestId } });
    if (!request || !request.isFlagged) throw new NotFoundException("Demande signalée introuvable");
    if (dto.blockImei && !request.imei) throw new BadRequestException("Cette demande n'a pas d'IMEI à bloquer");

    const cancel = confirming && (request.status === BuybackStatus.PENDING || request.status === BuybackStatus.UNDER_REVIEW);

    await this.prisma.$transaction(async (tx) => {
      // Conditional on "still unresolved": two admins cannot both decide.
      const { count } = await tx.buybackRequest.updateMany({
        where: { id: requestId, fraudResolution: null },
        data: {
          fraudResolution: dto.resolution,
          fraudNote: note ?? null,
          fraudReviewedAt: new Date(),
          fraudReviewedById: admin.id,
          ...(cancel && { status: BuybackStatus.CANCELLED }),
        },
      });
      if (!count) throw new ConflictException("Ce signalement a déjà été traité");

      if (confirming && dto.blockImei && request.imei) {
        await tx.blockedImei.upsert({
          where: { imei: request.imei },
          update: {},
          create: { imei: request.imei, reason: `Fraude confirmée (demande ${requestId}): ${note}`, createdById: admin.id },
        });
        await this.audit.record({ actor: asAdmin(admin), action: AuditAction.IMEI_BLOCKED, entity: "BuybackRequest", entityId: requestId, metadata: { via: "fraud_resolution" } }, tx);
      }
      await this.audit.record(
        {
          actor: asAdmin(admin),
          action: AuditAction.FRAUD_RESOLVED,
          entity: "BuybackRequest",
          entityId: requestId,
          metadata: { resolution: dto.resolution, scoreAtFlag: request.fraudScore ?? 0, reasons: (request.fraudReasons ?? []) as Prisma.InputJsonValue, cancelled: cancel },
        },
        tx
      );
    });

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

  /** A suspicion is a decision about a person: it can be reviewed again, with a stated reason. */
  async reopen(requestId: string, admin: Admin, dto: ReopenFraudDto) {
    const request = await this.prisma.buybackRequest.findUnique({ where: { id: requestId } });
    if (!request || !request.isFlagged || !request.fraudResolution) throw new NotFoundException("Signalement traité introuvable");

    const restore = request.fraudResolution === FraudResolution.CONFIRMED_FRAUD && request.status === BuybackStatus.CANCELLED;
    if (request.fraudResolution === FraudResolution.CLEARED && ![BuybackStatus.PENDING, BuybackStatus.UNDER_REVIEW].includes(request.status as any)) {
      throw new ConflictException("La demande a déjà été traitée par la franchise : le signalement ne peut plus être rouvert");
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.buybackRequest.updateMany({
        where: { id: requestId, fraudResolution: request.fraudResolution },
        data: { fraudResolution: null, fraudReviewedAt: null, fraudReviewedById: null, ...(restore && { status: BuybackStatus.PENDING }) },
      });
      if (!count) throw new ConflictException("Ce signalement a changé entre-temps");
      await this.audit.record(
        { actor: asAdmin(admin), action: AuditAction.FRAUD_REOPENED, entity: "BuybackRequest", entityId: requestId, metadata: { previous: request.fraudResolution, note: dto.note, restored: restore } },
        tx
      );
    });
    return this.prisma.buybackRequest.findUniqueOrThrow({ where: { id: requestId } });
  }

  // ─── IMEI controls ─────────────────────────────────────────────────────────

  /** Everything the platform knows about one IMEI: blocklist entry and every request that carried it. */
  async lookupImei(imei: string) {
    const [blocked, requests] = await Promise.all([
      this.prisma.blockedImei.findUnique({ where: { imei }, include: { createdBy: { select: { firstName: true, lastName: true } } } }),
      this.prisma.buybackRequest.findMany({
        where: { imei },
        select: {
          id: true, status: true, condition: true, createdAt: true, isFlagged: true, fraudResolution: true,
          customer: { select: { email: true } }, franchise: { select: { name: true } }, model: { select: { name: true, brand: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return { imei, blocked, requests };
  }

  async listBlocked(page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.blockedImei.findMany({ include: { createdBy: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, ...skipTake(page, limit) }),
      this.prisma.blockedImei.count(),
    ]);
    return paginated(items, total, page, limit);
  }

  async block(admin: Admin, dto: BlockImeiDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.blockedImei.findUnique({ where: { imei: dto.imei } });
      if (existing) throw new ConflictException("Cet IMEI est déjà bloqué");
      const created = await tx.blockedImei.create({ data: { imei: dto.imei, reason: dto.reason, createdById: admin.id } });
      await this.audit.record({ actor: asAdmin(admin), action: AuditAction.IMEI_BLOCKED, entity: "BlockedImei", entityId: created.id, metadata: { reason: dto.reason } }, tx);
      return created;
    });
  }

  async unblock(admin: Admin, imei: string) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.blockedImei.deleteMany({ where: { imei } });
      if (!count) throw new NotFoundException("IMEI non bloqué");
      await this.audit.record({ actor: asAdmin(admin), action: AuditAction.IMEI_UNBLOCKED, entity: "BlockedImei", entityId: imei }, tx);
    });
  }
}
