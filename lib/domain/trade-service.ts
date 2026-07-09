import { Prisma, TradeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MIN_COPY_TRADE_STAKE_USD, VIP_TRADE_ROWS, dailyTradeLimit, getVipDailyIncomePercent, getVipTradeRow, getVipTradeRowForRank, normalizeVipRank } from "./trade-rules";
import { postBalancedJournal } from "./ledger";
import { createNotification } from "./notification-service";
import { aiWalletBusinessAmount, isAiWalletActive } from "./user-activation";
import { ensureUserWalletAccounts } from "./user-wallets";

const COPY_TRADE_STAKE_RATE = new Prisma.Decimal("0.01");
const MIN_COPY_TRADE_STAKE = new Prisma.Decimal(MIN_COPY_TRADE_STAKE_USD);
const INELIGIBLE_TRADE_MESSAGE = "You are not eligible for this trade.";
const TRADE_UNAVAILABLE_MESSAGE = "Trade not available.";
export const ALREADY_TRADED_IN_WINDOW = "ALREADY_TRADED_IN_WINDOW";
export const ALREADY_TRADED_IN_WINDOW_MESSAGE = "You have already placed a trade in this window.";
export const AI_AUTO_TRADE_NOTIFICATION_MESSAGE = "AI Subscription auto trade placed successfully.";
const TRADE_TIMEZONE = "IST";
const TRADE_DISPLAY_TIMEZONE = "Asia/Kolkata";
const MIN_TRADE_WINDOW_MINUTES = 30;
const SETTLEABLE_TRADE_STATUSES = [TradeStatus.PENDING, TradeStatus.ACTIVE, TradeStatus.COMPLETED] as const;
const REQUIRED_TRADE_SLOTS = [
  { label: "Window 1", utcTime: "08:30" },
  { label: "Window 2", utcTime: "12:30" },
  { label: "Window 3", utcTime: "18:10" },
] as const;

export class AlreadyTradedInWindowError extends Error {
  code = ALREADY_TRADED_IN_WINDOW;

  constructor() {
    super(ALREADY_TRADED_IN_WINDOW_MESSAGE);
  }
}

