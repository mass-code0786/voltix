import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardSnapshot } from "@/lib/domain/dashboard-service";
import { refreshUserVipRank } from "@/lib/domain/vip-rank-service";
import { prisma } from "@/lib/prisma";

const emptyDashboard = {
  user: {
    name: null,
    uid: null,
    vipRank: null,
  },
  summary: {
    totalPortfolio: 0,
    todaysProfit: 0,
    totalIncome: 0,
    aiCopyTradingIncome: 0,
    activePackageAmount: 0,
  },
  wallet: {
    balances: {
      spot: 0,
      funding: 0,
      futures: 0,
      aiWallet: 0,
    },
    aiWallet: {
      principal: 0,
      incomeEarned: 0,
      targetAmount: 0,
      unlocked: false,
    },
    accounts: [],
  },
  team: {
    referralUid: null,
    referralLink: null,
    stats: {
      directTeamCount: 0,
      totalNetworkCount: 0,
      activeUsersCount: 0,
      teamVolume: 0,
    },
    members: [],
  },
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, dashboard: emptyDashboard }, { status: 401 });
  }

  await refreshUserVipRank(user.id);
  const origin = new URL(request.url).origin;
  const dashboard = await getDashboardSnapshot(prisma, user.id, origin);
  return NextResponse.json({ authenticated: true, userId: user.id, dashboard });
}
