ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NEW_DEPOSITOR_EXTRA_TRADE';

ALTER TABLE "CopyTrade" ADD COLUMN IF NOT EXISTS "promotionDay" INTEGER;

ALTER TABLE "CopyTrade"
ADD CONSTRAINT "CopyTrade_promotionDay_check"
CHECK ("promotionDay" IS NULL OR "promotionDay" BETWEEN 1 AND 10) NOT VALID;

ALTER TABLE "CopyTrade" VALIDATE CONSTRAINT "CopyTrade_promotionDay_check";

CREATE INDEX IF NOT EXISTS "CopyTrade_source_promotionDay_status_idx"
ON "CopyTrade"("source", "promotionDay", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "CopyTrade_new_depositor_user_day_key"
ON "CopyTrade"("userId", "promotionDay")
WHERE "source" = 'NEW_DEPOSITOR_EXTRA' AND "promotionDay" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "TradeSlot_new_depositor_extra_label_key"
ON "TradeSlot"("label")
WHERE "label" = 'NEW_DEPOSITOR_EXTRA_TRADE';
