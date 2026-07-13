ALTER TABLE "CopyTrade"
ADD COLUMN IF NOT EXISTS "walletSnapshotAtTrade" DECIMAL(36,18),
ADD COLUMN IF NOT EXISTS "selectedRate" DECIMAL(10,6),
ADD COLUMN IF NOT EXISTS "calculatedProfit" DECIMAL(36,18);

UPDATE "CopyTrade"
SET
  "walletSnapshotAtTrade" = "principalAmount" / 0.01,
  "selectedRate" = "returnPercent",
  "calculatedProfit" = CASE
    WHEN "incomeCreditedAt" IS NOT NULL AND "incomeAmount" IS NOT NULL THEN "incomeAmount"
    ELSE ("principalAmount" / 0.01) * "returnPercent" / 100
  END
WHERE "source" = 'NEW_DEPOSITOR_EXTRA'
  AND (
    "walletSnapshotAtTrade" IS NULL
    OR "selectedRate" IS NULL
    OR "calculatedProfit" IS NULL
  );

ALTER TABLE "CopyTrade"
ADD CONSTRAINT "CopyTrade_promotion_profit_snapshot_check"
CHECK (
  "source" <> 'NEW_DEPOSITOR_EXTRA'
  OR (
    "walletSnapshotAtTrade" IS NOT NULL
    AND "walletSnapshotAtTrade" > 0
    AND "selectedRate" IS NOT NULL
    AND "selectedRate" BETWEEN 0.32 AND 0.36
    AND "calculatedProfit" IS NOT NULL
    AND "calculatedProfit" >= 0
  )
) NOT VALID;

ALTER TABLE "CopyTrade" VALIDATE CONSTRAINT "CopyTrade_promotion_profit_snapshot_check";
