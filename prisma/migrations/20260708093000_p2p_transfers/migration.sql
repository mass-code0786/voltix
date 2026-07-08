ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'P2P_TRANSFER';

CREATE TABLE "P2PTransfer" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "note" TEXT,
    "status" "WalletTransferStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "ledgerJournalId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "P2PTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "P2PTransfer_idempotencyKey_key" ON "P2PTransfer"("idempotencyKey");
CREATE UNIQUE INDEX "P2PTransfer_ledgerJournalId_key" ON "P2PTransfer"("ledgerJournalId");
CREATE INDEX "P2PTransfer_senderId_createdAt_idx" ON "P2PTransfer"("senderId", "createdAt");
CREATE INDEX "P2PTransfer_receiverId_createdAt_idx" ON "P2PTransfer"("receiverId", "createdAt");
CREATE INDEX "P2PTransfer_status_createdAt_idx" ON "P2PTransfer"("status", "createdAt");

ALTER TABLE "P2PTransfer" ADD CONSTRAINT "P2PTransfer_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P2PTransfer" ADD CONSTRAINT "P2PTransfer_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "P2PTransfer" ADD CONSTRAINT "P2PTransfer_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
