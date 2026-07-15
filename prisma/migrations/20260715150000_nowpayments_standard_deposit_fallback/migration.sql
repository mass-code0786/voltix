CREATE TYPE "DepositAddressMode" AS ENUM ('PERMANENT', 'PER_PAYMENT');

ALTER TABLE "Deposit"
  ADD COLUMN "addressMode" "DepositAddressMode" NOT NULL DEFAULT 'PERMANENT',
  ADD COLUMN "providerOrderId" TEXT,
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "priceCurrency" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Deposit_providerOrderId_key" ON "Deposit"("providerOrderId");
CREATE UNIQUE INDEX "Deposit_clientRequestId_key" ON "Deposit"("clientRequestId");
