import { randomUUID } from "crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL ?? "";
if (process.env.ALLOW_SETTLEMENT_LOAD_TEST !== "true") throw new Error("Set ALLOW_SETTLEMENT_LOAD_TEST=true to run this destructive test-data-only script");
if (process.env.NODE_ENV === "production" || (!databaseUrl.includes("localhost") && !databaseUrl.toLowerCase().includes("test"))) {
  throw new Error("Settlement load tests are restricted to localhost or a database URL containing 'test'");
}

const prisma = new PrismaClient();
const sizes = [10, 100, 1_000, 10_000];

async function main() {
  const { settleDueTradeWindows } = await import("../lib/domain/bulk-trade-settlement");
  for (const size of sizes) {
    const runId = `settlement-load-${size}-${Date.now()}`;
    const now = new Date();
    const windowStartAt = new Date(now.getTime() - 31 * 60_000);
    const windowCloseAt = new Date(windowStartAt.getTime() + 15 * 60_000);
    const settlementDueAt = new Date(windowStartAt.getTime() + 30 * 60_000);
    const slot = await prisma.tradeSlot.create({ data: { label: runId, utcTime: "00:00", durationMinutes: 15, creditDelayMins: 15 } });
    const users = Array.from({ length: size }, (_, index) => ({
      id: randomUUID(),
      email: `${runId}-${index}@load.test`,
      uid: `${size.toString(36)}${index.toString(36)}`.padStart(12, "0").slice(-12),
      name: `Load Test ${index}`,
      passwordHash: "not-a-login-account",
      extraTradeTrialEndsAt: now,
    }));
    try {
      const setupStartedAt = performance.now();
      for (let offset = 0; offset < users.length; offset += 2_000) await prisma.user.createMany({ data: users.slice(offset, offset + 2_000) });
      const trades = users.map(user => ({
        id: randomUUID(),
        userId: user.id,
        slotId: slot.id,
        source: "MANUAL",
        pair: "BTCUSDT",
        principalAmount: "10",
        returnPercent: "0.5",
        startedAt: windowStartAt,
        windowStartAt,
        windowCloseAt,
        completesAt: windowCloseAt,
        creditDueAt: settlementDueAt,
      }));
      for (let offset = 0; offset < trades.length; offset += 2_000) await prisma.copyTrade.createMany({ data: trades.slice(offset, offset + 2_000) });
      const setupMs = performance.now() - setupStartedAt;

      const explain = size === 10_000 ? await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT id FROM "CopyTrade"
        WHERE "slotId" = ${slot.id} AND "windowStartAt" = ${windowStartAt}
          AND "creditDueAt" <= ${now}
          AND status IN ('PENDING'::"TradeStatus", 'ACTIVE'::"TradeStatus", 'COMPLETED'::"TradeStatus")
        LIMIT 1000
      ` : [];

      const settlementStartedAt = performance.now();
      const first = await settleDueTradeWindows(now);
      const totalDurationMs = performance.now() - settlementStartedAt;
      const rerun = await settleDueTradeWindows(new Date());
      const [settled, incomes, notifications, journals, entries, balances] = await Promise.all([
        prisma.copyTrade.count({ where: { slotId: slot.id, status: "INCOME_CREDITED" } }),
        prisma.income.count({ where: { sourceId: { in: trades.map(trade => trade.id) }, type: "COPY_TRADE" } }),
        prisma.notification.count({ where: { settlementKey: { in: trades.map(trade => `settlement:${trade.id}`) } } }),
        prisma.ledgerJournal.count({ where: { referenceId: { in: trades.map(trade => trade.id) }, referenceType: { in: ["COPY_TRADE_PRINCIPAL_RETURN", "COPY_TRADE_INCOME"] } } }),
        prisma.ledgerEntry.count({ where: { journal: { referenceId: { in: trades.map(trade => trade.id) }, referenceType: { in: ["COPY_TRADE_PRINCIPAL_RETURN", "COPY_TRADE_INCOME"] } } } }),
        prisma.user.aggregate({ where: { id: { in: users.map(user => user.id) } }, _sum: { aiWalletBalance: true, aiTradeProfitEarned: true } }),
      ]);
      const expectedPrincipal = size * 10;
      const expectedProfit = size * 5;
      const duplicateCreditCount = Math.max(0, journals - size * 2) + Math.max(0, incomes - size);
      const valid = settled === size && incomes === size && notifications === size && journals === size * 2 && entries === size * 4
        && Number(balances._sum.aiWalletBalance) === expectedPrincipal + expectedProfit
        && Number(balances._sum.aiTradeProfitEarned) === expectedProfit
        && rerun.totalSettled === 0 && duplicateCreditCount === 0;
      console.info("[SETTLEMENT_LOAD_TEST]", {
        users: size,
        dueTradesFound: first.summaries.reduce((sum, row) => sum + row.totalEligible, 0),
        claimedTrades: first.summaries.reduce((sum, row) => sum + row.totalClaimed, 0),
        settledTrades: settled,
        failedCount: first.totalFailed,
        batches: first.summaries.reduce((sum, row) => sum + row.batches, 0),
        financialBatchDurationMs: first.summaries.reduce((sum, row) => sum + row.financialBatchDurationMs, 0),
        setupMs: Math.round(setupMs),
        totalSettlementDurationMs: Math.round(totalDurationMs),
        throughputPerSecond: Math.round((settled * 1000) / Math.max(totalDurationMs, 1)),
        ledgerEntries: entries,
        walletTotal: balances._sum.aiWalletBalance?.toString(),
        profitTotal: balances._sum.aiTradeProfitEarned?.toString(),
        duplicateCreditCount,
        rerunSettled: rerun.totalSettled,
        databaseBehavior: "bounded transactions; FOR UPDATE SKIP LOCKED; aggregate user updates",
        explainAnalyze: explain[0]?.["QUERY PLAN"] ?? null,
        valid,
      });
      if (!valid) throw new Error(`Load-test invariants failed for ${size} trades`);
    } finally {
      await cleanup(slot.id, users.map(user => user.id));
    }
  }
}

async function cleanup(slotId: string, userIds: string[]) {
  const trades = await prisma.copyTrade.findMany({ where: { slotId }, select: { id: true } });
  const tradeIds = trades.map(trade => trade.id);
  const journals = await prisma.ledgerJournal.findMany({ where: { referenceId: { in: tradeIds } }, select: { id: true } });
  await prisma.$transaction(async tx => {
    await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
    await tx.income.deleteMany({ where: { sourceId: { in: tradeIds } } });
    await tx.ledgerEntry.deleteMany({ where: { journalId: { in: journals.map(row => row.id) } } });
    await tx.ledgerJournal.deleteMany({ where: { id: { in: journals.map(row => row.id) } } });
    await tx.tradeWindowSettlement.deleteMany({ where: { slotId } });
    await tx.copyTrade.deleteMany({ where: { slotId } });
    await tx.walletAccount.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.tradeSlot.delete({ where: { id: slotId } });
  }, { timeout: 120_000 });
}

main().finally(() => prisma.$disconnect());
