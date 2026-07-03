-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('SPOT', 'FUTURES', 'BITEX', 'FEE');

-- CreateEnum
CREATE TYPE "WalletTransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('PENDING', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'CREDITED', 'FAILED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'COMPLETED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'INCOME_CREDITED', 'FAILED');

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('DIRECT', 'LEVEL', 'MATCHING', 'COPY_TRADE', 'BONUS');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "uid" VARCHAR(12) NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'United States',
    "passwordHash" TEXT NOT NULL,
    "vipRank" TEXT NOT NULL DEFAULT 'NONE',
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "referredById" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extraTradeTrialEndsAt" TIMESTAMP(3) NOT NULL,
    "permanentExtraTrade" BOOLEAN NOT NULL DEFAULT false,
    "spotBalance" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "futuresBalance" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "bitexBalance" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "bitexPrincipal" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "bitexIncomeEarned" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "bitexTargetAmount" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "bitexUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromWallet" "WalletType" NOT NULL,
    "toWallet" "WalletType" NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "feeAmount" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL(36,18) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "WalletTransferStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "ledgerJournalId" TEXT,
    "failureReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinMetadata" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "logoUrl" TEXT,
    "localLogoPath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 9999,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "assetId" TEXT NOT NULL,
    "type" "WalletType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerJournal" (
    "id" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "status" "JournalStatus" NOT NULL DEFAULT 'PENDING',
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainNetwork" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredConfirmations" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChainNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "derivationIndex" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL DEFAULT 0,
    "amount" DECIMAL(36,18) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "DepositStatus" NOT NULL DEFAULT 'DETECTED',
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "walletType" "WalletType" NOT NULL,
    "address" TEXT NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "feeAmount" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "receivableAmount" DECIMAL(36,18) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "ledgerJournalId" TEXT,
    "txHash" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "adminActionBy" TEXT,
    "adminActionAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlmPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "packageAmountUsd" DECIMAL(18,2) NOT NULL,
    "directPercent" DECIMAL(5,2) NOT NULL,
    "matchingPercent" DECIMAL(5,2) NOT NULL,
    "levelPercents" JSONB NOT NULL,
    "minQualifiedDirectUsd" DECIMAL(18,2) NOT NULL DEFAULT 50,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MlmPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPackage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amountUsd" DECIMAL(18,2) NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "UserPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeSlot" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "utcTime" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 20,
    "creditDelayMins" INTEGER NOT NULL DEFAULT 10,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TradeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeCode" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "returnPercent" DECIMAL(5,2) NOT NULL,
    "assignedUserId" TEXT,
    "slotId" TEXT,
    "status" "CodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "maxUsage" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyTrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "principalAmount" DECIMAL(36,18) NOT NULL,
    "returnPercent" DECIMAL(5,2) NOT NULL,
    "incomeAmount" DECIMAL(36,18),
    "status" "TradeStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completesAt" TIMESTAMP(3) NOT NULL,
    "creditDueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "incomeCreditedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "IncomeType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DECIMAL(36,18) NOT NULL,
    "copyTradeId" TEXT,
    "ledgerJournalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");

-- CreateIndex
CREATE INDEX "User_referredById_idx" ON "User"("referredById");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransfer_idempotencyKey_key" ON "WalletTransfer"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransfer_ledgerJournalId_key" ON "WalletTransfer"("ledgerJournalId");

-- CreateIndex
CREATE INDEX "WalletTransfer_userId_createdAt_idx" ON "WalletTransfer"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransfer_status_createdAt_idx" ON "WalletTransfer"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_symbol_key" ON "Asset"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "CoinMetadata_symbol_key" ON "CoinMetadata"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "CoinMetadata_pair_key" ON "CoinMetadata"("pair");

-- CreateIndex
CREATE INDEX "CoinMetadata_isActive_displayOrder_idx" ON "CoinMetadata"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "WalletAccount_assetId_type_idx" ON "WalletAccount"("assetId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_userId_assetId_type_key" ON "WalletAccount"("userId", "assetId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerJournal_idempotencyKey_key" ON "LedgerJournal"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerJournal_referenceType_referenceId_key" ON "LedgerJournal"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_createdAt_idx" ON "LedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChainNetwork_key_key" ON "ChainNetwork"("key");

-- CreateIndex
CREATE INDEX "DepositAddress_userId_assetId_idx" ON "DepositAddress"("userId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_networkId_address_key" ON "DepositAddress"("networkId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_networkId_derivationIndex_key" ON "DepositAddress"("networkId", "derivationIndex");

-- CreateIndex
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_networkId_txHash_eventIndex_key" ON "Deposit"("networkId", "txHash", "eventIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_idempotencyKey_key" ON "Withdrawal"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_ledgerJournalId_key" ON "Withdrawal"("ledgerJournalId");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MlmPlan_name_version_key" ON "MlmPlan"("name", "version");

-- CreateIndex
CREATE INDEX "UserPackage_userId_status_idx" ON "UserPackage"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCode_code_key" ON "TradeCode"("code");

-- CreateIndex
CREATE INDEX "TradeCode_status_expiresAt_idx" ON "TradeCode"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TradeCode_createdBy_createdAt_idx" ON "TradeCode"("createdBy", "createdAt");

-- CreateIndex
CREATE INDEX "CopyTrade_status_completesAt_idx" ON "CopyTrade"("status", "completesAt");

-- CreateIndex
CREATE INDEX "CopyTrade_status_creditDueAt_idx" ON "CopyTrade"("status", "creditDueAt");

-- CreateIndex
CREATE INDEX "CopyTrade_userId_startedAt_idx" ON "CopyTrade"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CopyTrade_userId_codeId_key" ON "CopyTrade"("userId", "codeId");

-- CreateIndex
CREATE UNIQUE INDEX "Income_copyTradeId_key" ON "Income"("copyTradeId");

-- CreateIndex
CREATE UNIQUE INDEX "Income_ledgerJournalId_key" ON "Income"("ledgerJournalId");

-- CreateIndex
CREATE INDEX "Income_userId_createdAt_idx" ON "Income"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Income_userId_type_sourceType_sourceId_key" ON "Income"("userId", "type", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransfer" ADD CONSTRAINT "WalletTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "LedgerJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "ChainNetwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "ChainNetwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "DepositAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "ChainNetwork"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPackage" ADD CONSTRAINT "UserPackage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MlmPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeCode" ADD CONSTRAINT "TradeCode_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeCode" ADD CONSTRAINT "TradeCode_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TradeSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "TradeCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TradeSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_copyTradeId_fkey" FOREIGN KEY ("copyTradeId") REFERENCES "CopyTrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

