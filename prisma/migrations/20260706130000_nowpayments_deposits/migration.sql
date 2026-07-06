CREATE TYPE "DepositProvider" AS ENUM ('NOWPAYMENTS');

ALTER TYPE "DepositStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "Deposit" DROP CONSTRAINT IF EXISTS "Deposit_addressId_fkey";

ALTER TABLE "Deposit"
  DROP COLUMN IF EXISTS "addressId",
  ADD COLUMN "provider" "DepositProvider" NOT NULL DEFAULT 'NOWPAYMENTS',
  ADD COLUMN "providerPaymentId" TEXT,
  ADD COLUMN "providerInvoiceId" TEXT,
  ADD COLUMN "providerPaymentUrl" TEXT,
  ADD COLUMN "payCurrency" TEXT,
  ADD COLUMN "payAddress" TEXT,
  ADD COLUMN "paymentStatus" TEXT,
  ADD COLUMN "actuallyPaid" DECIMAL(36,18),
  ADD COLUMN "outcomeAmount" DECIMAL(36,18),
  ADD COLUMN "rawWebhookJson" JSONB,
  ADD COLUMN "webhookReceivedAt" TIMESTAMP(3);

DROP TABLE IF EXISTS "DepositAddress";

CREATE UNIQUE INDEX "Deposit_providerPaymentId_key" ON "Deposit"("providerPaymentId");
CREATE UNIQUE INDEX "Deposit_providerInvoiceId_key" ON "Deposit"("providerInvoiceId");
CREATE INDEX "Deposit_provider_paymentStatus_createdAt_idx" ON "Deposit"("provider", "paymentStatus", "createdAt");
