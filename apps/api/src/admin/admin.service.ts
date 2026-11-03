import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@dabacash/database";
import { AuditAction, AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditQueryDto, CreateFranchiseDto, FranchisesQueryDto, PaymentsQueryDto, UpdateFranchiseDto } from "./dto/admin.dto";

type Admin = { id: string };
const SETTLED = ["CONFIRMED", "IN_TRANSIT", "DELIVERED"] as const;
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService
  ) {}

  async getPlatformStats() {
    const [totalUsers, totalFranchises, totalListings, totalOrders, gmv, totalCommissions, openFlags, pendingPayments] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.franchise.count({ where: { status: "ACTIVE" } }),
      this.prisma.productListing.count({ where: { status: "ACTIVE" } }),
      this.prisma.order.count(),
      // GMV counts accepted sales only: cancelled and still-pending orders are not sales.
      this.prisma.order.aggregate({ where: { status: { in: [...SETTLED] } }, _sum: { totalAmount: true } }),
      this.prisma.commission.aggregate({ _sum: { amount: true } }),
      this.prisma.buybackRequest.count({ where: { isFlagged: true, fraudResolution: null } }),
      this.prisma.payment.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, method: "ASLAN" } }),
    ]);
    return {
      totalUsers,
      totalFranchises,
      totalListings,
      totalOrders,
      gmv: gmv._sum.totalAmount ?? 0,
      totalCommissions: totalCommissions._sum.amount ?? 0,
      flaggedBuybacks: openFlags,
      pendingPayments,
    };
  }

  // ─── franchises ────────────────────────────────────────────────────────────

  async listFranchises(q: FranchisesQueryDto) {
    const search = q.search?.trim();
    const where: Prisma.FranchiseWhereInput = {
      ...(q.status && { status: q.status }),
      ...(search && { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { city: { contains: search, mode: "insensitive" as const } }] }),
    };
    const [items, total] = await Promise.all([
      this.prisma.franchise.findMany({
        where,
        include: { owner: { select: { firstName: true, lastName: true, email: true } }, _count: { select: { listings: true, orders: true, buybackRequests: true } } },
        orderBy: { createdAt: "desc" },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.franchise.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  /** Creates the franchise and its owner account together: both or neither. */
  async createFranchise(admin: Admin, dto: CreateFranchiseDto) {
    const city = await this.prisma.city.findUnique({ where: { slug: dto.citySlug } });
    if (!city || !city.isActive) throw new NotFoundException(`Ville inconnue : ${dto.citySlug}`);
    const passwordHash = await this.auth.hashPassword(dto.owner.password);

    return this.prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { email: dto.owner.email } })) throw new ConflictException("Cette adresse email est déjà utilisée");

      const base = `${slugify(dto.name)}-${city.slug}`;
      let slug = base;
      for (let i = 2; await tx.franchise.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

      const owner = await tx.user.create({
        data: { email: dto.owner.email, passwordHash, firstName: dto.owner.firstName, lastName: dto.owner.lastName, phone: dto.owner.phone, role: Role.FRANCHISE_OWNER, isVerified: true },
        select: { id: true },
      });
      const franchise = await tx.franchise.create({
        data: {
          ownerId: owner.id, name: dto.name, slug, status: "ACTIVE", commissionRate: dto.commissionRate ?? 0.15,
          address: dto.address, city: city.name, cityId: city.id, region: city.region, latitude: city.latitude, longitude: city.longitude, phoneNumber: dto.phoneNumber,
        },
      });
      await this.audit.record({ actor: { id: admin.id, role: Role.ADMIN }, action: AuditAction.FRANCHISE_CREATED, entity: "Franchise", entityId: franchise.id, metadata: { owner: owner.id, commissionRate: franchise.commissionRate } }, tx);
      return franchise;
    });
  }

  async updateFranchise(admin: Admin, id: string, dto: UpdateFranchiseDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.franchise.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Franchise introuvable");
      const after = await tx.franchise.update({ where: { id }, data: dto });

      const changed: Record<string, { from: unknown; to: unknown }> = {};
      for (const k of Object.keys(dto) as (keyof UpdateFranchiseDto)[]) {
        if (before[k] !== after[k]) changed[k] = { from: before[k], to: after[k] };
      }
      if (Object.keys(changed).length) {
        await this.audit.record({ actor: { id: admin.id, role: Role.ADMIN }, action: AuditAction.FRANCHISE_UPDATED, entity: "Franchise", entityId: id, metadata: changed as Prisma.InputJsonValue }, tx);
      }
      return after;
    });
  }

  // ─── transactions & audit ──────────────────────────────────────────────────

  async listPayments(q: PaymentsQueryDto) {
    const search = q.search?.trim();
    const where: Prisma.PaymentWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.method && { method: q.method }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(search && {
        OR: [
          { user: { email: { contains: search, mode: "insensitive" as const } } },
          { orderId: { endsWith: search } },
          { gatewayRef: { contains: search } },
        ],
      }),
    };
    const [items, total, totals] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: {
          id: true, orderId: true, method: true, status: true, amount: true, currency: true, gatewayRef: true, paidAt: true, createdAt: true,
          user: { select: { email: true } }, order: { select: { status: true, franchise: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where: { ...where, status: "COMPLETED" }, _sum: { amount: true } }),
    ]);
    return { ...paginated(items, total, q.page, q.limit), completedAmount: totals._sum.amount ?? 0 };
  }

  async listAudit(q: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action && { action: q.action }),
      ...(q.entity && { entity: q.entity }),
      ...(q.entityId && { entityId: q.entityId }),
      ...(q.actorId && { actorId: q.actorId }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, include: { actor: { select: { email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, ...skipTake(q.page, q.limit) }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }
}
