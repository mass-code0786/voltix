import type { IncomeType, Prisma, PrismaClient } from "@prisma/client";
import { getTeamSnapshot } from "@/lib/domain/team-service";
import { getUserWalletSnapshot } from "@/lib/domain/user-wallets";
import { getUserAssetsAndTotals } from "@/lib/domain/asset-service";

type DashboardClient = Pick<PrismaClient, "asset" | "walletAccount" | "ledgerEntry" | "copyTrade" | "user" | "income" | "userPackage"> | Prisma.TransactionClient;
const aiCopyTradeIncomeTypes: IncomeType[] = ["COPY_TRADE"];

export async function getDashboardSnapshot(client: DashboardClient, userId: string, origin: string) {
  const [user, wallet, assets, team, incomeTotals, aiCopyTradingIncome, activePackage] = await Promise.all([
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
      where: { userId, type: { in: aiCopyTradeIncomeTypes } },
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
      totalPortfolio: assets.walletSummary.totalBalanceUsd,
      todaysProfit: assets.walletSummary.todayIncome,
      totalIncome: decimalToNumber(incomeTotals._sum?.amount ?? 0),
      aiCopyTradingIncome: decimalToNumber(aiCopyTradingIncome._sum?.amount ?? 0),
      activePackageAmount: decimalToNumber(activePackage._sum.amountUsd ?? 0),
    },
    wallet,
    team,
  };
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return Number(value.toString());
}
