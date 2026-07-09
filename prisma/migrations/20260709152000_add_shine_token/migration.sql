CREATE TABLE IF NOT EXISTS "AssetConversion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromAssetId" TEXT NOT NULL,
  "toAssetId" TEXT NOT NULL,
  "fromSymbol" TEXT NOT NULL,
  "toSymbol" TEXT NOT NULL,
  "fromAmount" DECIMAL(36,18) NOT NULL,
  "toAmount" DECIMAL(36,18) NOT NULL,
  "price" DECIMAL(36,18) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "usdtLedgerJournalId" TEXT,
  "shineLedgerJournalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetConversion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetConversion_idempotencyKey_key" ON "AssetConversion"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AssetConversion_usdtLedgerJournalId_key" ON "AssetConversion"("usdtLedgerJournalId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssetConversion_shineLedgerJournalId_key" ON "AssetConversion"("shineLedgerJournalId");
CREATE INDEX IF NOT EXISTS "AssetConversion_userId_createdAt_idx" ON "AssetConversion"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AssetConversion_fromSymbol_toSymbol_createdAt_idx" ON "AssetConversion"("fromSymbol", "toSymbol", "createdAt");

INSERT INTO "Asset" ("id", "symbol", "name", "decimals", "enabled")
SELECT 'asset_shine', 'SHINE', 'SHINE TOKEN', 18, true
WHERE NOT EXISTS (SELECT 1 FROM "Asset" WHERE "symbol" = 'SHINE');

INSERT INTO "CoinMetadata" ("id", "symbol", "name", "pair", "logoUrl", "localLogoPath", "isActive", "displayOrder", "createdAt", "updatedAt")
SELECT 'coin_shine', 'SHINE', 'SHINE TOKEN', 'SHINEUSDT', 'https://assets.coincap.io/assets/icons/shine@2x.png', '/coin-logos/shine.svg', true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CoinMetadata" WHERE "symbol" = 'SHINE');

UPDATE "CoinMetadata"
SET "name" = 'SHINE TOKEN',
    "pair" = 'SHINEUSDT',
    "localLogoPath" = '/coin-logos/shine.svg',
    "isActive" = true,
    "displayOrder" = 5,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "symbol" = 'SHINE';

INSERT INTO "ChainNetwork" ("id", "key", "name", "requiredConfirmations", "enabled")
SELECT 'network_solana', 'solana', 'Solana', 32, true
WHERE NOT EXISTS (SELECT 1 FROM "ChainNetwork" WHERE "key" = 'solana');

INSERT INTO "WalletAccount" ("id", "userId", "assetId", "type", "createdAt")
SELECT 'wallet_shine_fee', NULL, "id", 'FEE', CURRENT_TIMESTAMP
FROM "Asset"
WHERE "symbol" = 'SHINE'
  AND NOT EXISTS (
    SELECT 1 FROM "WalletAccount"
    WHERE "userId" IS NULL AND "assetId" = "Asset"."id" AND "type" = 'FEE'
  );
