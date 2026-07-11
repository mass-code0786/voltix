import { Prisma } from "@prisma/client";
import { postBalancedJournal } from "./ledger";
import { ensureUserWalletAccounts } from "./user-wallets";

export const VIP_ACHIEVEMENT_REWARDS = Object.freeze({
  1: "50", 2: "100", 3: "200", 4: "500", 5: "1000",
  6: "3000", 7: "5000", 8: "10000", 9: "25000", 10: "50000",
} as const);

export function vipAchievementRewardForRank(rank: number) {
  const amount = VIP_ACHIEVEMENT_REWARDS[rank as keyof typeof VIP_ACHIEVEMENT_REWARDS];
  return new Prisma.Decimal(amount ?? 0);
}

export async function creditVipAchievementRewards(tx: Prisma.TransactionClient, input: { userId: string; previousLevel: number; newLevel: number; achievedAt: Date }) {
  const credited: { vipRank: number; amount: Prisma.Decimal; reference: string }[] = [];
  if (input.newLevel <= input.previousLevel) return credited;
  const asset = await ensureUserWalletAccounts(tx, input.userId);
  const [spot, treasury] = await Promise.all([
    tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: input.userId, assetId: asset.id, type: "SPOT" } } }),
    tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
  ]);
  for (let rank = input.previousLevel + 1; rank <= input.newLevel; rank += 1) {
    const amount = vipAchievementRewardForRank(rank);
    const reference = `VIP_ACHIEVEMENT_REWARD:${input.userId}:VIP_${rank}`;
    const existing = await tx.vipAchievementReward.findUnique({ where: { userId_vipRank: { userId: input.userId, vipRank: rank } } });
    if (existing?.status === "CREDITED") continue;
    const reward = existing ?? await tx.vipAchievementReward.create({ data: { userId: input.userId, vipRank: rank, rewardAmount: amount, walletType: "SPOT", status: "PENDING", uniqueReference: reference, previousRank: `VIP ${input.previousLevel}`, newRank: `VIP ${input.newLevel}`, achievedAt: input.achievedAt } });
    const journal = await postBalancedJournal(tx, { referenceType: "VIP_ACHIEVEMENT_REWARD", referenceId: reward.id, idempotencyKey: reference, memo: `VIP ${rank} Achievement Reward`, lines: [{ accountId: treasury.id, direction: "DEBIT", amount }, { accountId: spot.id, direction: "CREDIT", amount }] });
    await tx.user.update({ where: { id: input.userId }, data: { spotBalance: { increment: amount } } });
    await tx.vipAchievementReward.update({ where: { id: reward.id }, data: { status: "CREDITED", transactionId: journal.id, creditedAt: input.achievedAt } });
    await tx.notification.create({ data: { userId: input.userId, type: "VIP_ACHIEVEMENT_REWARD", title: `VIP ${rank} achieved`, message: `Congratulations! You achieved VIP ${rank} and received a ${amount.toFixed(0)} USDT reward in your Spot Wallet.`, metadata: { vipRank: rank, rewardAmount: amount.toString(), walletType: "SPOT", reference } } });
    credited.push({ vipRank: rank, amount, reference });
  }
  return credited;
}
