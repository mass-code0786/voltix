import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const [{ prisma }, { runAiAutoTradeScheduler }, { tradeWindowSignalOccurrenceKey }] = await Promise.all([
    import("../lib/prisma"),
    import("../lib/domain/trade-service"),
    import("../lib/domain/trade-window-signal"),
  ]);
  const startArgument = process.argv.find(value => /^\d{4}-\d{2}-\d{2}T/.test(value));
  if (!startArgument) throw new Error("Usage: npm run ai-window:inspect -- <windowStartAt ISO> [userId] [--rerun-live]");
  const windowStartAt = new Date(startArgument);
  if (Number.isNaN(windowStartAt.getTime())) throw new Error("Invalid windowStartAt");
  const userId = process.argv.find(value => value !== startArgument && !value.startsWith("--") && value !== process.argv[0] && value !== process.argv[1]);
  const utcTime = `${windowStartAt.getUTCHours().toString().padStart(2, "0")}:${windowStartAt.getUTCMinutes().toString().padStart(2, "0")}`;
  const slot = await prisma.tradeSlot.findFirst({ where: { utcTime, enabled: true }, orderBy: { id: "asc" } });
  if (!slot) throw new Error(`No active slot found for ${utcTime} UTC`);
  const windowCloseAt = new Date(windowStartAt.getTime() + 15 * 60_000);
  const settlementDueAt = new Date(windowStartAt.getTime() + 30 * 60_000);
  const occurrenceKey = tradeWindowSignalOccurrenceKey(slot.id, windowStartAt);
  const [signal, subscriptions, trades] = await Promise.all([
    prisma.manualTradeSignal.findUnique({ where: { occurrenceKey } }),
    prisma.aiSubscription.findMany({
      where: { startsAt: { lte: windowStartAt }, expiresAt: { gt: windowStartAt }, ...(userId ? { userId } : {}) },
      distinct: ["userId"],
      select: { userId: true, active: true, startsAt: true, expiresAt: true, user: { select: { status: true, vipRank: true, aiWalletBalance: true } } },
    }),
    prisma.copyTrade.findMany({
      where: { slotId: slot.id, windowStartAt, windowCloseAt, ...(userId ? { userId } : {}) },
      select: { id: true, userId: true, source: true, pair: true, status: true, idempotencyKey: true, signalId: true, occurrenceKey: true, startedAt: true },
    }),
  ]);
  console.info("AI window inspection", {
    slotId: slot.id,
    occurrenceKey,
    windowStartAt: windowStartAt.toISOString(),
    windowStartLocal: windowStartAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    windowCloseAt: windowCloseAt.toISOString(),
    windowCloseLocal: windowCloseAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    settlementDueAt: settlementDueAt.toISOString(),
    persistedSignalPair: signal?.recommendedPair ?? null,
    signalId: signal?.id ?? null,
    eligibleSubscriptionsAtWindowStart: subscriptions.length,
    trades,
    users: subscriptions.map(subscription => ({
      userId: subscription.userId,
      subscriptionActiveFlag: subscription.active,
      subscriptionExpiresAt: subscription.expiresAt.toISOString(),
      userStatus: subscription.user.status,
      vipRank: subscription.user.vipRank,
      currentAiWalletBalance: subscription.user.aiWalletBalance.toString(),
      exactOccurrenceTrade: trades.find(trade => trade.userId === subscription.userId) ?? null,
    })),
  });
  if (process.argv.includes("--rerun-live")) {
    const now = new Date();
    if (now < windowStartAt || now >= windowCloseAt) throw new Error("Refusing rerun: the exact occurrence is not currently live");
    console.info("missed-window recovery attempted", { occurrenceKey, currentTime: now.toISOString(), windowCloseAt: windowCloseAt.toISOString(), result: "started" });
    const result = await runAiAutoTradeScheduler(now);
    console.info("missed-window recovery attempted", { occurrenceKey, currentTime: now.toISOString(), windowCloseAt: windowCloseAt.toISOString(), result });
  }
}

main();
