CREATE TYPE "VipSalaryPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'CREDITED', 'FAILED');

ALTER TABLE "User"
  ALTER COLUMN "vipRank" SET DEFAULT 'VIP 0',
  ADD COLUMN "vipAchievedAt" TIMESTAMP(3),
  ADD COLUMN "vipUpdatedAt" TIMESTAMP(3);

UPDATE "User" SET "vipRank" = 'VIP 0' WHERE "vipRank" IS NULL OR BTRIM("vipRank") = '' OR UPPER(REPLACE("vipRank", ' ', '')) IN ('NONE', 'VIP0');

CREATE TABLE "VipSalaryPayout" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "vipRank" TEXT NOT NULL,
  "grossSalary" DECIMAL(18,2) NOT NULL,
  "payoutDate" DATE NOT NULL,
  "walletType" "WalletType" NOT NULL DEFAULT 'SPOT',
  "transactionReference" TEXT NOT NULL,
  "ledgerJournalId" TEXT,
  "status" "VipSalaryPayoutStatus" NOT NULL DEFAULT 'PENDING',
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "creditedAt" TIMESTAMP(3),
  CONSTRAINT "VipSalaryPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VipSalaryPayout_transactionReference_key" ON "VipSalaryPayout"("transactionReference");
CREATE UNIQUE INDEX "VipSalaryPayout_ledgerJournalId_key" ON "VipSalaryPayout"("ledgerJournalId");
CREATE UNIQUE INDEX "VipSalaryPayout_userId_payoutDate_key" ON "VipSalaryPayout"("userId", "payoutDate");
CREATE INDEX "VipSalaryPayout_status_payoutDate_idx" ON "VipSalaryPayout"("status", "payoutDate");
ALTER TABLE "VipSalaryPayout" ADD CONSTRAINT "VipSalaryPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
