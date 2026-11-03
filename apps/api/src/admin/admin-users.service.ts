import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "@dabacash/database";
import { AuditAction, AuditService } from "../audit/audit.service";
import { paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { UpdateUserDto, UsersQueryDto } from "./dto/admin.dto";

const USER_VIEW = {
  id: true, email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true,
  lockedUntil: true, failedLoginCount: true, lastLoginAt: true, createdAt: true, deletedAt: true,
  franchise: { select: { id: true, name: true, status: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminUsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService
  ) {}

  async list(q: UsersQueryDto) {
    const search = q.search?.trim();
    const now = new Date();
    const where: Prisma.UserWhereInput = {
      ...(q.role && { role: q.role }),
      ...(q.status === "active" && { isActive: true, deletedAt: null }),
      ...(q.status === "inactive" && { isActive: false, deletedAt: null }),
      ...(q.status === "locked" && { lockedUntil: { gt: now } }),
      ...(q.status === "deleted" && { deletedAt: { not: null } }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: USER_VIEW, orderBy: { createdAt: "desc" }, ...skipTake(q.page, q.limit) }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  async update(adminId: string, userId: string, dto: UpdateUserDto) {
    if (adminId === userId) throw new ConflictException("Vous ne pouvez pas modifier votre propre compte");

    return this.prisma.$transaction(async (tx) => {
      // Serialises concurrent admin edits: two admins demoting each other cannot both succeed.
      await tx.$queryRaw`SELECT id FROM users WHERE role = 'ADMIN' FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId }, include: { franchise: { select: { id: true } } } });
      if (!user) throw new NotFoundException("Utilisateur introuvable");
      if (user.deletedAt) throw new ConflictException("Ce compte a été supprimé");

      const roleChanges = dto.role !== undefined && dto.role !== user.role;
      const statusChanges = dto.isActive !== undefined && dto.isActive !== user.isActive;

      const losesAdmin = user.role === Role.ADMIN && (roleChanges || dto.isActive === false);
      if (losesAdmin) {
        const others = await tx.user.count({ where: { role: Role.ADMIN, isActive: true, deletedAt: null, id: { not: userId } } });
        if (!others) throw new ConflictException("Impossible : il doit rester au moins un administrateur actif");
      }
      if (roleChanges) {
        if (user.franchise && dto.role !== Role.FRANCHISE_OWNER) throw new ConflictException("Cet utilisateur gère une franchise : réaffectez-la d'abord");
        if (dto.role === Role.FRANCHISE_OWNER && !user.franchise) throw new ConflictException("Créez d'abord la franchise de cet utilisateur");
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { ...(roleChanges && { role: dto.role }), ...(statusChanges && { isActive: dto.isActive }) },
        select: USER_VIEW,
      });
      // Deactivation takes effect now: no refresh token survives it.
      if (statusChanges && dto.isActive === false) await tx.session.deleteMany({ where: { userId } });

      if (roleChanges) {
        await this.audit.record({ actor: { id: adminId, role: Role.ADMIN }, action: AuditAction.USER_ROLE_CHANGED, entity: "User", entityId: userId, metadata: { from: user.role, to: dto.role! } }, tx);
      }
      if (statusChanges) {
        await this.audit.record({ actor: { id: adminId, role: Role.ADMIN }, action: AuditAction.USER_STATUS_CHANGED, entity: "User", entityId: userId, metadata: { from: user.isActive, to: dto.isActive! } }, tx);
      }
      return updated;
    });
  }

  async unlock(adminId: string, userId: string) {
    const { count } = await this.prisma.user.updateMany({ where: { id: userId, deletedAt: null }, data: { lockedUntil: null, failedLoginCount: 0 } });
    if (!count) throw new NotFoundException("Utilisateur introuvable");
    await this.audit.record({ actor: { id: adminId, role: Role.ADMIN }, action: AuditAction.USER_UNLOCKED, entity: "User", entityId: userId });
  }
}
