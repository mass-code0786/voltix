import { Prisma, TradeWindowSettlementStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SETTLEMENT_BATCH_SIZE = boundedInteger(process.env.TRADE_SETTLEMENT_BATCH_SIZE, 1_000, 100, 2_000);
const WINDOW_LEASE_MS = boundedInteger(process.env.TRADE_SETTLEMENT_LEASE_MS, 120_000, 30_000, 600_000);
const MAX_WINDOWS_PER_CYCLE = 20;
const MAX_WINDOW_ATTEMPTS = 5;

type DueWindow = {
  slotId: string;
  windowStartAt: Date;
  windowCloseAt: Date;
  settlementDueAt: Date;
  totalEligible: bigint;
};

type BatchResult = {
  claimed: bigint;
  settled: bigint;
  principalTotal: Prisma.Decimal | null;
  profitTotal: Prisma.Decimal | null;
};

type RecoveringBatchResult = BatchResult & {
  failedTradeIds: string[];
  errors: string[];
};

export type WindowSettlementSummary = {
  occurrenceKey: string;
  settlementDueAt: string;
  processingStartedAt: string;
  delayBeforeStartMs: number;
  totalEligible: number;
  totalClaimed: number;
  totalSettled: number;
  totalFailed: number;
  batchCount: number;
  batches: number;
  durationMs: number;
  throughputPerSecond: number;
  financialBatchDurationMs: number;
  principalReturnedTotal: string;
  profitCreditedTotal: string;
  retryCount: number;
  result: "COMPLETED" | "PARTIAL" | "FAILED" | "LEASED_BY_ANOTHER_WORKER";
};

export async function settleDueTradeWindows(now = new Date()) {
  await syncMissingSettlementNotifications(SETTLEMENT_BATCH_SIZE, now).catch(error => {
    console.error("[TRADE_SETTLEMENT_NOTIFICATION_RETRY_FAILURE]", { error: errorMessage(error) });
  });
  const windows = await findDueWindowOccurrences(now);
  const summaries: WindowSettlementSummary[] = [];
  for (const window of windows) summaries.push(await settleWindowOccurrence(window, now));
  return {
    windowsFound: windows.length,
    windowsSettled: summaries.filter(row => row.result === "COMPLETED").length,
    totalSettled: summaries.reduce((sum, row) => sum + row.totalSettled, 0),
    totalFailed: summaries.reduce((sum, row) => sum + row.totalFailed, 0),
    summaries,
  };
}

async function findDueWindowOccurrences(now: Date) {
  const [due, recoverable] = await Promise.all([
    prisma.$queryRaw<DueWindow[]>(Prisma.sql`
    SELECT
      t."slotId",
      t."windowStartAt",
      t."windowCloseAt",
      t."creditDueAt" AS "settlementDueAt",
      COUNT(*)::bigint AS "totalEligible"
    FROM "CopyTrade" t
    WHERE t.status IN ('PENDING'::"TradeStatus", 'ACTIVE'::"TradeStatus", 'COMPLETED'::"TradeStatus")
      AND t."incomeCreditedAt" IS NULL
      AND t."creditDueAt" <= ${now}
      AND t."windowStartAt" IS NOT NULL
      AND t."windowCloseAt" IS NOT NULL
    GROUP BY t."slotId", t."windowStartAt", t."windowCloseAt", t."creditDueAt"
    ORDER BY t."creditDueAt" ASC
    LIMIT ${MAX_WINDOWS_PER_CYCLE}
    `),
    prisma.tradeWindowSettlement.findMany({
      where: {
        settlementDueAt: { lte: now },
        attempts: { lt: MAX_WINDOW_ATTEMPTS },
        OR: [
          { status: { in: [TradeWindowSettlementStatus.PENDING, TradeWindowSettlementStatus.PARTIAL, TradeWindowSettlementStatus.FAILED] } },
          { status: TradeWindowSettlementStatus.PROCESSING, leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: { settlementDueAt: "asc" },
      take: MAX_WINDOWS_PER_CYCLE,
      select: { occurrenceKey: true, slotId: true, windowStartAt: true, windowCloseAt: true, settlementDueAt: true },
    }),
  ]);
  const windows = new Map(due.map(window => [windowOccurrenceKey(window), window]));
  for (const window of recoverable) {
    if (!windows.has(window.occurrenceKey)) windows.set(window.occurrenceKey, { ...window, totalEligible: BigInt(0) });
  }
  return [...windows.values()].slice(0, MAX_WINDOWS_PER_CYCLE);
}

async function settleWindowOccurrence(window: DueWindow, _detectedAt: Date): Promise<WindowSettlementSummary> {
  const occurrenceKey = windowOccurrenceKey(window);
  const processingStartedAt = new Date();
  const totalEligible = Number(window.totalEligible);
  const coordinator = await prisma.tradeWindowSettlement.upsert({
    where: { occurrenceKey },
    create: {
      occurrenceKey,
      slotId: window.slotId,
      windowStartAt: window.windowStartAt,
      windowCloseAt: window.windowCloseAt,
      settlementDueAt: window.settlementDueAt,
      totalTrades: totalEligible,
    },
    update: { totalTrades: { increment: 0 } },
  });
  const leaseExpiresAt = new Date(processingStartedAt.getTime() + WINDOW_LEASE_MS);
  const leased = await prisma.tradeWindowSettlement.updateMany({
    where: {
      id: coordinator.id,
      status: { not: TradeWindowSettlementStatus.COMPLETED },
      attempts: { lt: MAX_WINDOW_ATTEMPTS },
      OR: [
        { status: { not: TradeWindowSettlementStatus.PROCESSING } },
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lte: processingStartedAt } },
      ],
    },
    data: {
      status: TradeWindowSettlementStatus.PROCESSING,
      processingStartedAt,
      leaseExpiresAt,
      completedAt: null,
      lastError: null,
      totalTrades: coordinator.settledTrades + totalEligible,
      attempts: { increment: 1 },
    },
  });
  if (leased.count !== 1) return emptySummary(window, occurrenceKey, processingStartedAt, totalEligible, "LEASED_BY_ANOTHER_WORKER");

  let totalClaimed = 0;
  let totalSettled = 0;
  let batches = 0;
  let principalTotal = new Prisma.Decimal(0);
  let profitTotal = new Prisma.Decimal(0);
  let lastError: string | null = null;
  let financialBatchDurationMs = 0;
  const failedTradeIds = new Set<string>();
  const dataErrors: string[] = [];
  try {
    await ensureSettlementAccounts(window);
    while (true) {
      const tradeIds = await findEligibleTradeIds(window, SETTLEMENT_BATCH_SIZE, [...failedTradeIds]);
      if (!tradeIds.length) break;
      const batchStartedAt = performance.now();
      const settledAt = new Date();
      const batch = await settleWindowBatchRecovering(window, tradeIds, settledAt);
      financialBatchDurationMs += performance.now() - batchStartedAt;
      const claimed = Number(batch.claimed);
      if (!claimed) break;
      batches += 1;
      totalClaimed += claimed;
      totalSettled += Number(batch.settled);
      for (const tradeId of batch.failedTradeIds) failedTradeIds.add(tradeId);
      dataErrors.push(...batch.errors);
      principalTotal = principalTotal.add(batch.principalTotal ?? 0);
      profitTotal = profitTotal.add(batch.profitTotal ?? 0);
      await syncMissingSettlementNotifications(SETTLEMENT_BATCH_SIZE, settledAt, window).catch(error => {
        console.error("[TRADE_SETTLEMENT_NOTIFICATION_FAILURE]", { occurrenceKey, error: errorMessage(error) });
      });
      await prisma.tradeWindowSettlement.update({
        where: { id: coordinator.id },
        data: { leaseExpiresAt: new Date(Date.now() + WINDOW_LEASE_MS), settledTrades: coordinator.settledTrades + totalSettled },
      });
    }
  } catch (error) {
    lastError = errorMessage(error);
  }

  const [remaining, occurrenceSettled] = await Promise.all([countEligible(window), countSettled(window)]);
  if (!lastError && failedTradeIds.size) lastError = `${failedTradeIds.size} trade(s) failed data-safe settlement isolation: ${dataErrors[0] ?? "database data exception"}`;
  const totalFailed = lastError ? remaining : 0;
  const result = lastError ? (totalSettled ? "PARTIAL" : "FAILED") : "COMPLETED";
  const completedAt = new Date();
  await prisma.tradeWindowSettlement.update({
    where: { id: coordinator.id },
    data: {
      status: result,
      totalTrades: occurrenceSettled + remaining,
      settledTrades: occurrenceSettled,
      failedTrades: totalFailed,
      completedAt,
      leaseExpiresAt: null,
      lastError,
    },
  });
  const durationMs = completedAt.getTime() - processingStartedAt.getTime();
  const summary: WindowSettlementSummary = {
    occurrenceKey,
    settlementDueAt: window.settlementDueAt.toISOString(),
    processingStartedAt: processingStartedAt.toISOString(),
    delayBeforeStartMs: Math.max(0, processingStartedAt.getTime() - window.settlementDueAt.getTime()),
    totalEligible,
    totalClaimed,
    totalSettled,
    totalFailed,
    batchCount: batches,
    batches,
    durationMs,
    throughputPerSecond: durationMs ? Math.round((totalSettled * 1_000_000) / durationMs) / 1_000 : totalSettled,
    financialBatchDurationMs: Math.round(financialBatchDurationMs),
    principalReturnedTotal: principalTotal.toString(),
    profitCreditedTotal: profitTotal.toString(),
    retryCount: Math.max(0, coordinator.attempts),
    result,
  };
  console.info("[TRADE_WINDOW_SETTLEMENT]", summary);
  if (lastError) console.error("[TRADE_WINDOW_SETTLEMENT_FAILURE]", { occurrenceKey, error: lastError, remainingTrades: remaining });
  return summary;
}

async function ensureSettlementAccounts(window: DueWindow) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "WalletAccount" (id, "userId", "assetId", type, "createdAt")
    SELECT gen_random_uuid()::text, due."userId", asset.id, 'BITEX'::"WalletType", CURRENT_TIMESTAMP
    FROM (
      SELECT DISTINCT t."userId"
      FROM "CopyTrade" t
      WHERE ${windowPredicate(window)}
    ) due
    CROSS JOIN "Asset" asset
    WHERE asset.symbol = 'USDT'
    ON CONFLICT ("userId", "assetId", type) DO NOTHING
  `);
  const feeAccounts = await prisma.walletAccount.count({ where: { userId: null, type: "FEE", asset: { symbol: "USDT" } } });
  if (!feeAccounts) throw new Error("USDT settlement revenue account is missing");
}

async function findEligibleTradeIds(window: DueWindow, batchSize: number, excludedTradeIds: string[]) {
  const excluded = excludedTradeIds.length ? Prisma.sql`AND t.id NOT IN (${Prisma.join(excludedTradeIds)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT t.id FROM "CopyTrade" t
    WHERE ${windowPredicate(window)} ${excluded}
    ORDER BY t.id
    LIMIT ${batchSize}
  `);
  return rows.map(row => row.id);
}

async function settleWindowBatchRecovering(window: DueWindow, tradeIds: string[], settledAt: Date): Promise<RecoveringBatchResult> {
  try {
    const result = await settleWindowBatch(window, tradeIds, settledAt);
    return { ...result, failedTradeIds: [], errors: [] };
  } catch (error) {
    if (!isDataException(error)) throw error;
    if (tradeIds.length === 1) {
      return {
        claimed: BigInt(1),
        settled: BigInt(0),
        principalTotal: new Prisma.Decimal(0),
        profitTotal: new Prisma.Decimal(0),
        failedTradeIds: tradeIds,
        errors: [errorMessage(error)],
      };
    }
    const midpoint = Math.ceil(tradeIds.length / 2);
    const first = await settleWindowBatchRecovering(window, tradeIds.slice(0, midpoint), settledAt);
    const second = await settleWindowBatchRecovering(window, tradeIds.slice(midpoint), settledAt);
    return {
      claimed: first.claimed + second.claimed,
      settled: first.settled + second.settled,
      principalTotal: new Prisma.Decimal(first.principalTotal ?? 0).add(second.principalTotal ?? 0),
      profitTotal: new Prisma.Decimal(first.profitTotal ?? 0).add(second.profitTotal ?? 0),
      failedTradeIds: [...first.failedTradeIds, ...second.failedTradeIds],
      errors: [...first.errors, ...second.errors],
    };
  }
}

async function settleWindowBatch(window: DueWindow, tradeIds: string[], settledAt: Date) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<BatchResult[]>(Prisma.sql`
    WITH eligible AS MATERIALIZED (
      SELECT
        t.id,
        t."userId",
        t."principalAmount",
        (CASE WHEN t.source = 'NEW_DEPOSITOR_EXTRA'
          THEN t."calculatedProfit"
          ELSE t."principalAmount" * t."returnPercent"
        END)::decimal(36,18) AS profit,
        t.source,
        ai.id AS "aiAccountId",
        fee.id AS "feeAccountId"
      FROM "CopyTrade" t
      JOIN "Asset" asset ON asset.symbol = 'USDT'
      JOIN "WalletAccount" ai ON ai."userId" = t."userId" AND ai."assetId" = asset.id AND ai.type = 'BITEX'::"WalletType"
      CROSS JOIN LATERAL (
        SELECT wa.id FROM "WalletAccount" wa
        WHERE wa."userId" IS NULL AND wa."assetId" = asset.id AND wa.type = 'FEE'::"WalletType"
        ORDER BY wa.id LIMIT 1
      ) fee
      WHERE ${windowPredicate(window)}
        AND t.id IN (${Prisma.join(tradeIds)})
      ORDER BY t.id
      FOR UPDATE OF t SKIP LOCKED
    ), principal_journals AS (
      INSERT INTO "LedgerJournal" (id, "referenceType", "referenceId", "idempotencyKey", memo, status, "postedAt", "createdAt")
      SELECT gen_random_uuid()::text, 'COPY_TRADE_PRINCIPAL_RETURN', e.id,
        'principal-return:' || e.id,
        CASE WHEN e.source = 'NEW_DEPOSITOR_EXTRA' THEN 'Additional Trade Principal Return' ELSE 'AI Trade Principal Return' END,
        'POSTED'::"JournalStatus", ${settledAt}, ${settledAt}
      FROM eligible e
      ON CONFLICT ("referenceType", "referenceId") DO NOTHING
      RETURNING id, "referenceId"
    ), profit_journals AS (
      INSERT INTO "LedgerJournal" (id, "referenceType", "referenceId", "idempotencyKey", memo, status, "postedAt", "createdAt")
      SELECT gen_random_uuid()::text, 'COPY_TRADE_INCOME', e.id,
        'profit-credit:' || e.id,
        CASE WHEN e.source = 'NEW_DEPOSITOR_EXTRA' THEN 'Additional Trade Profit' ELSE 'AI Trade Profit' END,
        'POSTED'::"JournalStatus", ${settledAt}, ${settledAt}
      FROM eligible e
      ON CONFLICT ("referenceType", "referenceId") DO NOTHING
      RETURNING id, "referenceId"
    ), principal_entries AS (
      INSERT INTO "LedgerEntry" (id, "journalId", "accountId", direction, amount, "createdAt")
      SELECT gen_random_uuid()::text, j.id, e."feeAccountId", 'DEBIT'::"LedgerDirection", e."principalAmount", ${settledAt}
      FROM principal_journals j JOIN eligible e ON e.id = j."referenceId"
      UNION ALL
      SELECT gen_random_uuid()::text, j.id, e."aiAccountId", 'CREDIT'::"LedgerDirection", e."principalAmount", ${settledAt}
      FROM principal_journals j JOIN eligible e ON e.id = j."referenceId"
      RETURNING id
    ), profit_entries AS (
      INSERT INTO "LedgerEntry" (id, "journalId", "accountId", direction, amount, "createdAt")
      SELECT gen_random_uuid()::text, j.id, e."feeAccountId", 'DEBIT'::"LedgerDirection", e.profit, ${settledAt}
      FROM profit_journals j JOIN eligible e ON e.id = j."referenceId"
      UNION ALL
      SELECT gen_random_uuid()::text, j.id, e."aiAccountId", 'CREDIT'::"LedgerDirection", e.profit, ${settledAt}
      FROM profit_journals j JOIN eligible e ON e.id = j."referenceId"
      RETURNING id
    ), incomes AS (
      INSERT INTO "Income" (id, "userId", type, "sourceType", "sourceId", amount, "copyTradeId", "ledgerJournalId", "createdAt")
      SELECT gen_random_uuid()::text, e."userId", 'COPY_TRADE'::"IncomeType", 'COPY_TRADE', e.id, e.profit, e.id, j.id, ${settledAt}
      FROM eligible e JOIN profit_journals j ON j."referenceId" = e.id
      ON CONFLICT ("userId", type, "sourceType", "sourceId") DO NOTHING
      RETURNING id
    ), per_user AS (
      SELECT "userId", SUM("principalAmount") AS principal, SUM(profit) AS profit
      FROM eligible GROUP BY "userId"
    ), wallet_updates AS (
      UPDATE "User" u
      SET "bitexBalance" = u."bitexBalance" + p.principal + p.profit,
          "bitexIncomeEarned" = u."bitexIncomeEarned" + p.profit,
          "bitexUnlocked" = u."bitexUnlocked" OR u."bitexPrincipal" = 0
            OR u."bitexIncomeEarned" + p.profit >= u."bitexPrincipal" * 0.60,
          "updatedAt" = ${settledAt}
      FROM per_user p
      WHERE u.id = p."userId"
      RETURNING u.id
    ), settled AS (
      UPDATE "CopyTrade" t
      SET status = 'INCOME_CREDITED'::"TradeStatus", "incomeAmount" = e.profit,
          "completedAt" = ${settledAt}, "incomeCreditedAt" = ${settledAt}, "updatedAt" = ${settledAt}
      FROM eligible e
      WHERE t.id = e.id
        AND (SELECT COUNT(*) FROM wallet_updates) >= 0
        AND (SELECT COUNT(*) FROM principal_entries) = (SELECT COUNT(*) * 2 FROM eligible)
        AND (SELECT COUNT(*) FROM profit_entries) = (SELECT COUNT(*) * 2 FROM eligible)
        AND (SELECT COUNT(*) FROM incomes) = (SELECT COUNT(*) FROM eligible)
      RETURNING t.id
    )
    SELECT
      (SELECT COUNT(*)::bigint FROM eligible) AS claimed,
      (SELECT COUNT(*)::bigint FROM settled) AS settled,
      COALESCE((SELECT SUM("principalAmount") FROM eligible), 0)::decimal(36,18) AS "principalTotal",
      COALESCE((SELECT SUM(profit) FROM eligible), 0)::decimal(36,18) AS "profitTotal"
    `);
    const result = rows[0] ?? { claimed: BigInt(0), settled: BigInt(0), principalTotal: new Prisma.Decimal(0), profitTotal: new Prisma.Decimal(0) };
    if (result.claimed !== result.settled) throw new Error(`Atomic settlement invariant failed: claimed ${result.claimed}, settled ${result.settled}`);
    return result;
  }, { timeout: 60_000 });
}

async function syncMissingSettlementNotifications(limit: number, createdAt: Date, window?: DueWindow) {
  const occurrence = window ? Prisma.sql`
    AND t."slotId" = ${window.slotId}
    AND t."windowStartAt" = ${window.windowStartAt}
    AND t."windowCloseAt" = ${window.windowCloseAt}
    AND t."creditDueAt" = ${window.settlementDueAt}
  ` : Prisma.empty;
  return prisma.$executeRaw(Prisma.sql`
    WITH missing AS (
      SELECT t.id, t."userId", t."principalAmount", t."incomeAmount", t.source, t.pair,
        COALESCE(t."selectedRate", t."returnPercent") AS "profitPercent",
        t."walletSnapshotAtTrade", t."promotionDay", t."creditDueAt"
      FROM "CopyTrade" t
      WHERE t.status = 'INCOME_CREDITED'::"TradeStatus"
        AND t."incomeCreditedAt" IS NOT NULL
        ${occurrence}
        AND NOT EXISTS (
          SELECT 1 FROM "Notification" n WHERE n."settlementKey" = 'settlement:' || t.id
        )
      ORDER BY t."incomeCreditedAt", t.id
      LIMIT ${limit}
    )
    INSERT INTO "Notification" (id, "userId", type, title, message, metadata, "settlementKey", "createdAt")
    SELECT gen_random_uuid()::text, m."userId",
      CASE WHEN m.source = 'NEW_DEPOSITOR_EXTRA' THEN 'NEW_DEPOSITOR_EXTRA_TRADE'::"NotificationType" ELSE 'COPY_TRADE_INCOME'::"NotificationType" END,
      CASE WHEN m.source = 'NEW_DEPOSITOR_EXTRA' THEN 'Additional Trade Settled' ELSE 'AI trade settled' END,
      CASE WHEN m.source = 'NEW_DEPOSITOR_EXTRA'
        THEN 'Your principal has been returned and promotional profit has been credited.'
        ELSE 'AI trade settled: principal returned and profit credited.' END,
      jsonb_build_object(
        'tradeId', m.id,
        'pair', CASE WHEN m.pair IS NULL THEN NULL ELSE regexp_replace(m.pair, 'USDT$', '/USDT') END,
        'principalReturned', m."principalAmount"::text,
        'incomeAmount', m."incomeAmount"::text,
        'profitPercent', m."profitPercent"::text,
        'walletSnapshotAtTrade', m."walletSnapshotAtTrade"::text,
        'promotionDay', m."promotionDay",
        'settlementDueAt', m."creditDueAt"
      ),
      'settlement:' || m.id, ${createdAt}
    FROM missing m
    ON CONFLICT ("settlementKey") DO NOTHING
  `);
}

async function countEligible(window: DueWindow) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count FROM "CopyTrade" t WHERE ${windowPredicate(window)}
  `);
  return Number(rows[0]?.count ?? 0);
}

async function countSettled(window: DueWindow) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM "CopyTrade" t
    WHERE t."slotId" = ${window.slotId}
      AND t."windowStartAt" = ${window.windowStartAt}
      AND t."windowCloseAt" = ${window.windowCloseAt}
      AND t."creditDueAt" = ${window.settlementDueAt}
      AND t.status = 'INCOME_CREDITED'::"TradeStatus"
      AND t."incomeCreditedAt" IS NOT NULL
  `);
  return Number(rows[0]?.count ?? 0);
}

function windowPredicate(window: DueWindow) {
  return Prisma.sql`
    t."slotId" = ${window.slotId}
    AND t."windowStartAt" = ${window.windowStartAt}
    AND t."windowCloseAt" = ${window.windowCloseAt}
    AND t."creditDueAt" = ${window.settlementDueAt}
    AND t."creditDueAt" <= CURRENT_TIMESTAMP
    AND t.status IN ('PENDING'::"TradeStatus", 'ACTIVE'::"TradeStatus", 'COMPLETED'::"TradeStatus")
    AND t."incomeCreditedAt" IS NULL
  `;
}

function windowOccurrenceKey(window: Pick<DueWindow, "slotId" | "windowStartAt" | "windowCloseAt" | "settlementDueAt">) {
  return [window.slotId, window.windowStartAt.toISOString(), window.windowCloseAt.toISOString(), window.settlementDueAt.toISOString()].join(":");
}

function emptySummary(window: DueWindow, occurrenceKey: string, startedAt: Date, totalEligible: number, result: WindowSettlementSummary["result"]): WindowSettlementSummary {
  return {
    occurrenceKey,
    settlementDueAt: window.settlementDueAt.toISOString(),
    processingStartedAt: startedAt.toISOString(),
    delayBeforeStartMs: Math.max(0, startedAt.getTime() - window.settlementDueAt.getTime()),
    totalEligible,
    totalClaimed: 0,
    totalSettled: 0,
    totalFailed: 0,
    batchCount: 0,
    batches: 0,
    durationMs: 0,
    throughputPerSecond: 0,
    financialBatchDurationMs: 0,
    principalReturnedTotal: "0",
    profitCreditedTotal: "0",
    retryCount: 0,
    result,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Bulk settlement failed";
}

function isDataException(error: unknown) {
  const candidate = error as { code?: string; meta?: { code?: string; message?: string }; message?: string };
  const databaseCode = candidate.meta?.code ?? candidate.code ?? "";
  const message = `${candidate.message ?? ""} ${candidate.meta?.message ?? ""}`.toLowerCase();
  return databaseCode.startsWith("22") || /numeric field overflow|out of range|invalid input syntax/.test(message);
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
