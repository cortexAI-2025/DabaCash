-- CreateEnum
CREATE TYPE "FraudResolution" AS ENUM ('CLEARED', 'CONFIRMED_FRAUD');

-- AlterTable
ALTER TABLE "buyback_requests" ADD COLUMN     "fraudNote" TEXT,
ADD COLUMN     "fraudReasons" JSONB,
ADD COLUMN     "fraudResolution" "FraudResolution",
ADD COLUMN     "fraudReviewedAt" TIMESTAMP(3),
ADD COLUMN     "fraudReviewedById" TEXT;

-- CreateIndex
CREATE INDEX "buyback_requests_isFlagged_fraudResolution_idx" ON "buyback_requests"("isFlagged", "fraudResolution");

-- CreateIndex
CREATE INDEX "buyback_requests_imei_idx" ON "buyback_requests"("imei");

-- AddForeignKey
ALTER TABLE "buyback_requests" ADD CONSTRAINT "buyback_requests_fraudReviewedById_fkey" FOREIGN KEY ("fraudReviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

