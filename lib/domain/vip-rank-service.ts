import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AI_ACTIVE_PRINCIPAL_THRESHOLD } from "@/lib/domain/user-activation";

const VIP_ZERO_RANK = "VIP 0";

type VipRankClient = Pick<PrismaClient, "user" | "deposit"> | Prisma.TransactionClient;

export async function refreshUserVipRank(userId: string, client: VipRankClient = prisma) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, vipRank: true, aiTradePrincipal: true },
  });
  if (!user) return null;

  const hasCreditedDeposit = await userHasCreditedDeposit(client, userId);
  const nextRank = resolveVipRank(user.vipRank, hasCreditedDeposit || user.aiTradePrincipal.gte(AI_ACTIVE_PRINCIPAL_THRESHOLD));
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
  const activeAiUsers = await client.user.findMany({
    where: { aiTradePrincipal: { gte: AI_ACTIVE_PRINCIPAL_THRESHOLD } },
    select: { id: true },
  });
  const qualifiedUserIds = Array.from(new Set([...depositedUsers.map(deposit => deposit.userId), ...activeAiUsers.map(user => user.id)]));
  if (!qualifiedUserIds.length) return { scanned: 0, updated: 0 };

  const result = await client.user.updateMany({
    where: {
      id: { in: qualifiedUserIds },
      OR: [
        { vipRank: "NONE" },
        { vipRank: "" },
        { vipRank: "VIP0" },
      ],
    },
    data: { vipRank: VIP_ZERO_RANK },
  });

  return { scanned: qualifiedUserIds.length, updated: result.count };
}

export function displayVipRank(input: { vipRank?: string | null; aiTradePrincipal?: Prisma.Decimal | number | string }, hasCreditedDeposit = false) {
  const principal = decimalFrom(input.aiTradePrincipal ?? 0);
  return resolveVipRank(input.vipRank, hasCreditedDeposit || principal.gte(AI_ACTIVE_PRINCIPAL_THRESHOLD));
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

function decimalFrom(value: Prisma.Decimal | number | string) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}
