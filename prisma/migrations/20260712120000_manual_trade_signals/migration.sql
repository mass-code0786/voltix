CREATE TABLE "ManualTradeSignal" (
    "id" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "windowStartAt" TIMESTAMP(3) NOT NULL,
    "windowCloseAt" TIMESTAMP(3) NOT NULL,
    "settlementDueAt" TIMESTAMP(3) NOT NULL,
    "pairs" JSONB NOT NULL,
    "recommendedPair" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManualTradeSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualTradeSignal_occurrenceKey_key" ON "ManualTradeSignal"("occurrenceKey");
CREATE INDEX "ManualTradeSignal_slotId_windowStartAt_idx" ON "ManualTradeSignal"("slotId", "windowStartAt");
