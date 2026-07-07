ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ADMIN_WALLET_ADJUSTMENT';

CREATE TABLE "AdminWalletAdjustment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "walletType" "WalletType" NOT NULL,
  "action" TEXT NOT NULL,
  "amount" DECIMAL(36,18) NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUCCESS',
  "ledgerJournalId" TEXT,
  "depositId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminWalletAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminWalletAdjustment_idempotencyKey_key" ON "AdminWalletAdjustment"("idempotencyKey");
CREATE UNIQUE INDEX "AdminWalletAdjustment_ledgerJournalId_key" ON "AdminWalletAdjustment"("ledgerJournalId");
CREATE INDEX "AdminWalletAdjustment_userId_createdAt_idx" ON "AdminWalletAdjustment"("userId", "createdAt");
CREATE INDEX "AdminWalletAdjustment_adminId_createdAt_idx" ON "AdminWalletAdjustment"("adminId", "createdAt");
CREATE INDEX "AdminWalletAdjustment_action_createdAt_idx" ON "AdminWalletAdjustment"("action", "createdAt");

ALTER TABLE "AdminWalletAdjustment" ADD CONSTRAINT "AdminWalletAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminWalletAdjustment" ADD CONSTRAINT "AdminWalletAdjustment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminWalletAdjustment" ADD CONSTRAINT "AdminWalletAdjustment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
