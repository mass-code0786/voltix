import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const VIP_ZERO_RANK = "VIP 0";

type VipRankClient = Pick<PrismaClient, "user" | "deposit"> | Prisma.TransactionClient;

export async function refreshUserVipRank(userId: string, client: VipRankClient = prisma) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, vipRank: true },
  });
  if (!user) return null;

  const hasCreditedDeposit = await userHasCreditedDeposit(client, userId);
  const nextRank = resolveVipRank(user.vipRank, hasCreditedDeposit);
  if (nextRank === user.vipRank) return user;

  return client.user.update({
    where: { id: userId },
    data: { vipRank: nextRank },
    select: { id: true, vipRank: true },
  });
}

export async function backfillVipZeroForDepositedUsers(client: VipRankClient = prisma) {
  const depositedUsers = await client.deposit.findMany({
    where: creditedDepositWhere(),
    distinct: ["userId"],
    select: { userId: true },
  });
  if (!depositedUsers.length) return { scanned: 0, updated: 0 };

  const result = await client.user.updateMany({
    where: {
      id: { in: depositedUsers.map(deposit => deposit.userId) },
      OR: [
        { vipRank: "NONE" },
        { vipRank: "" },
        { vipRank: "VIP0" },
      ],
    },
    data: { vipRank: VIP_ZERO_RANK },
  });

  return { scanned: depositedUsers.length, updated: result.count };
}

export function creditedDepositWhere(): Prisma.DepositWhereInput {
  return {
    OR: [
      { status: "CREDITED" },
      { status: "APPROVED", creditedAt: { not: null } },
    ],
  };
}

async function userHasCreditedDeposit(client: VipRankClient, userId: string) {
  const deposit = await client.deposit.findFirst({
    where: { userId, ...creditedDepositWhere() },
    select: { id: true },
  });
  return Boolean(deposit);
}

function resolveVipRank(currentRank: string | null | undefined, hasCreditedDeposit: boolean) {
  const rank = currentRank?.trim() ?? "NONE";
  if (!hasCreditedDeposit) return rank || "NONE";
  if (!rank || rank.toUpperCase() === "NONE" || rank.toUpperCase().replace(/\s+/g, "") === "VIP0") return VIP_ZERO_RANK;
  return rank;
}
