-- Secure copy-trade codes: admin-issued active codes, usage limits, and per-user replay protection.
ALTER TYPE "CodeStatus" RENAME TO "CodeStatus_old";
CREATE TYPE "CodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'DELETED');

ALTER TABLE "TradeCode"
  ADD COLUMN "status_new" "CodeStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "maxUsage" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "usedCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "TradeCode"
SET "status_new" = CASE "status"::TEXT
  WHEN 'AVAILABLE' THEN 'ACTIVE'::"CodeStatus"
  WHEN 'RESERVED' THEN 'ACTIVE'::"CodeStatus"
  WHEN 'EXPIRED' THEN 'EXPIRED'::"CodeStatus"
  WHEN 'CANCELLED' THEN 'DELETED'::"CodeStatus"
  ELSE 'INACTIVE'::"CodeStatus"
END;

UPDATE "TradeCode"
SET "usedCount" = used.count
FROM (
  SELECT "codeId", COUNT(*)::INTEGER AS count
  FROM "CopyTrade"
  GROUP BY "codeId"
) AS used
WHERE "TradeCode"."id" = used."codeId";

ALTER TABLE "TradeCode"
  DROP COLUMN "status",
  DROP COLUMN IF EXISTS "redeemedAt";

ALTER TABLE "TradeCode" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "TradeCode" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "CodeStatus_old";

DROP INDEX IF EXISTS "TradeCode_status_expiresAt_idx";
CREATE INDEX "TradeCode_status_expiresAt_idx" ON "TradeCode"("status", "expiresAt");
CREATE INDEX "TradeCode_createdBy_createdAt_idx" ON "TradeCode"("createdBy", "createdAt");

ALTER TABLE "CopyTrade" DROP CONSTRAINT IF EXISTS "CopyTrade_codeId_key";
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_userId_codeId_key" UNIQUE ("userId", "codeId");
