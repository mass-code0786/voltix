CREATE TABLE "AiSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ledgerJournalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiSubscription_ledgerJournalId_key" ON "AiSubscription"("ledgerJournalId");
CREATE INDEX "AiSubscription_userId_active_expiresAt_idx" ON "AiSubscription"("userId", "active", "expiresAt");
CREATE INDEX "AiSubscription_expiresAt_idx" ON "AiSubscription"("expiresAt");

ALTER TABLE "AiSubscription" ADD CONSTRAINT "AiSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiSubscription" ADD CONSTRAINT "AiSubscription_ledgerJournalId_fkey" FOREIGN KEY ("ledgerJournalId") REFERENCES "LedgerJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