export async function getCopyTradeStatus(userId: string, now = new Date()) {
  await ensureRequiredTradeSlots();
  await settleDueCopyTrades(userId, now);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { vipRank: true, bitexBalance: true, bitexPrincipal: true },
  });
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const [activeTrade, completedToday, totalToday, history] = await Promise.all([
    prisma.copyTrade.findFirst({
      where: { userId, status: { in: [TradeStatus.PENDING, TradeStatus.ACTIVE] } },
      include: { code: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.copyTrade.count({ where: { userId, status: TradeStatus.INCOME_CREDITED, incomeCreditedAt: { gte: dayStart } } }),
    prisma.copyTrade.count({ where: { userId, startedAt: { gte: dayStart } } }),
    prisma.copyTrade.findMany({
      where: { userId, status: TradeStatus.INCOME_CREDITED },
      include: { code: true },
      orderBy: { startedAt: "desc" },
      take: 20,
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
      canTradeWhenLive: audit.aiWallet.pass && audit.vip.pass && audit.dailyLimit.pass && audit.package.pass,
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
    nextOpenTime: tradeWindow.nextOpenTime,
    timezone: tradeWindow.timezone,
    openTime: tradeWindow.openTime,
    closeTime: tradeWindow.closeTime,
    tradeStatus: tradeWindow.status,
    secondsUntilOpen: tradeWindow.secondsUntilOpen,
    secondsUntilClose: tradeWindow.secondsUntilClose,
    canTrade: Boolean(currentRow?.canTrade),
    reason: currentRow?.reason ?? null,
    debug: tradeWindow.debug,
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

export async function autoExecuteVipCopyTrade(input: { userId: string; now?: Date; idempotencyKey?: string }) {
  const now = input.now ?? new Date();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { vipRank: true } });
  const row = getVipTradeRowForRank(user.vipRank);
  if (!row) return { executed: false, reason: INELIGIBLE_TRADE_MESSAGE };
  try {
    const trade = await executeVipCopyTrade({ userId: input.userId, rowId: row.id, now, actorType: "SYSTEM", source: "AI_SUBSCRIPTION", idempotencyKey: input.idempotencyKey });
    return { executed: true, tradeId: trade.id, rowId: row.id };
  } catch (error) {
    return { executed: false, reason: error instanceof Error ? error.message : "Auto copy trade failed" };
  }
}

export async function runAiAutoTradeScheduler(now = new Date()) {
  await ensureRequiredTradeSlots();
  await prisma.aiSubscription.updateMany({ where: { active: true, expiresAt: { lte: now } }, data: { active: false } });
  const slot = await findOpenTradeSlot(now);
  if (!slot) {
    return {
      lastRunAt: now.toISOString(),
      liveWindow: null,
      usersScanned: 0,
      tradesPlaced: 0,
      skipped: [] as { userId: string; reason: string }[],
      errors: [] as { userId: string; error: string }[],
    };
  }
  const slotStart = tradeSlotStart(slot.utcTime, now);
  const slotEnd = new Date(slotStart.getTime() + effectiveTradeSlotDuration(slot.durationMinutes) * 60_000);
  const subscriptions = await prisma.aiSubscription.findMany({
    where: { active: true, expiresAt: { gt: now } },
    select: { userId: true },
    distinct: ["userId"],
    take: 500,
  });
  let tradesPlaced = 0;
  const skipped: { userId: string; reason: string }[] = [];
  const errors: { userId: string; error: string }[] = [];
  for (const subscription of subscriptions) {
    const idempotencyKey = `auto-trade:${subscription.userId}:${slotStart.toISOString()}`;
    try {
      const result = await autoExecuteVipCopyTrade({ userId: subscription.userId, now, idempotencyKey });
      if (result.executed) tradesPlaced += 1;
      else skipped.push({ userId: subscription.userId, reason: result.reason ?? "Skipped" });
    } catch (error) {
      errors.push({ userId: subscription.userId, error: error instanceof Error ? error.message : "Auto trade failed" });
    }
  }
  return {
    lastRunAt: now.toISOString(),
    liveWindow: {
      slotId: slot.id,
      label: slot.label,
      openTime: slotStart.toISOString(),
      closeTime: slotEnd.toISOString(),
      idempotencyScope: slotStart.toISOString(),
    },
    usersScanned: subscriptions.length,
    tradesPlaced,
    skipped,
    errors,
  };
}

async function executeVipCopyTrade(input: { userId: string; rowId: string; now?: Date; ipAddress?: string; device?: string; actorType: "USER" | "SYSTEM"; source?: "MANUAL" | "AI_SUBSCRIPTION"; idempotencyKey?: string }) {
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
    const slotStart = tradeSlotStart(slot.utcTime, now);
    const slotEnd = new Date(slotStart.getTime() + effectiveTradeSlotDuration(slot.durationMinutes) * 60_000);
    const existingSlotTrade = await tx.copyTrade.findFirst({
      where: { userId: input.userId, slotId: slot.id, startedAt: { gte: slotStart, lt: slotEnd } },
      select: { id: true },
    });
    if (existingSlotTrade) throw new AlreadyTradedInWindowError();

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const tradesToday = await tx.copyTrade.count({ where: { userId: input.userId, startedAt: { gte: dayStart } } });
    const limit = dailyTradeLimit();
    if (tradesToday >= limit) throw new Error("Daily trade limit reached");
    if (user.bitexBalance.lte(0)) throw new Error("Please transfer funds to AI Wallet before starting copy trade.");
    const tradeAmount = user.bitexBalance.mul(COPY_TRADE_STAKE_RATE);
    if (tradeAmount.lt(MIN_COPY_TRADE_STAKE)) throw new Error(`Copy trade stake must be at least $${MIN_COPY_TRADE_STAKE.toFixed(2)}.`);

    const locked = await tx.user.updateMany({
      where: { id: input.userId, bitexBalance: { gte: tradeAmount } },
      data: { bitexBalance: { decrement: tradeAmount } },
    });
    if (locked.count !== 1) throw new Error("Insufficient AI Wallet balance");

    const dailyPercent = new Prisma.Decimal(getVipDailyIncomePercent(normalizedVipRank));
    const perTradePercent = dailyPercent.div(limit);
    const timeline = { completesAt: slotEnd, creditDueAt: slotEnd };
    const trade = await tx.copyTrade.create({
      data: {
        userId: input.userId,
        codeId: null,
        slotId: slot.id,
        source: input.source ?? "MANUAL",
        idempotencyKey: input.idempotencyKey ?? null,
        principalAmount: tradeAmount,
        returnPercent: perTradePercent,
        status: TradeStatus.PENDING,
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
          source: input.source ?? "MANUAL",
          idempotencyKey: input.idempotencyKey ?? null,
          dailyPercent: dailyPercent.toString(),
          perTradePercent: perTradePercent.toString(),
          startTime: now.toISOString(),
          completionTime: timeline.completesAt.toISOString(),
          settlementDueAt: timeline.creditDueAt.toISOString(),
          result: "STARTED",
          activePackageId: null,
          device: input.device ?? null,
        },
      },
    });
    if (input.source === "AI_SUBSCRIPTION") {
      await createNotification(tx, {
        userId: input.userId,
        type: "AI_AUTO_TRADE",
        title: "AI auto trade placed",
        message: AI_AUTO_TRADE_NOTIFICATION_MESSAGE,
        metadata: { tradeId: trade.id, slotId: slot.id, slotOpenTime: slotStart.toISOString(), idempotencyKey: input.idempotencyKey ?? null },
      });
    }
    return trade;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function settleDueCopyTrades(userId?: string, now = new Date()) {
  const dueTrades = await prisma.copyTrade.findMany({
    where: { ...(userId ? { userId } : {}), status: { in: [...SETTLEABLE_TRADE_STATUSES] }, creditDueAt: { lte: now } },
    select: { id: true },
    take: 100,
  });
  let settled = 0;
  const errors: { tradeId: string; error: string }[] = [];
  for (const trade of dueTrades) {
    try {
      const result = await creditDueTradeIncome(trade.id, now);
      if (result.status === TradeStatus.INCOME_CREDITED) settled += 1;
    } catch (error) {
      errors.push({ tradeId: trade.id, error: error instanceof Error ? error.message : "Settlement failed" });
    }
  }
  if (errors.length && process.env.NODE_ENV !== "production") console.error("COPY_TRADE_SETTLEMENT_ERRORS", errors);
  return { checked: dueTrades.length, settled, failed: errors.length, errors };
}

export async function completeCopyTrade(tradeId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const trade = await tx.copyTrade.findUniqueOrThrow({ where: { id: tradeId } });
    if (trade.status === "COMPLETED" || trade.status === "INCOME_CREDITED") return trade;
    if ((trade.status !== TradeStatus.ACTIVE && trade.status !== TradeStatus.PENDING) || trade.completesAt > now) throw new Error("Trade is not complete");
    return tx.copyTrade.update({ where: { id: trade.id }, data: { status: "COMPLETED", completedAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function creditDueTradeIncome(tradeId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const trade = await tx.copyTrade.findUniqueOrThrow({ where: { id: tradeId } });
    if (trade.status === "INCOME_CREDITED") return trade;
    if (!isSettleableTradeStatus(trade.status) || trade.creditDueAt > now) throw new Error("Trade income is not due");
    const claimed = await tx.copyTrade.updateMany({
      where: { id: trade.id, status: { in: [...SETTLEABLE_TRADE_STATUSES] }, creditDueAt: { lte: now }, incomeCreditedAt: null },
      data: { status: TradeStatus.INCOME_CREDITED, completedAt: trade.completedAt ?? now, incomeCreditedAt: now },
    });
    if (claimed.count !== 1) return tx.copyTrade.findUniqueOrThrow({ where: { id: trade.id } });
    const incomeBase = trade.principalAmount.div(COPY_TRADE_STAKE_RATE);
    const profitAmount = incomeBase.mul(trade.returnPercent).div(100);
    const bitexCredit = trade.principalAmount.add(profitAmount);
    await ensureUserWalletAccounts(tx, trade.userId);
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: "USDT" } });
    const [bitexAccount, revenueAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: trade.userId, assetId: asset.id, type: "BITEX" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
    ]);
    const journal = await postBalancedJournal(tx, { referenceType: "COPY_TRADE_INCOME", referenceId: trade.id, idempotencyKey: `copy-trade-settlement:${trade.id}`, memo: "AI trade settled: principal returned and profit credited", lines: [{ accountId: revenueAccount.id, direction: "DEBIT", amount: bitexCredit }, { accountId: bitexAccount.id, direction: "CREDIT", amount: bitexCredit }] });
    await tx.income.create({ data: { userId: trade.userId, type: "COPY_TRADE", sourceType: "COPY_TRADE", sourceId: trade.id, amount: profitAmount, copyTradeId: trade.id, ledgerJournalId: journal.id } });
    await createNotification(tx, {
      userId: trade.userId,
      type: "COPY_TRADE_INCOME",
      title: "AI trade settled",
      message: "AI trade settled: principal returned and profit credited.",
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
    return tx.copyTrade.update({ where: { id: trade.id }, data: { incomeAmount: profitAmount, incomeCreditedAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function isSettleableTradeStatus(status: TradeStatus) {
  return status === TradeStatus.PENDING || status === TradeStatus.ACTIVE || status === TradeStatus.COMPLETED;
}

async function findOpenTradeSlot(now: Date, client: Prisma.TransactionClient | typeof prisma = prisma) {
  await ensureRequiredTradeSlots(client);
  const slots = await client.tradeSlot.findMany({ where: { enabled: true }, orderBy: { utcTime: "asc" } });
  return slots.find(slot => isSlotOpen(slot.utcTime, slot.durationMinutes, now)) ?? null;
}

async function getCurrentTradeWindow(now: Date) {
  await ensureRequiredTradeSlots();
  const slots = await prisma.tradeSlot.findMany({ where: { enabled: true }, orderBy: { utcTime: "asc" } });
  const windows = slots.flatMap(slot => [0, 1].map(dayOffset => {
    const start = tradeSlotStart(slot.utcTime, now, dayOffset);
    const durationMinutes = effectiveTradeSlotDuration(slot.durationMinutes);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    return { slot, start, end, durationMinutes };
  })).sort((a, b) => a.start.getTime() - b.start.getTime());
  const live = windows.find(window => now >= window.start && now < window.end);
  const upcoming = windows.find(window => window.start > now);
  if (live) return tradeWindowPayload("LIVE", live.start, live.end, now, live.slot, upcoming?.slot ?? null, upcoming?.start ?? null);
  if (upcoming) return tradeWindowPayload("UPCOMING", upcoming.start, upcoming.end, now, null, upcoming.slot, upcoming.start);
  return {
    status: "CLOSED" as const,
    nextOpenTime: null,
    openTime: "",
    closeTime: "",
    timezone: TRADE_TIMEZONE,
    secondsUntilOpen: 0,
    secondsUntilClose: 0,
    slot: null,
    debug: buildTradeWindowDebug(now, null, null, "CLOSED", 0, 0),
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

function tradeWindowPayload(status: "LIVE" | "UPCOMING" | "CLOSED", start: Date, end: Date, now: Date, currentSlot: TradeWindowSlot | null, nextSlot: TradeWindowSlot | null, nextStart: Date | null) {
  const displaySlot = currentSlot ?? nextSlot;
  const secondsUntilOpen = status === "UPCOMING" ? Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 1000)) : 0;
  const secondsUntilClose = status === "LIVE" || status === "UPCOMING" ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 1000)) : 0;
  return {
    status,
    nextOpenTime: nextStart?.toISOString() ?? (status === "UPCOMING" ? start.toISOString() : null),
    openTime: formatTradeDisplayTime(start),
    closeTime: formatTradeDisplayTime(end),
    timezone: TRADE_TIMEZONE,
    secondsUntilOpen,
    secondsUntilClose,
    slot: displaySlot ? {
      id: displaySlot.id,
      label: displaySlot.label,
      utcTime: displaySlot.utcTime,
      durationMinutes: effectiveTradeSlotDuration(displaySlot.durationMinutes),
    } : null,
    debug: buildTradeWindowDebug(now, currentSlot, nextSlot, status, secondsUntilOpen, secondsUntilClose),
  };
}

type TradeWindowSlot = { id: string; label: string; utcTime: string; durationMinutes: number };

function formatTradeDisplayTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TRADE_DISPLAY_TIMEZONE,
  }).format(value);
}

function effectiveTradeSlotDuration(durationMinutes: number) {
  return Math.max(MIN_TRADE_WINDOW_MINUTES, Number.isFinite(durationMinutes) ? durationMinutes : 0);
}

async function ensureRequiredTradeSlots(client: Pick<typeof prisma, "tradeSlot"> = prisma) {
  for (const required of REQUIRED_TRADE_SLOTS) {
    const slot = await client.tradeSlot.findFirst({ where: { label: required.label } });
    if (slot) {
      if (slot.utcTime !== required.utcTime || slot.durationMinutes < MIN_TRADE_WINDOW_MINUTES || !slot.enabled) {
        await client.tradeSlot.update({
          where: { id: slot.id },
          data: { utcTime: required.utcTime, durationMinutes: MIN_TRADE_WINDOW_MINUTES, enabled: true },
        });
      }
    } else {
      await client.tradeSlot.create({
        data: { label: required.label, utcTime: required.utcTime, durationMinutes: MIN_TRADE_WINDOW_MINUTES, enabled: true },
      });
    }
  }
  await client.tradeSlot.updateMany({
    where: { durationMinutes: { lt: MIN_TRADE_WINDOW_MINUTES } },
    data: { durationMinutes: MIN_TRADE_WINDOW_MINUTES },
  });
}

function buildTradeWindowDebug(now: Date, currentSlot: TradeWindowSlot | null, nextSlot: TradeWindowSlot | null, tradeStatus: "LIVE" | "UPCOMING" | "CLOSED", secondsUntilOpen: number, secondsUntilClose: number) {
  return {
    serverNowUTC: now.toISOString(),
    currentSlot: currentSlot ? serializeDebugSlot(currentSlot) : null,
    nextSlot: nextSlot ? serializeDebugSlot(nextSlot) : null,
    tradeStatus,
    secondsUntilOpen,
    secondsUntilClose,
  };
}

function serializeDebugSlot(slot: TradeWindowSlot) {
  return {
    label: slot.label,
    utcTime: slot.utcTime,
    durationMinutes: effectiveTradeSlotDuration(slot.durationMinutes),
  };
}

function tradeEligibilityAudit(input: { rowEligible: boolean; windowStatus: "LIVE" | "UPCOMING" | "CLOSED"; remaining: number; limit: number; aiActive: boolean; userVipRank: string; aiWalletActiveAmount: number; tradesUsedToday: number }) {
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
      pass: true,
      reason: null,
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
