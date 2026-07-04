import type { Prisma, PrismaClient } from "@prisma/client";
import { getTeamSnapshot } from "@/lib/domain/team-service";
import { getUserWalletSnapshot } from "@/lib/domain/user-wallets";
import { getUserAssetsAndTotals } from "@/lib/domain/asset-service";

type DashboardClient = Pick<PrismaClient, "asset" | "walletAccount" | "ledgerEntry" | "copyTrade" | "user" | "income" | "userPackage"> | Prisma.TransactionClient;

export async function getDashboardSnapshot(client: DashboardClient, userId: string, origin: string) {
  const [user, wallet, assets, team, incomeTotals, todaysProfit, activePackage] = await Promise.all([
    client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, uid: true, vipRank: true },
    }),
    getUserWalletSnapshot(client, userId),
    getUserAssetsAndTotals(client, userId),
    getTeamSnapshot(client, userId, origin),
    client.income.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
    client.income.aggregate({
      where: { userId, createdAt: { gte: startOfToday() } },
      _sum: { amount: true },
    }),
    client.userPackage.aggregate({
      where: { userId, status: "ACTIVE" },
      _sum: { amountUsd: true },
    }),
  ]);

  return {
    user: {
      name: user.name,
      uid: user.uid,
      vipRank: user.vipRank,
    },
    summary: {
      totalPortfolio: assets.totals.portfolio,
      todaysProfit: decimalToNumber(todaysProfit._sum.amount ?? 0),
      totalIncome: decimalToNumber(incomeTotals._sum.amount ?? 0),
      activePackageAmount: decimalToNumber(activePackage._sum.amountUsd ?? 0),
    },
    wallet,
    team,
  };
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return Number(value.toString());
}
