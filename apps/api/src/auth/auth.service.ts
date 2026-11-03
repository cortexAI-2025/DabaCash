import { createHash, randomUUID } from "crypto";
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { Prisma, Role } from "@dabacash/database";
import { AuditAction, AuditService } from "../audit/audit.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ChangePasswordDto, RegisterDto } from "./dto/auth.dto";

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60_000;
const MAX_SESSIONS_PER_USER = 10;

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

type SessionUser = { id: string; email: string; role: Role; firstName: string; lastName: string };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService
  ) {}

  private get rounds() {
    return Number(this.config.get("BCRYPT_ROUNDS") ?? 12);
  }

  hashPassword(password: string) {
    return bcrypt.hash(password, this.rounds);
  }

  async register(dto: RegisterDto, ctx: RequestContext) {
    const passwordHash = await this.hashPassword(dto.password);
    let user: SessionUser;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          // role is never read from the request: self-registration is always a customer
          data: { email: dto.email, passwordHash, firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone, role: Role.CUSTOMER },
          select: { id: true, email: true, role: true, firstName: true, lastName: true },
        });
        await this.audit.record({ actor: { id: created.id, role: created.role }, action: AuditAction.REGISTER, entity: "User", entityId: created.id, ip: ctx.ip }, tx);
        return created;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Cette adresse email ou ce numéro est déjà utilisé");
      }
      throw err;
    }
    return this.issueTokens(user, ctx);
  }

  async login(email: string, password: string, ctx: RequestContext) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw new HttpException(
        { message: "Trop de tentatives échouées. Réessayez plus tard.", error: "Too Many Requests", retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Always run one bcrypt comparison so response time does not reveal whether the email exists.
    const hash = user?.passwordHash ?? (await (this.dummyHash ??= bcrypt.hash(randomUUID(), this.rounds)));
    const valid = (await bcrypt.compare(password, hash)) && !!user;

    if (!valid) {
      await this.recordFailedLogin(user?.id, email, ctx);
      throw new UnauthorizedException("Email ou mot de passe incorrect");
    }
    if (!user.isActive || user.deletedAt) throw new ForbiddenException("Ce compte est désactivé");

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.recordSafe({ actor: { id: user.id, role: user.role }, action: AuditAction.LOGIN, entity: "User", entityId: user.id, ip: ctx.ip });
    return this.issueTokens(user, ctx);
  }

  private async recordFailedLogin(userId: string | undefined, email: string, ctx: RequestContext) {
    if (!userId) {
      await this.audit.recordSafe({ action: AuditAction.LOGIN_FAILED, metadata: { email: email.slice(0, 120), known: false }, ip: ctx.ip });
      return;
    }
    // Atomic increment: concurrent wrong guesses cannot undercount.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + LOCK_MS), failedLoginCount: 0 },
      });
      await this.audit.recordSafe({ actor: { id: userId }, action: AuditAction.LOGIN_LOCKED, entity: "User", entityId: userId, metadata: { minutes: LOCK_MS / 60_000 }, ip: ctx.ip });
    } else {
      await this.audit.recordSafe({ actor: { id: userId }, action: AuditAction.LOGIN_FAILED, entity: "User", entityId: userId, metadata: { known: true }, ip: ctx.ip });
    }
  }

  /** Rotates the refresh token: each one is single-use. */
  async refresh(token: string, ctx: RequestContext) {
    let payload: { sub?: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.config.get("JWT_REFRESH_SECRET") });
    } catch {
      throw new UnauthorizedException("Session expirée");
    }

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(token) },
      include: { user: { select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true, deletedAt: true } } },
    });

    if (!session) {
      // A correctly signed token that is no longer on record has already been used or revoked:
      // someone is replaying it. Cut every session of that user and leave a trace.
      if (payload.sub) {
        await this.prisma.session.deleteMany({ where: { userId: payload.sub } });
        await this.audit.recordSafe({ actor: { id: payload.sub }, action: AuditAction.TOKEN_REUSE_DETECTED, entity: "User", entityId: payload.sub, ip: ctx.ip });
      }
      throw new UnauthorizedException("Session expirée");
    }

    const { user } = session;
    if (session.expiresAt < new Date() || !user.isActive || user.deletedAt) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException("Session expirée");
    }

    // Conditional delete: of two parallel refreshes with the same token, only one wins.
    const { count } = await this.prisma.session.deleteMany({ where: { id: session.id } });
    if (count === 0) throw new UnauthorizedException("Session expirée");
    return this.issueTokens(user, ctx);
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({ where: { refreshTokenHash: sha256(refreshToken) } });
  }

  async logoutAll(userId: string, role: Role, ctx: RequestContext) {
    await this.prisma.session.deleteMany({ where: { userId } });
    await this.audit.recordSafe({ actor: { id: userId, role }, action: AuditAction.LOGOUT_ALL, entity: "User", entityId: userId, ip: ctx.ip });
  }

  async changePassword(userId: string, role: Role, dto: ChangePasswordDto, ctx: RequestContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Mot de passe actuel incorrect");
    }
    if (dto.currentPassword === dto.newPassword) throw new ConflictException("Le nouveau mot de passe doit être différent");

    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
      await tx.session.deleteMany({ where: { userId } }); // every device must sign in again
      await this.audit.record({ actor: { id: userId, role }, action: AuditAction.PASSWORD_CHANGED, entity: "User", entityId: userId, ip: ctx.ip }, tx);
    });
  }

  private async issueTokens(user: SessionUser, ctx: RequestContext) {
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role });
    // jti makes every refresh token unique, even two issued within the same second.
    const refreshToken = this.jwt.sign(
      { sub: user.id, jti: randomUUID() },
      { secret: this.config.get("JWT_REFRESH_SECRET"), expiresIn: this.config.get("JWT_REFRESH_EXPIRES_IN", "7d") }
    );
    const exp = (this.jwt.decode(refreshToken) as { exp: number }).exp;

    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: sha256(refreshToken), // the token itself is never stored
          userAgent: ctx.userAgent?.slice(0, 200),
          ipAddress: ctx.ip,
          expiresAt: new Date(exp * 1000),
        },
      });
      const surplus = await tx.session.findMany({
        where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: MAX_SESSIONS_PER_USER, select: { id: true },
      });
      if (surplus.length) await tx.session.deleteMany({ where: { id: { in: surplus.map((s) => s.id) } } });
    });

    return {
      accessToken,
      refreshToken,
      role: user.role,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    };
  }
}
