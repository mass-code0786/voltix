import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const [activeSubscriptions, dueTrades, latestIncome, latestTrade, latestAutoTradeRun] = await Promise.all([
    prisma.aiSubscription.count({ where: { active: true, expiresAt: { gt: new Date() } } }),
    prisma.copyTrade.count({ where: { status: { in: ["PENDING", "ACTIVE", "COMPLETED"] }, creditDueAt: { lte: new Date() } } }),
    prisma.income.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.copyTrade.findFirst({ orderBy: { updatedAt: "desc" } }),
    prisma.auditLog.findFirst({
      where: { action: "AI_AUTO_TRADE_SCHEDULER_COMPLETE" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, metadata: true },
    }),
  ]);
  const autoTradeMetadata = isRecord(latestAutoTradeRun?.metadata) ? latestAutoTradeRun.metadata : {};
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.VOLTIX_SCHEDULER_SECRET),
    activeSubscriptions,
    dueTrades,
    autoTrade: {
      lastRunAt: latestAutoTradeRun?.createdAt.toISOString() ?? null,
      usersScanned: numberFromMetadata(autoTradeMetadata.usersScanned),
      tradesPlacedThisCycle: numberFromMetadata(autoTradeMetadata.tradesPlacedThisCycle),
      aiTradesAlreadyExecutedThisWindow: numberFromMetadata(autoTradeMetadata.aiTradesAlreadyExecutedThisWindow),
      manualTradesAlreadyPlacedThisWindow: numberFromMetadata(autoTradeMetadata.manualTradesAlreadyPlacedThisWindow),
      totalTradesForWindow: numberFromMetadata(autoTradeMetadata.totalTradesForWindow),
      skipped: Array.isArray(autoTradeMetadata.skipped) ? autoTradeMetadata.skipped : [],
      errors: Array.isArray(autoTradeMetadata.errors) ? autoTradeMetadata.errors : [],
    },
    latestIncomeAt: latestIncome?.createdAt.toISOString() ?? null,
    latestTradeUpdateAt: latestTrade?.updatedAt.toISOString() ?? null,
    checkedAt: new Date().toISOString(),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberFromMetadata(value: unknown) {
  return typeof value === "number" ? value : 0;
}
