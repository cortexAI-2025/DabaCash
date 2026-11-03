-- Beta hardening
--
-- 1. Refresh tokens are no longer stored in clear: sessions keep only a SHA-256 hash.
--    Existing sessions hold plaintext tokens that cannot be converted, so they are revoked:
--    every user signs in once again after this migration.
DELETE FROM "sessions";

-- DropIndex
DROP INDEX "sessions_refreshToken_key";

-- AlterTable
ALTER TABLE "buyback_requests" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "refreshToken",
ADD COLUMN     "refreshTokenHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_imeis" (
    "id" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_imeis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "blocked_imeis_imei_key" ON "blocked_imeis"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "buyback_requests_customerId_idempotencyKey_key" ON "buyback_requests"("customerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "orders_customerId_idempotencyKey_key" ON "orders"("customerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_imeis" ADD CONSTRAINT "blocked_imeis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Integrity rules enforced by the database itself, as a last line of defence
--    behind the application's validation and row locking.
ALTER TABLE "franchises"      ADD CONSTRAINT "franchises_commission_rate_range" CHECK ("commissionRate" >= 0 AND "commissionRate" <= 0.5);
ALTER TABLE "inventory"       ADD CONSTRAINT "inventory_quantity_non_negative"  CHECK ("quantity" >= 0);
ALTER TABLE "inventory"       ADD CONSTRAINT "inventory_reserved_non_negative"  CHECK ("reserved" >= 0);
ALTER TABLE "inventory"       ADD CONSTRAINT "inventory_reserved_within_stock"  CHECK ("reserved" <= "quantity");
ALTER TABLE "product_listings" ADD CONSTRAINT "listings_prices_non_negative"    CHECK ("listingPrice" >= 0 AND "buybackPrice" >= 0);
ALTER TABLE "product_listings" ADD CONSTRAINT "listings_stock_non_negative"     CHECK ("stockQuantity" >= 0);
ALTER TABLE "orders"          ADD CONSTRAINT "orders_total_non_negative"        CHECK ("totalAmount" >= 0);
ALTER TABLE "order_items"     ADD CONSTRAINT "order_items_quantity_positive"    CHECK ("quantity" > 0);
ALTER TABLE "order_items"     ADD CONSTRAINT "order_items_amounts_non_negative" CHECK ("unitPrice" >= 0 AND "totalPrice" >= 0);
ALTER TABLE "payments"        ADD CONSTRAINT "payments_amount_non_negative"     CHECK ("amount" >= 0);
ALTER TABLE "commissions"     ADD CONSTRAINT "commissions_amounts_non_negative" CHECK ("amount" >= 0 AND "saleAmount" >= 0);
ALTER TABLE "users"           ADD CONSTRAINT "users_failed_logins_non_negative" CHECK ("failedLoginCount" >= 0);
