import { Prisma, TradeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MIN_COPY_TRADE_STAKE_USD, VIP_TRADE_ROWS, dailyTradeLimit, getVipDailyIncomePercent, getVipTradeRow, getVipTradeRowForRank, normalizeVipRank, tradeTimeline } from "./trade-rules";
import { postBalancedJournal } from "./ledger";
import { createNotification } from "./notification-service";
import { aiWalletBusinessAmount, isAiWalletActive } from "./user-activation";

const COPY_TRADE_STAKE_RATE = new Prisma.Decimal("0.01");
const MIN_COPY_TRADE_STAKE = new Prisma.Decimal(MIN_COPY_TRADE_STAKE_USD);
const INELIGIBLE_TRADE_MESSAGE = "You are not eligible for this trade.";
const TRADE_UNAVAILABLE_MESSAGE = "Trade not available.";
const TRADE_TIMEZONE = "UTC";
const MIN_TRADE_WINDOW_MINUTES = 30;

export async function getCopyTradeStatus(userId: string, now = new Date()) {
  await ensureTradeSlotDurations();
  await settleDueCopyTrades(userId, now);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { vipRank: true, bitexBalance: true, bitexPrincipal: true },
  });
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const [activeTrade, completedToday, totalToday, history, activePackage] = await Promise.all([
    prisma.copyTrade.findFirst({
      where: { userId, status: TradeStatus.ACTIVE },
      include: { code: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.copyTrade.count({ where: { userId, status: { in: [TradeStatus.COMPLETED, TradeStatus.INCOME_CREDITED] }, startedAt: { gte: dayStart } } }),
    prisma.copyTrade.count({ where: { userId, startedAt: { gte: dayStart } } }),
    prisma.copyTrade.findMany({
      where: { userId, status: { in: [TradeStatus.COMPLETED, TradeStatus.INCOME_CREDITED] } },
      include: { code: true },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    prisma.userPackage.findFirst({
      where: { userId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true },
    }),
  ]);
  const limit = dailyTradeLimit();
  const remaining = Math.max(0, limit - totalToday);
  const active = activeTrade ? serializeTrade(activeTrade, now) : null;
  const tradeWindow = await getCurrentTradeWindow(now);
  const normalizedVipRank = normalizeVipRank(user.vipRank);
  const tradeAmount = user.bitexBalance.mul(COPY_TRADE_STAKE_RATE);
  const aiActive = isAiWalletActive(user);
  const aiWalletActiveAmount = Number(aiWalletBusinessAmount(user).toString());
  const rows = VIP_TRADE_ROWS.map(row => {
    const rowEligible = row.vipRanks.includes(normalizedVipRank);
    const audit = tradeEligibilityAudit({
      rowEligible,
      windowStatus: tradeWindow.status,
      remaining,
      limit,
      aiActive,
      hasActivePackage: Boolean(activePackage),
      userVipRank: normalizedVipRank,
      aiWalletActiveAmount,
      tradesUsedToday: totalToday,
    });
    const canTrade = audit.aiWallet.pass && audit.vip.pass && audit.tradeWindow.pass && audit.dailyLimit.pass && audit.package.pass;
    const reason = firstFailedTradeReason(audit);
    return {
      ...row,
      vipRange: displayVipRange(row.label),
      dailyReturnMin: row.dailyPercentMin,
      dailyReturnMax: row.dailyPercentMax,
      eligible: rowEligible,
      available: tradeWindow.status === "LIVE",
      tradeAmount: Number(tradeAmount.toString()),
      perTradePercent: Number(new Prisma.Decimal(row.dailyPercentMin).div(limit).toString()),
      currentTradeTime: tradeWindow.openTime,
      tradeStatus: tradeWindow.status,
      openTime: tradeWindow.openTime,
      closeTime: tradeWindow.closeTime,
      timezone: tradeWindow.timezone,
      secondsUntilOpen: tradeWindow.secondsUntilOpen,
      secondsUntilClose: tradeWindow.secondsUntilClose,
      canTrade,
      reason,
      message: reason,
      conditionAudit: audit,
    };
  });
  const currentRow = rows.find(row => row.eligible) ?? rows[0];
  debugAiTradeStatus({
    serverNow: now.toISOString(),
    slot: tradeWindow.slot,
    status: tradeWindow.status,
    canTrade: Boolean(currentRow?.canTrade),
    reason: currentRow?.reason ?? null,
  });
  return {
    serverNow: now.toISOString(),
    timezone: tradeWindow.timezone,
    openTime: tradeWindow.openTime,
    closeTime: tradeWindow.closeTime,
    tradeStatus: tradeWindow.status,
    canTrade: Boolean(currentRow?.canTrade),
    reason: currentRow?.reason ?? null,
    userVipRank: normalizedVipRank,
    aiWalletActiveAmount,
    tradesUsedToday: totalToday,
    conditionAudit: currentRow?.conditionAudit ?? null,
    activeTrade: active,
    remainingTime: active?.remainingTime ?? 0,
    eligibility: {
      eligible: remaining > 0 && aiActive,
      reason: remaining <= 0 ? "Daily trade limit reached" : !aiActive ? "AI Wallet activation required" : null,
    },
    vipRank: normalizedVipRank,
    todaysTradeCount: totalToday,
    dailyTradeLimit: limit,
    todaysCompletedTrades: completedToday,
    todaysRemainingTrades: remaining,
    tradeRows: rows,
    history: history.map(trade => serializeTrade(trade, now)),
  };
}

export async function startVipCopyTrade(input: { userId: string; rowId: string; now?: Date; ipAddress?: string; device?: string }) {
  return executeVipCopyTrade({ ...input, actorType: "USER" });
}

export async function autoExecuteVipCopyTrade(input: { userId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { vipRank: true } });
  const row = getVipTradeRowForRank(user.vipRank);
  if (!row) return { executed: false, reason: INELIGIBLE_TRADE_MESSAGE };
  try {
    const trade = await executeVipCopyTrade({ userId: input.userId, rowId: row.id, now, actorType: "SYSTEM" });
    return { executed: true, tradeId: trade.id, rowId: row.id };
  } catch (error) {
    return { executed: false, reason: error instanceof Error ? error.message : "Auto copy trade failed" };
  }
}

async function executeVipCopyTrade(input: { userId: string; rowId: string; now?: Date; ipAddress?: string; device?: string; actorType: "USER" | "SYSTEM" }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const row = getVipTradeRow(input.rowId);
    if (!row) throw new Error(INELIGIBLE_TRADE_MESSAGE);
    const normalizedVipRank = normalizeVipRank(user.vipRank);
    if (!row.vipRanks.includes(normalizedVipRank)) throw new Error(INELIGIBLE_TRADE_MESSAGE);
    if (!isAiWalletActive(user)) throw new Error("AI Wallet activation required");

    const slot = await findOpenTradeSlot(now, tx);
    if (!slot) throw new Error(TRADE_UNAVAILABLE_MESSAGE);
    const activePackage = await tx.userPackage.findFirst({
      where: { userId: input.userId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true },
    });
    if (!activePackage) throw new Error("Package required.");
    if (user.bitexBalance.lte(0)) throw new Error("Please transfer funds to AI Wallet before starting copy trade.");
    const tradeAmount = user.bitexBalance.mul(COPY_TRADE_STAKE_RATE);
    if (tradeAmount.lt(MIN_COPY_TRADE_STAKE)) throw new Error(`Copy trade stake must be at least $${MIN_COPY_TRADE_STAKE.toFixed(2)}.`);

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const tradesToday = await tx.copyTrade.count({ where: { userId: input.userId, startedAt: { gte: dayStart } } });
    const limit = dailyTradeLimit();
    if (tradesToday >= limit) throw new Error("Daily trade limit reached");
    const slotStart = tradeSlotStart(slot.utcTime, now);
    const slotEnd = new Date(slotStart.getTime() + effectiveTradeSlotDuration(slot.durationMinutes) * 60_000);
    const existingSlotTrade = await tx.copyTrade.findFirst({
      where: { userId: input.userId, slotId: slot.id, startedAt: { gte: slotStart, lt: slotEnd } },
      select: { id: true },
    });
    if (existingSlotTrade) throw new Error("Trade already executed for this slot.");

    const locked = await tx.user.updateMany({
      where: { id: input.userId, bitexBalance: { gte: tradeAmount } },
      data: { bitexBalance: { decrement: tradeAmount } },
    });
    if (locked.count !== 1) throw new Error("Insufficient AI Wallet balance");

    const dailyPercent = new Prisma.Decimal(getVipDailyIncomePercent(normalizedVipRank));
    const perTradePercent = dailyPercent.div(limit);
    const timeline = tradeTimeline(now, effectiveTradeSlotDuration(slot.durationMinutes), slot.creditDelayMins);
    const trade = await tx.copyTrade.create({
      data: {
        userId: input.userId,
        codeId: null,
        slotId: slot.id,
        principalAmount: tradeAmount,
        returnPercent: perTradePercent,
        status: TradeStatus.ACTIVE,
        startedAt: now,
        ...timeline,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.userId,
        actorType: input.actorType,
        action: input.actorType === "SYSTEM" ? "AI_COPY_TRADE_AUTO_STARTED" : "COPY_TRADE_STARTED",
        entityType: "CopyTrade",
        entityId: trade.id,
        ipAddress: input.ipAddress,
        metadata: {
          userId: input.userId,
          vipRank: normalizedVipRank,
          tradeRowId: row.id,
          tradeRowLabel: row.label,
          tradeAmount: tradeAmount.toString(),
          dailyPercent: dailyPercent.toString(),
          perTradePercent: perTradePercent.toString(),
          startTime: now.toISOString(),
          completionTime: timeline.completesAt.toISOString(),
          result: "STARTED",
          activePackageId: activePackage.id,
          device: input.device ?? null,
        },
      },
    });
    return trade;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function settleDueCopyTrades(userId?: string, now = new Date()) {
  const dueActive = await prisma.copyTrade.findMany({
    where: { ...(userId ? { userId } : {}), status: TradeStatus.ACTIVE, completesAt: { lte: now } },
    select: { id: true },
    take: 50,
  });
  for (const trade of dueActive) {
    await completeCopyTrade(trade.id, now).catch(() => null);
  }
  const dueIncome = await prisma.copyTrade.findMany({
    where: { ...(userId ? { userId } : {}), status: TradeStatus.COMPLETED, creditDueAt: { lte: now } },
    select: { id: true },
    take: 50,
  });
  for (const trade of dueIncome) {
    await creditDueTradeIncome(trade.id, now).catch(() => null);
  }
}

export async function completeCopyTrade(tradeId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const trade = await tx.copyTrade.findUniqueOrThrow({ where: { id: tradeId } });
    if (trade.status === "COMPLETED" || trade.status === "INCOME_CREDITED") return trade;
    if (trade.status !== TradeStatus.ACTIVE || trade.completesAt > now) throw new Error("Trade is not complete");
    return tx.copyTrade.update({ where: { id: trade.id }, data: { status: "COMPLETED", completedAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function creditDueTradeIncome(tradeId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const trade = await tx.copyTrade.findUniqueOrThrow({ where: { id: tradeId } });
    if (trade.status === "INCOME_CREDITED") return trade;
    if (trade.status !== "COMPLETED" || trade.creditDueAt > now) throw new Error("Trade income is not due");
    const incomeBase = trade.principalAmount.div(COPY_TRADE_STAKE_RATE);
    const profitAmount = incomeBase.mul(trade.returnPercent).div(100);
    const bitexCredit = trade.principalAmount.add(profitAmount);
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: "USDT" } });
    const [bitexAccount, revenueAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: trade.userId, assetId: asset.id, type: "BITEX" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
    ]);
    const journal = await postBalancedJournal(tx, { referenceType: "COPY_TRADE_INCOME", referenceId: trade.id, idempotencyKey: `copy-income:${trade.id}`, memo: "Copy trade principal returned and income credited to AI", lines: [{ accountId: revenueAccount.id, direction: "DEBIT", amount: bitexCredit }, { accountId: bitexAccount.id, direction: "CREDIT", amount: bitexCredit }] });
    await tx.income.create({ data: { userId: trade.userId, type: "COPY_TRADE", sourceType: "COPY_TRADE", sourceId: trade.id, amount: profitAmount, copyTradeId: trade.id, ledgerJournalId: journal.id } });
    await createNotification(tx, {
      userId: trade.userId,
      type: "COPY_TRADE_INCOME",
      title: "Copy trade income credited",
      message: `${profitAmount.toString()} USDT income has been credited to your AI Wallet.`,
      metadata: { tradeId: trade.id, incomeAmount: profitAmount.toString(), totalCredit: bitexCredit.toString() },
    });
    const progress = await tx.user.update({
      where: { id: trade.userId },
      data: { bitexBalance: { increment: bitexCredit }, bitexIncomeEarned: { increment: profitAmount } },
      select: { bitexIncomeEarned: true, bitexTargetAmount: true },
    });
    if (progress.bitexTargetAmount.gt(0) && progress.bitexIncomeEarned.gte(progress.bitexTargetAmount)) {
      await tx.user.update({ where: { id: trade.userId }, data: { bitexUnlocked: true } });
    }
    await tx.auditLog.create({
      data: {
        actorId: trade.userId,
        actorType: "SYSTEM",
        action: "COPY_TRADE_INCOME_POSTED",
        entityType: "CopyTrade",
        entityId: trade.id,
        metadata: { tradeId: trade.id, incomeAmount: profitAmount.toString(), totalCredit: bitexCredit.toString(), ledgerJournalId: journal.id, creditedAt: now.toISOString() },
      },
    });
    return tx.copyTrade.update({ where: { id: trade.id }, data: { status: "INCOME_CREDITED", incomeAmount: profitAmount, incomeCreditedAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function findOpenTradeSlot(now: Date, client: Prisma.TransactionClient | typeof prisma = prisma) {
  if (client === prisma) await ensureTradeSlotDurations(client);
  const slots = await client.tradeSlot.findMany({ where: { enabled: true }, orderBy: { utcTime: "asc" } });
  return slots.find(slot => isSlotOpen(slot.utcTime, slot.durationMinutes, now)) ?? null;
}

async function getCurrentTradeWindow(now: Date) {
  await ensureTradeSlotDurations();
  const slots = await prisma.tradeSlot.findMany({ where: { enabled: true }, orderBy: { utcTime: "asc" } });
  const windows = slots.flatMap(slot => [-1, 0, 1].map(dayOffset => {
    const start = tradeSlotStart(slot.utcTime, now, dayOffset);
    const durationMinutes = effectiveTradeSlotDuration(slot.durationMinutes);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    return { slot, start, end, durationMinutes };
  })).sort((a, b) => a.start.getTime() - b.start.getTime());
  const live = windows.find(window => now >= window.start && now < window.end);
  if (live) return tradeWindowPayload("LIVE", live.start, live.end, now, live.slot);
  const upcoming = windows.find(window => window.start > now);
  if (upcoming) return tradeWindowPayload("UPCOMING", upcoming.start, upcoming.end, now, upcoming.slot);
  const last = windows.filter(window => window.end <= now).at(-1);
  if (last) return tradeWindowPayload("CLOSED", last.start, last.end, now, last.slot);
  return {
    status: "CLOSED" as const,
    openTime: "--:--",
    closeTime: "--:--",
    timezone: TRADE_TIMEZONE,
    secondsUntilOpen: 0,
    secondsUntilClose: 0,
    slot: null,
  };
}

function isSlotOpen(utcTime: string, durationMinutes: number, now: Date) {
  const start = tradeSlotStart(utcTime, now);
  const end = new Date(start.getTime() + effectiveTradeSlotDuration(durationMinutes) * 60_000);
  return now >= start && now < end;
}

function tradeSlotStart(utcTime: string, now: Date, dayOffset = 0) {
  const [hours, minutes] = utcTime.split(":").map(value => Number(value));
  const start = new Date(now);
  start.setUTCHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (dayOffset) start.setUTCDate(start.getUTCDate() + dayOffset);
  return start;
}

function tradeWindowPayload(status: "LIVE" | "UPCOMING" | "CLOSED", start: Date, end: Date, now: Date, slot: { id: string; label: string; utcTime: string; durationMinutes: number } | null) {
  return {
    status,
    openTime: formatUtcTime(start),
    closeTime: formatUtcTime(end),
    timezone: TRADE_TIMEZONE,
    secondsUntilOpen: status === "UPCOMING" ? Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 1000)) : 0,
    secondsUntilClose: status === "LIVE" ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 1000)) : 0,
    slot: slot ? {
      id: slot.id,
      label: slot.label,
      utcTime: slot.utcTime,
      durationMinutes: effectiveTradeSlotDuration(slot.durationMinutes),
    } : null,
  };
}

function formatUtcTime(value: Date) {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

function effectiveTradeSlotDuration(durationMinutes: number) {
  return Math.max(MIN_TRADE_WINDOW_MINUTES, Number.isFinite(durationMinutes) ? durationMinutes : 0);
}

async function ensureTradeSlotDurations(client: Pick<typeof prisma, "tradeSlot"> = prisma) {
  await client.tradeSlot.updateMany({
    where: { durationMinutes: { lt: MIN_TRADE_WINDOW_MINUTES } },
    data: { durationMinutes: MIN_TRADE_WINDOW_MINUTES },
  });
}

function tradeEligibilityAudit(input: { rowEligible: boolean; windowStatus: "LIVE" | "UPCOMING" | "CLOSED"; remaining: number; limit: number; aiActive: boolean; hasActivePackage: boolean; userVipRank: string; aiWalletActiveAmount: number; tradesUsedToday: number }) {
  return {
    aiWallet: {
      pass: input.aiActive,
      activeAmount: input.aiWalletActiveAmount,
      reason: input.aiActive ? null : "AI Wallet activation required",
    },
    vip: {
      pass: input.rowEligible,
      userVipRank: input.userVipRank,
      reason: input.rowEligible ? null : "VIP not eligible",
    },
    tradeWindow: {
      pass: input.windowStatus === "LIVE",
      tradeStatus: input.windowStatus,
      reason: input.windowStatus === "LIVE" ? null : "Trade window closed",
    },
    dailyLimit: {
      pass: input.remaining > 0,
      tradesUsedToday: input.tradesUsedToday,
      dailyTradeLimit: input.limit,
      remainingTrades: input.remaining,
      reason: input.remaining > 0 ? null : "Daily limit reached",
    },
    package: {
      pass: input.hasActivePackage,
      reason: input.hasActivePackage ? null : "Package requirement failed",
    },
  };
}

function firstFailedTradeReason(audit: ReturnType<typeof tradeEligibilityAudit>) {
  if (!audit.aiWallet.pass) return audit.aiWallet.reason;
  if (!audit.vip.pass) return audit.vip.reason;
  if (!audit.tradeWindow.pass) return audit.tradeWindow.reason;
  if (!audit.dailyLimit.pass) return audit.dailyLimit.reason;
  if (!audit.package.pass) return audit.package.reason;
  return null;
}

function debugAiTradeStatus(input: { serverNow: string; slot: { label: string; utcTime: string; durationMinutes: number } | null; status: string; canTrade: boolean; reason: string | null }) {
  if (process.env.NODE_ENV === "production") return;
  console.log("AI_TRADE_STATUS_DEBUG", {
    serverNow: input.serverNow,
    slot: input.slot,
    status: input.status,
    canTrade: input.canTrade,
    reason: input.reason,
  });
}

function displayVipRange(label: string) {
  return label.replace(/\s+/g, " ").trim();
}

function serializeTrade(trade: Awaited<ReturnType<typeof prisma.copyTrade.findFirst>> & { code?: { code: string } | null }, now: Date) {
  const amount = Number(trade!.principalAmount.toString());
  const returnPercent = Number(trade!.returnPercent.toString());
  const profit = Number(((((amount / Number(COPY_TRADE_STAKE_RATE.toString())) * returnPercent) / 100)).toFixed(8));
  return {
    id: trade!.id,
    code: trade!.code?.code ?? "",
    amount,
    returnPercent,
    profit,
    status: trade!.status,
    startedAt: trade!.startedAt.toISOString(),
    completesAt: trade!.completesAt.toISOString(),
    creditDueAt: trade!.creditDueAt.toISOString(),
    completedAt: trade!.completedAt?.toISOString() ?? null,
    incomeCreditedAt: trade!.incomeCreditedAt?.toISOString() ?? null,
    remainingTime: Math.max(0, Math.ceil((trade!.completesAt.getTime() - now.getTime()) / 1000)),
  };
}
