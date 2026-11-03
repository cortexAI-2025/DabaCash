import { randomUUID } from "crypto";
import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { OrderStatus, Prisma, Role } from "@dabacash/database";
import { AuditAction, AuditService } from "../audit/audit.service";
import { PaginationQueryDto, paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { UpdateProfileDto } from "./dto/users.dto";

const PROFILE = {
  id: true, email: true, firstName: true, lastName: true, phone: true, role: true,
  avatarUrl: true, isVerified: true, createdAt: true,
} as const;

const OPEN_ORDER: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.IN_TRANSIT];

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private auth: AuthService
  ) {}

  getProfile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: PROFILE });
  }

  async updateProfile(userId: string, role: Role, dto: UpdateProfileDto) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: userId }, data: dto, select: PROFILE });
      await this.audit.record({ actor: { id: userId, role }, action: AuditAction.PROFILE_UPDATED, entity: "User", entityId: userId, metadata: { fields: Object.keys(dto) } }, tx);
      return u;
    });
    return updated;
  }

  async listNotifications(userId: string, q: PaginationQueryDto) {
    const where = { userId };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(q.page, q.limit) }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { ...paginated(items, total, q.page, q.limit), unread };
  }

  async markNotificationRead(notificationId: string, userId: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { isRead: true } });
    if (!count) throw new NotFoundException("Notification introuvable");
  }

  async markAllNotificationsRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { updated: count };
  }

  /** Everything the platform holds about the user, in a portable format (right of access / portability). */
  async exportData(userId: string, role: Role) {
    const [profile, orders, buybacks, notifications, audit] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { ...PROFILE, lastLoginAt: true, passwordChangedAt: true } }),
      this.prisma.order.findMany({
        where: { customerId: userId },
        include: { items: { select: { quantity: true, unitPrice: true, totalPrice: true, listing: { select: { title: true } } } }, payment: { select: { method: true, status: true, amount: true, currency: true, paidAt: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.buybackRequest.findMany({
        where: { customerId: userId },
        select: { id: true, condition: true, status: true, deliveryMethod: true, estimatedBuybackPrice: true, finalBuybackPrice: true, description: true, imei: true, pickupAddress: true, createdAt: true, model: { select: { name: true, brand: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.findMany({ where: { userId }, select: { title: true, body: true, type: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.auditLog.findMany({ where: { actorId: userId }, select: { action: true, createdAt: true, ip: true }, orderBy: { createdAt: "desc" }, take: 500 }),
    ]);
    await this.audit.record({ actor: { id: userId, role }, action: AuditAction.DATA_EXPORTED, entity: "User", entityId: userId });
    return { exportedAt: new Date().toISOString(), profile, orders, buybackRequests: buybacks, notifications, activity: audit };
  }

  /**
   * Right to erasure by anonymisation. The account row is kept (orders, payments and commissions
   * must stay consistent for accounting) but nothing in it identifies the person any more.
   */
  async deleteAccount(userId: string, role: Role, password: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { franchise: { select: { id: true } } } });
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException("Mot de passe incorrect");
    if (user.franchise) throw new ConflictException("Un compte franchise ne peut pas être supprimé en libre-service : contactez le support");

    const open = await this.prisma.order.count({ where: { customerId: userId, status: { in: OPEN_ORDER } } });
    if (open) throw new ConflictException("Vous avez des commandes en cours : terminez-les ou annulez-les avant de supprimer votre compte");

    const unusableHash = await bcrypt.hash(randomUUID(), 4);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.invalid`,
          firstName: "Compte", lastName: "supprimé", phone: null, avatarUrl: null,
          passwordHash: unusableHash, isActive: false, deletedAt: new Date(), failedLoginCount: 0, lockedUntil: null,
        },
      });
      await tx.session.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.order.updateMany({ where: { customerId: userId }, data: { deliveryAddress: Prisma.DbNull, notes: null } });
      // The IMEI stays: it identifies a device for theft/fraud control, not the person once the account is anonymised.
      await tx.buybackRequest.updateMany({ where: { customerId: userId }, data: { description: null, pickupAddress: null, images: [] } });
      await this.audit.record({ actor: { id: userId, role }, action: AuditAction.ACCOUNT_DELETED, entity: "User", entityId: userId }, tx);
    });
  }
}
