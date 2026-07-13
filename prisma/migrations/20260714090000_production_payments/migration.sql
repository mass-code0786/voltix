ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'FAILED';

CREATE TABLE "PaymentProviderCustomer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "DepositProvider" NOT NULL DEFAULT 'NOWPAYMENTS',
  "providerCustomerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentProviderCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DepositAddress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "networkId" TEXT NOT NULL,
  "provider" "DepositProvider" NOT NULL DEFAULT 'NOWPAYMENTS',
  "providerCustomerId" TEXT NOT NULL,
  "providerPaymentId" TEXT NOT NULL,
  "payCurrency" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepositAddress_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Deposit"
  ADD COLUMN "depositAddressId" TEXT,
  ADD COLUMN "parentPaymentId" TEXT;

ALTER TABLE "Withdrawal"
  ADD COLUMN "requestJournalId" TEXT,
  ADD COLUMN "decisionJournalId" TEXT,
  ADD COLUMN "providerPayoutId" TEXT,
  ADD COLUMN "providerBatchId" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerResponse" JSONB,
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "processingAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "PaymentProviderCustomer_userId_key" ON "PaymentProviderCustomer"("userId");
CREATE UNIQUE INDEX "PaymentProviderCustomer_providerCustomerId_key" ON "PaymentProviderCustomer"("providerCustomerId");
CREATE UNIQUE INDEX "DepositAddress_providerPaymentId_key" ON "DepositAddress"("providerPaymentId");
CREATE UNIQUE INDEX "DepositAddress_userId_assetId_networkId_key" ON "DepositAddress"("userId", "assetId", "networkId");
CREATE UNIQUE INDEX "DepositAddress_networkId_address_key" ON "DepositAddress"("networkId", "address");
CREATE INDEX "DepositAddress_providerCustomerId_idx" ON "DepositAddress"("providerCustomerId");
CREATE INDEX "Deposit_depositAddressId_createdAt_idx" ON "Deposit"("depositAddressId", "createdAt");
CREATE INDEX "Deposit_parentPaymentId_idx" ON "Deposit"("parentPaymentId");
CREATE UNIQUE INDEX "Withdrawal_requestJournalId_key" ON "Withdrawal"("requestJournalId");
CREATE UNIQUE INDEX "Withdrawal_decisionJournalId_key" ON "Withdrawal"("decisionJournalId");
CREATE UNIQUE INDEX "Withdrawal_providerPayoutId_key" ON "Withdrawal"("providerPayoutId");

ALTER TABLE "PaymentProviderCustomer" ADD CONSTRAINT "PaymentProviderCustomer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "ChainNetwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_depositAddressId_fkey" FOREIGN KEY ("depositAddressId") REFERENCES "DepositAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
