ALTER TABLE "CopyTrade"
ADD COLUMN IF NOT EXISTS "windowStartAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "windowCloseAt" TIMESTAMP(3);

UPDATE "CopyTrade"
SET "windowStartAt" = COALESCE("windowStartAt", "startedAt"),
    "windowCloseAt" = COALESCE("windowCloseAt", "completesAt");

CREATE INDEX IF NOT EXISTS "CopyTrade_userId_slotId_windowStartAt_windowCloseAt_idx"
ON "CopyTrade"("userId", "slotId", "windowStartAt", "windowCloseAt");

UPDATE "TradeSlot"
SET "durationMinutes" = 15,
    "creditDelayMins" = 15,
    "enabled" = true
WHERE "label" IN ('Window 1', 'Window 2', 'Window 3');

UPDATE "TradeSlot"
SET "utcTime" = '14:30'
WHERE "label" = 'Window 3';
