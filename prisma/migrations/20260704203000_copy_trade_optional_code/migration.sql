DROP INDEX IF EXISTS "CopyTrade_userId_codeId_key";

ALTER TABLE "CopyTrade" DROP CONSTRAINT IF EXISTS "CopyTrade_codeId_fkey";
ALTER TABLE "CopyTrade" ALTER COLUMN "codeId" DROP NOT NULL;
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "TradeCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "CopyTrade_codeId_idx" ON "CopyTrade"("codeId");
