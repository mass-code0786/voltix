-- Update withdrawal lifecycle for Spot instant payouts and Bitex manual approvals.
ALTER TYPE "WithdrawalStatus" RENAME TO "WithdrawalStatus_old";
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'COMPLETED', 'APPROVED', 'REJECTED');

ALTER TABLE "Withdrawal"
  ADD COLUMN "walletType" "WalletType" NOT NULL DEFAULT 'SPOT',
  ADD COLUMN "address" TEXT,
  ADD COLUMN "feeAmount" DECIMAL(36, 18),
  ADD COLUMN "receivableAmount" DECIMAL(36, 18),
  ADD COLUMN "status_new" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "adminActionBy" TEXT,
  ADD COLUMN "adminActionAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

UPDATE "Withdrawal"
SET
  "address" = "toAddress",
  "feeAmount" = "fee",
  "receivableAmount" = "receivedAmount",
  "status_new" = CASE "status"::TEXT
    WHEN 'REJECTED' THEN 'REJECTED'::"WithdrawalStatus"
    WHEN 'APPROVED' THEN 'APPROVED'::"WithdrawalStatus"
    WHEN 'CONFIRMED' THEN 'COMPLETED'::"WithdrawalStatus"
    ELSE 'PENDING'::"WithdrawalStatus"
  END;

ALTER TABLE "Withdrawal"
  ALTER COLUMN "address" SET NOT NULL,
  ALTER COLUMN "feeAmount" SET NOT NULL,
  ALTER COLUMN "receivableAmount" SET NOT NULL,
  DROP COLUMN "toAddress",
  DROP COLUMN "fixedFee",
  DROP COLUMN "percentageFee",
  DROP COLUMN "fee",
  DROP COLUMN "receivedAmount",
  DROP COLUMN "status";

ALTER TABLE "Withdrawal" RENAME COLUMN "status_new" TO "status";

ALTER TABLE "Withdrawal" ALTER COLUMN "walletType" DROP DEFAULT;
ALTER TABLE "Withdrawal" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "WithdrawalStatus_old";
