ALTER TABLE "CopyTrade"
  ADD COLUMN "signalId" TEXT,
  ADD COLUMN "occurrenceKey" TEXT;

CREATE INDEX "CopyTrade_signalId_idx" ON "CopyTrade"("signalId");
CREATE INDEX "CopyTrade_occurrenceKey_idx" ON "CopyTrade"("occurrenceKey");
