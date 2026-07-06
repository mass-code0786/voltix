import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const users = await prisma.user.findMany({
    where: { trades: { some: {} } },
    take: 20,
    include: {
      trades: true,
      incomes: { where: { type: "COPY_TRADE" } },
      referrals: { select: { id: true } },
    },
  });
  const traders = users.map(user => {
    const totalTrades = user.trades.length;
    const completedTrades = user.trades.filter(trade => trade.status === "COMPLETED" || trade.status === "INCOME_CREDITED");
    const principal = user.trades.reduce((sum, trade) => sum + Number(trade.principalAmount.toString()), 0);
    const totalProfit = user.incomes.reduce((sum, income) => sum + Number(income.amount.toString()), 0);
    return {
      id: user.id,
      name: user.name,
      uid: user.uid,
      vipRank: user.vipRank,
      roi: principal > 0 ? (totalProfit / principal) * 100 : 0,
      winRate: totalTrades > 0 ? (completedTrades.length / totalTrades) * 100 : 0,
      totalProfit,
      followers: user.referrals.length,
      totalTrades,
    };
  }).sort((a, b) => b.roi - a.roi).slice(0, 10);
  return NextResponse.json({ traders });
}
