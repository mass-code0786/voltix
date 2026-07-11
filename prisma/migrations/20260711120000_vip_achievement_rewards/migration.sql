ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'VIP_ACHIEVEMENT_REWARD';

CREATE TYPE "VipAchievementRewardStatus" AS ENUM ('PENDING', 'CREDITED', 'FAILED');

CREATE TABLE "VipAchievementReward" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "vipRank" INTEGER NOT NULL,
  "rewardAmount" DECIMAL(18,2) NOT NULL,
  "walletType" "WalletType" NOT NULL DEFAULT 'SPOT',
  "transactionId" TEXT,
  "status" "VipAchievementRewardStatus" NOT NULL DEFAULT 'PENDING',
  "uniqueReference" TEXT NOT NULL,
  "previousRank" TEXT NOT NULL,
  "newRank" TEXT NOT NULL,
  "achievedAt" TIMESTAMP(3) NOT NULL,
  "creditedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VipAchievementReward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VipAchievementReward_userId_vipRank_key" ON "VipAchievementReward"("userId", "vipRank");
CREATE UNIQUE INDEX "VipAchievementReward_uniqueReference_key" ON "VipAchievementReward"("uniqueReference");
CREATE UNIQUE INDEX "VipAchievementReward_transactionId_key" ON "VipAchievementReward"("transactionId");
CREATE INDEX "VipAchievementReward_status_achievedAt_idx" ON "VipAchievementReward"("status", "achievedAt");
ALTER TABLE "VipAchievementReward" ADD CONSTRAINT "VipAchievementReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
