CREATE TABLE "ExternalWalletBinding" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "walletName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalWalletBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalWalletBinding_userId_network_key" ON "ExternalWalletBinding"("userId", "network");
CREATE INDEX "ExternalWalletBinding_userId_createdAt_idx" ON "ExternalWalletBinding"("userId", "createdAt");

ALTER TABLE "ExternalWalletBinding"
  ADD CONSTRAINT "ExternalWalletBinding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
