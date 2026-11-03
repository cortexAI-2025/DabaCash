import { Injectable, Logger } from "@nestjs/common";
import { Prisma, Role } from "@dabacash/database";
import { PrismaService } from "../common/prisma/prisma.service";

/** Every action that changes who can do what, who owns money, or who is suspected of fraud. */
export const AuditAction = {
  REGISTER: "REGISTER",
  LOGIN: "LOGIN",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGIN_LOCKED: "LOGIN_LOCKED",
  LOGOUT_ALL: "LOGOUT_ALL",
  TOKEN_REUSE_DETECTED: "TOKEN_REUSE_DETECTED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PROFILE_UPDATED: "PROFILE_UPDATED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_STATUS_CHANGED: "USER_STATUS_CHANGED",
  USER_UNLOCKED: "USER_UNLOCKED",
  DATA_EXPORTED: "DATA_EXPORTED",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  FRANCHISE_CREATED: "FRANCHISE_CREATED",
  FRANCHISE_UPDATED: "FRANCHISE_UPDATED",
  ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
  ORDER_CANCELLED_BY_CUSTOMER: "ORDER_CANCELLED_BY_CUSTOMER",
  PAYMENT_SETTLED: "PAYMENT_SETTLED",
  PAYMENT_LATE_REFUND_REQUIRED: "PAYMENT_LATE_REFUND_REQUIRED",
  BUYBACK_DECIDED: "BUYBACK_DECIDED",
  BUYBACK_COMPLETED: "BUYBACK_COMPLETED",
  BUYBACK_CANCELLED: "BUYBACK_CANCELLED",
  FRAUD_FLAGGED: "FRAUD_FLAGGED",
  FRAUD_RESOLVED: "FRAUD_RESOLVED",
  FRAUD_REOPENED: "FRAUD_REOPENED",
  IMEI_BLOCKED: "IMEI_BLOCKED",
  IMEI_UNBLOCKED: "IMEI_UNBLOCKED",
  CATALOG_PRICE_CHANGED: "CATALOG_PRICE_CHANGED",
  CATALOG_MODEL_CREATED: "CATALOG_MODEL_CREATED",
} as const;
export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  actor?: { id: string; role?: Role } | null;
  action: AuditActionName;
  entity?: string;
  entityId?: string;
  /** Before/after values and reasons. Never passwords, tokens or full personal data. */
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Strict write: pass the transaction client so the audit row commits or rolls back
   * together with the change it describes. If it cannot be written, the change fails.
   */
  async record(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    await (tx ?? this.prisma).auditLog.create({
      data: {
        actorId: entry.actor?.id ?? null,
        actorRole: entry.actor?.role ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ip: entry.ip,
      },
    });
  }

  /** For security telemetry (failed logins) where auditing must not break the request. */
  async recordSafe(entry: AuditEntry) {
    try {
      await this.record(entry);
    } catch (err) {
      this.logger.error(`Audit write failed for ${entry.action}: ${(err as Error).message}`);
    }
  }
}
