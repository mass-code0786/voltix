import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const [activeSubscriptions, dueTrades, latestIncome, latestTrade] = await Promise.all([
    prisma.aiSubscription.count({ where: { active: true, expiresAt: { gt: new Date() } } }),
    prisma.copyTrade.count({ where: { status: { in: ["PENDING", "ACTIVE", "COMPLETED"] }, creditDueAt: { lte: new Date() } } }),
    prisma.income.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.copyTrade.findFirst({ orderBy: { updatedAt: "desc" } }),
  ]);
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.VOLTIX_SCHEDULER_SECRET),
    activeSubscriptions,
    dueTrades,
    latestIncomeAt: latestIncome?.createdAt.toISOString() ?? null,
    latestTradeUpdateAt: latestTrade?.updatedAt.toISOString() ?? null,
    checkedAt: new Date().toISOString(),
  });
}
