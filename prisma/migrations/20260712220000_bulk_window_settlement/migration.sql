CREATE TYPE "TradeWindowSettlementStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

CREATE TABLE "TradeWindowSettlement" (
    "id" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "windowStartAt" TIMESTAMP(3) NOT NULL,
    "windowCloseAt" TIMESTAMP(3) NOT NULL,
    "settlementDueAt" TIMESTAMP(3) NOT NULL,
    "status" "TradeWindowSettlementStatus" NOT NULL DEFAULT 'PENDING',
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "settledTrades" INTEGER NOT NULL DEFAULT 0,
    "failedTrades" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradeWindowSettlement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "settlementKey" TEXT;

CREATE UNIQUE INDEX "TradeWindowSettlement_occurrenceKey_key" ON "TradeWindowSettlement"("occurrenceKey");
CREATE INDEX "TradeWindowSettlement_status_settlementDueAt_idx" ON "TradeWindowSettlement"("status", "settlementDueAt");
CREATE INDEX "TradeWindowSettlement_leaseExpiresAt_idx" ON "TradeWindowSettlement"("leaseExpiresAt");
CREATE UNIQUE INDEX "Notification_settlementKey_key" ON "Notification"("settlementKey");
CREATE INDEX "CopyTrade_slotId_windowStartAt_creditDueAt_status_idx"
ON "CopyTrade"("slotId", "windowStartAt", "creditDueAt", "status");
