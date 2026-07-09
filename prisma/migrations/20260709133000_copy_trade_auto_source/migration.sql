ALTER TABLE "CopyTrade"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "CopyTrade_idempotencyKey_key" ON "CopyTrade"("idempotencyKey");
CREATE INDEX "CopyTrade_source_startedAt_idx" ON "CopyTrade"("source", "startedAt");

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AI_AUTO_TRADE';
