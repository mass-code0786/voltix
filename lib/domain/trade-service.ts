import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { Prisma, TradeStatus, UserStatus } from "@prisma/client";
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
export const AI_ALREADY_TRADED_IN_WINDOW_MESSAGE = "AI trade already executed for this window.";
export const MANUAL_ALREADY_TRADED_IN_WINDOW_MESSAGE = "Manual trade already placed for this window.";
export const AI_AUTO_TRADE_NOTIFICATION_MESSAGE = "AI Subscription auto trade placed successfully.";
const TRADE_TIMEZONE = "IST";
const TRADE_DISPLAY_TIMEZONE = "Asia/Kolkata";
const TRADE_WINDOW_DURATION_MINUTES = 15;
const TRADE_SETTLEMENT_AFTER_START_MINUTES = 30;
const TRADE_WINDOW_DAY_OFFSETS = [-1, 0, 1] as const;
const SETTLEABLE_TRADE_STATUSES = [TradeStatus.PENDING, TradeStatus.ACTIVE, TradeStatus.COMPLETED] as const;
const REQUIRED_TRADE_SLOTS = [
  { label: "Window 1", utcTime: "08:30", durationMinutes: TRADE_WINDOW_DURATION_MINUTES },
  { label: "Window 2", utcTime: "12:30", durationMinutes: TRADE_WINDOW_DURATION_MINUTES },
  { label: "Window 3", utcTime: "14:30", durationMinutes: TRADE_WINDOW_DURATION_MINUTES },
] as const;
const AI_AUTO_TRADE_LOG_FILE = path.join(process.cwd(), "logs", "ai-auto-trade.log");
const copyTradeStatusSelect = {
  id: true,
  principalAmount: true,
  returnPercent: true,
  status: true,
  startedAt: true,
  completesAt: true,
  creditDueAt: true,
  completedAt: true,
  incomeCreditedAt: true,
  code: { select: { code: true } },
} satisfies Prisma.CopyTradeSelect;

type AiTradeCycleLog = {
  userId: string;
  vipLevel: string | null;
  aiSubscriptionStatus: "ACTIVE" | "INACTIVE";
  selectedVipRow: string | null;
  currentTradeSlot: string | null;
  currentTime: string;
  tradeCodeFound: string | null;
  tradeCodeStatus: string | null;
  walletBalance: string | null;
  reasonIfSkipped: string | null;
  tradeExecuted: "Yes" | "No";
  tradeId?: string | null;
};

type AiAutoTradeDebugResult = {
  currentServerTime: string;
  currentTradeSlot: {
    id: string;
    label: string;
    utcTime: string;
    openTime: string;
    closeTime: string;
    durationMinutes: number;
  } | null;
  tradeStatus: "LIVE" | "UPCOMING" | "CLOSED";
  aiSubscriptionStatus: "ACTIVE" | "INACTIVE";
  userId: string;
  uid: string;
  email: string;
  subscriptionExpiry: string | null;
  userVipRank: string;
  selectedVipRow: string | null;
  selectedVipRowId: string | null;
  aiWalletBalance: string;
  aiWalletActiveAmount: string;
  dailyTradesUsed: number;
  dailyTradeLimit: number;
  alreadyTradedThisWindow: boolean;
  existingTradeSource: string | null;
  tradeCodeFound: string | null;
  tradeCodeStatus: string | null;
  stakeAmount: string;
  minimumStakeAmount: string;
  balanceSufficient: boolean;
  canAutoTrade: boolean;
  skippedReason: string | null;
  wouldExecute: boolean;
  executedTradeId?: string | null;
};

export class AlreadyTradedInWindowError extends Error {
  code = ALREADY_TRADED_IN_WINDOW;

  constructor(source?: CopyTradeSource) {
    super(duplicateTradeWindowMessageForSource(source));
  }
}

type CopyTradeSource = "MANUAL" | "AI_SUBSCRIPTION" | "AI_SUBSCRIPTION_AUTO";

function duplicateTradeWindowMessageForSource(source?: string | null) {
  return source === "AI_SUBSCRIPTION_AUTO"
    ? AI_ALREADY_TRADED_IN_WINDOW_MESSAGE
    : MANUAL_ALREADY_TRADED_IN_WINDOW_MESSAGE;
}

export async function getCopyTradeStatus(userId: string, now = new Date()) {
  await ensureRequiredTradeSlots();
  await settleDueCopyTrades(userId, now);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { vipRank: true, aiWalletBalance: true, aiTradePrincipal: true },
  });
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const [activeTrade, completedToday, totalToday, history] = await Promise.all([
    prisma.copyTrade.findFirst({
      where: { userId, status: { in: [...SETTLEABLE_TRADE_STATUSES] }, incomeCreditedAt: null },
      select: copyTradeStatusSelect,
      orderBy: { startedAt: "desc" },
    }),
    prisma.copyTrade.count({ where: { userId, status: TradeStatus.INCOME_CREDITED, incomeCreditedAt: { gte: dayStart } } }),
    prisma.copyTrade.count({ where: { userId, startedAt: { gte: dayStart } } }),
    prisma.copyTrade.findMany({
      where: { userId, status: TradeStatus.INCOME_CREDITED },
      select: copyTradeStatusSelect,
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
  ]);
  const limit = dailyTradeLimit();
  const remaining = Math.max(0, limit - totalToday);
  const active = activeTrade ? serializeTrade(activeTrade, now) : null;
  const tradeWindow = await getCurrentTradeWindow(now);
  const normalizedVipRank = normalizeVipRank(user.vipRank);
  const tradeAmount = user.aiWalletBalance.mul(COPY_TRADE_STAKE_RATE);
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
      windowStartAt: tradeWindow.windowStartAt,
      windowCloseAt: tradeWindow.windowCloseAt,
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
    windowStartAt: tradeWindow.windowStartAt,
    windowCloseAt: tradeWindow.windowCloseAt,
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

export async function startVipCopyTrade(input: { userId: string; rowId: string; now?: Date; ipAddress?: string; device?: string; idempotencyKey?: string; expectedSlotId?: string }) {
  return executeVipCopyTrade({ ...input, actorType: "USER", source: "MANUAL" });
}

export async function autoExecuteVipCopyTrade(input: { userId: string; now?: Date; idempotencyKey?: string }) {
  const now = input.now ?? new Date();
  const [user, activeSubscription, slot] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { uid: true, email: true, vipRank: true, status: true, aiWalletBalance: true, aiTradePrincipal: true } }),
    prisma.aiSubscription.findFirst({ where: { userId: input.userId, active: true, startsAt: { lte: now }, expiresAt: { gt: now } }, select: { id: true, expiresAt: true } }),
    findOpenTradeSlot(now),
  ]);
  const normalizedVipRank = normalizeVipRank(user.vipRank);
  const row = getVipTradeRowForRank(normalizedVipRank);
  const baseLog: AiTradeCycleLog = {
    userId: input.userId,
    vipLevel: normalizedVipRank,
    aiSubscriptionStatus: activeSubscription ? "ACTIVE" : "INACTIVE",
    selectedVipRow: row?.label ?? null,
    currentTradeSlot: slot ? `${slot.label} (${slot.utcTime} UTC)` : null,
    currentTime: now.toISOString(),
    tradeCodeFound: null,
    tradeCodeStatus: null,
    walletBalance: user.aiWalletBalance.toString(),
    reasonIfSkipped: null,
    tradeExecuted: "No",
  };
  if (!row) {
    await logAiTradeCycle({ ...baseLog, reasonIfSkipped: INELIGIBLE_TRADE_MESSAGE });
    return { executed: false, reason: INELIGIBLE_TRADE_MESSAGE, vipRank: normalizedVipRank };
  }
  if (!activeSubscription) {
    await logAiTradeCycle({ ...baseLog, reasonIfSkipped: "AI Subscription is not active" });
    return { executed: false, reason: "AI Subscription is not active", rowId: row.id, vipRank: normalizedVipRank, selectedRow: row.label };
  }
  if (user.status !== UserStatus.ACTIVE) {
    await logAiTradeCycle({ ...baseLog, reasonIfSkipped: "User account is not active" });
    return { executed: false, reason: "User account is not active", rowId: row.id, vipRank: normalizedVipRank };
  }
  try {
    await logAiAutoTradeEvent("========== AI BOT START ==========", {
      currentTime: now.toISOString(),
      timezone: TRADE_TIMEZONE,
      userId: input.userId,
      vip: normalizedVipRank,
      subscription: "ACTIVE",
      tradeId: null,
      tradeStatus: slot ? "LIVE" : "NOT_LIVE",
      tradeCode: null,
      selectedVipRow: row.label,
      balance: user.aiWalletBalance.toString(),
    });
    await logAiAutoTradeEvent("Executing Trade...", {
      userId: input.userId,
      uid: user.uid,
      email: user.email,
      subscriptionActive: true,
      subscriptionExpiry: activeSubscription.expiresAt.toISOString(),
      selectedVipRow: row.label,
      tradeCode: null,
      balance: user.aiWalletBalance.toString(),
    });
    const trade = await executeVipCopyTrade({ userId: input.userId, rowId: row.id, now, actorType: "SYSTEM", source: "AI_SUBSCRIPTION_AUTO", idempotencyKey: input.idempotencyKey });
    const updatedUser = await prisma.user.findUnique({ where: { id: input.userId }, select: { aiWalletBalance: true } });
    await logAiAutoTradeEvent("Completed Successfully", {
      tradeExecuted: true,
      walletUpdated: true,
      tradeHistoryCreated: true,
      profitScheduled: true,
      userId: input.userId,
      vip: normalizedVipRank,
      selectedVipRow: row.label,
      tradeId: trade.id,
      tradeCode: null,
      principalDeducted: trade.principalAmount.toString(),
      walletBalanceAfter: updatedUser?.aiWalletBalance.toString() ?? null,
      status: trade.status,
      completesAt: trade.completesAt.toISOString(),
      creditDueAt: trade.creditDueAt.toISOString(),
      windowStartAt: trade.windowStartAt?.toISOString() ?? null,
      windowCloseAt: trade.windowCloseAt?.toISOString() ?? null,
    });
    await logAiTradeCycle({
      ...baseLog,
      tradeExecuted: "Yes",
      tradeId: trade.id,
    });
    await logAiAutoTradeEvent("AI auto trade placed successfully.", {
      userId: input.userId,
      uid: user.uid,
      email: user.email,
      createdTradeId: trade.id,
    });
    return { executed: true, tradeId: trade.id, rowId: row.id, vipRank: normalizedVipRank, selectedRow: row.label, code: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Auto copy trade failed";
    await logAiTradeCycle({ ...baseLog, reasonIfSkipped: reason });
    return { executed: false, reason, rowId: row.id, vipRank: normalizedVipRank, selectedRow: row.label };
  }
}

export async function runAiAutoTradeScheduler(now = new Date()) {
  await logAiAutoTradeEvent("scheduler started", { currentUtc: now.toISOString(), currentIst: formatTradeDebugIst(now) });
  await ensureRequiredTradeSlots();
  await prisma.aiSubscription.updateMany({ where: { active: true, expiresAt: { lte: now } }, data: { active: false } });
  const slot = await findOpenTradeSlot(now);
  if (!slot) {
    const inactiveWindowLogs = await logActiveSubscriptionsSkippedOutsideLiveWindow(now);
    const noLiveSummary = {
      currentUtc: now.toISOString(),
      currentIst: formatTradeDebugIst(now),
      liveWindow: null,
      windowStart: null,
      windowClose: null,
      settlementTime: null,
      usersScanned: inactiveWindowLogs,
      tradesPlacedThisCycle: 0,
      aiTradesAlreadyExecutedThisWindow: 0,
      manualTradesAlreadyPlacedThisWindow: 0,
      totalTradesForWindow: 0,
      skipped: [] as { userId: string; reason: string }[],
      errors: [] as { userId: string; error: string }[],
    };
    await logAiAutoTradeEvent("No live trade window.", { ...noLiveSummary, windows: await tradeWindowComparisons(now) });
    return {
      lastRunAt: now.toISOString(),
      ...noLiveSummary,
    };
  }
  const slotStart = tradeSlotStart(slot.utcTime, now);
  const slotEnd = new Date(slotStart.getTime() + effectiveTradeSlotDuration(slot.durationMinutes) * 60_000);
  const settlementTime = tradeSlotSettlementTime(slotStart);
  await logAiAutoTradeEvent("live slot detected", { slotId: slot.id, label: slot.label, utcTime: slot.utcTime, currentUtc: now.toISOString(), currentIst: formatTradeDebugIst(now), windowStart: slotStart.toISOString(), windowClose: slotEnd.toISOString(), settlementTime: settlementTime.toISOString(), windows: await tradeWindowComparisons(now) });
  const subscriptions = await prisma.aiSubscription.findMany({
    where: { active: true, startsAt: { lte: now }, expiresAt: { gt: now } },
    select: { userId: true, expiresAt: true },
    distinct: ["userId"],
    take: 500,
  });
  await logAiAutoTradeEvent("users scanned", { usersScanned: subscriptions.length });
  let tradesPlacedThisCycle = 0;
  let aiTradesAlreadyExecutedThisWindow = 0;
  let manualTradesAlreadyPlacedThisWindow = 0;
  const skipped: { userId: string; reason: string }[] = [];
  const errors: { userId: string; error: string }[] = [];
  for (const subscription of subscriptions) {
    const idempotencyKey = `auto-trade:${subscription.userId}:${slotStart.toISOString()}`;
    try {
      const result = await autoExecuteVipCopyTrade({ userId: subscription.userId, now, idempotencyKey });
      if (result.executed) tradesPlacedThisCycle += 1;
      else {
        const reason = result.reason ?? "Skipped";
        if (reason === AI_ALREADY_TRADED_IN_WINDOW_MESSAGE) aiTradesAlreadyExecutedThisWindow += 1;
        if (reason === MANUAL_ALREADY_TRADED_IN_WINDOW_MESSAGE) manualTradesAlreadyPlacedThisWindow += 1;
        skipped.push({ userId: subscription.userId, reason });
      }
      const diagnostic = await debugAiAutoTradeForUser({ userId: subscription.userId, now });
      await logAiAutoTradeEvent("user result", {
        userId: subscription.userId,
        uid: diagnostic.uid,
        email: diagnostic.email,
        subscriptionActive: diagnostic.aiSubscriptionStatus === "ACTIVE",
        subscriptionExpiry: diagnostic.subscriptionExpiry,
        vipRank: diagnostic.userVipRank,
        selectedVipRow: diagnostic.selectedVipRow,
        aiWalletBalance: diagnostic.aiWalletBalance,
        stakeAmount: diagnostic.stakeAmount,
        dailyTradesUsed: diagnostic.dailyTradesUsed,
        existingTradeSource: diagnostic.existingTradeSource,
        decision: result.executed ? "AI auto trade placed successfully." : result.reason === AI_ALREADY_TRADED_IN_WINDOW_MESSAGE ? "AI trade already executed for this window." : result.reason === MANUAL_ALREADY_TRADED_IN_WINDOW_MESSAGE ? "Manual trade already placed for this window." : "Skipped",
        skippedReason: result.executed ? null : result.reason ?? diagnostic.skippedReason ?? "Skipped",
        createdTradeId: result.executed ? result.tradeId : null,
      });
    } catch (error) {
      errors.push({ userId: subscription.userId, error: error instanceof Error ? error.message : "Auto trade failed" });
      await logAiAutoTradeEvent("user error", { userId: subscription.userId, error: error instanceof Error ? error.message : "Auto trade failed" });
    }
  }
  const totalTradesForWindow = await prisma.copyTrade.count({
    where: { slotId: slot.id, windowStartAt: slotStart, windowCloseAt: slotEnd },
  });
  const summary = {
    currentUtc: now.toISOString(),
    currentIst: formatTradeDebugIst(now),
    liveWindow: slot.label,
    windowStart: slotStart.toISOString(),
    windowClose: slotEnd.toISOString(),
    settlementTime: settlementTime.toISOString(),
    usersScanned: subscriptions.length,
    tradesPlacedThisCycle,
    aiTradesAlreadyExecutedThisWindow,
    manualTradesAlreadyPlacedThisWindow,
    totalTradesForWindow,
    skipped: skipped.length,
    errors: errors.length,
  };
  await logAiAutoTradeEvent("scheduler complete", summary);
  return {
    lastRunAt: now.toISOString(),
    currentUtc: summary.currentUtc,
    currentIst: summary.currentIst,
    windowStart: summary.windowStart,
    windowClose: summary.windowClose,
    settlementTime: summary.settlementTime,
    liveWindow: {
      slotId: slot.id,
      label: slot.label,
      openTime: slotStart.toISOString(),
      closeTime: slotEnd.toISOString(),
      settlementTime: settlementTime.toISOString(),
      idempotencyScope: slotStart.toISOString(),
    },
    usersScanned: summary.usersScanned,
    tradesPlacedThisCycle: summary.tradesPlacedThisCycle,
    aiTradesAlreadyExecutedThisWindow: summary.aiTradesAlreadyExecutedThisWindow,
    manualTradesAlreadyPlacedThisWindow: summary.manualTradesAlreadyPlacedThisWindow,
    totalTradesForWindow: summary.totalTradesForWindow,
    skipped,
    errors,
  };
}

async function executeVipCopyTrade(input: { userId: string; rowId: string; now?: Date; ipAddress?: string; device?: string; actorType: "USER" | "SYSTEM"; source?: "MANUAL" | "AI_SUBSCRIPTION" | "AI_SUBSCRIPTION_AUTO"; idempotencyKey?: string; expectedSlotId?: string }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const isAiAutoTrade = input.source === "AI_SUBSCRIPTION" || input.source === "AI_SUBSCRIPTION_AUTO";
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    if (user.status !== UserStatus.ACTIVE) throw new Error("User account is not active");
    const row = getVipTradeRow(input.rowId);
    if (!row) throw new Error(INELIGIBLE_TRADE_MESSAGE);
    const normalizedVipRank = normalizeVipRank(user.vipRank);
    if (!row.vipRanks.includes(normalizedVipRank)) throw new Error(INELIGIBLE_TRADE_MESSAGE);
    if (isAiAutoTrade) {
      const activeSubscription = await tx.aiSubscription.findFirst({
        where: { userId: input.userId, active: true, startsAt: { lte: now }, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (!activeSubscription) throw new Error("AI Subscription is not active");
    }
    if (!isAiWalletActive(user)) throw new Error("AI Wallet activation required");

    const slot = await findOpenTradeSlot(now, tx);
    if (!slot) throw new Error(TRADE_UNAVAILABLE_MESSAGE);
    if (input.expectedSlotId && slot.id !== input.expectedSlotId) throw new Error("This trading window has closed. Please wait for the next trading window.");
    const slotStart = tradeSlotStart(slot.utcTime, now);
    const slotEnd = new Date(slotStart.getTime() + effectiveTradeSlotDuration(slot.durationMinutes) * 60_000);
    const creditDueAt = tradeSlotSettlementTime(slotStart);
    const existingSlotTrade = await tx.copyTrade.findFirst({
      where: { userId: input.userId, slotId: slot.id, windowStartAt: slotStart, windowCloseAt: slotEnd },
      select: { id: true, source: true },
    });
    if (existingSlotTrade) throw new AlreadyTradedInWindowError(existingSlotTrade.source as CopyTradeSource);

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const tradesToday = await tx.copyTrade.count({ where: { userId: input.userId, startedAt: { gte: dayStart } } });
    const limit = dailyTradeLimit();
    if (tradesToday >= limit) throw new Error("Daily trade limit reached");
    if (user.aiWalletBalance.lte(0)) throw new Error("Please transfer funds to AI Wallet before starting copy trade.");
    const tradeAmount = user.aiWalletBalance.mul(COPY_TRADE_STAKE_RATE);
    if (tradeAmount.lt(MIN_COPY_TRADE_STAKE)) throw new Error(`Copy trade stake must be at least $${MIN_COPY_TRADE_STAKE.toFixed(2)}.`);

    const locked = await tx.user.updateMany({
      where: { id: input.userId, aiWalletBalance: { gte: tradeAmount } },
      data: { aiWalletBalance: { decrement: tradeAmount } },
    });
    if (locked.count !== 1) throw new Error("Insufficient AI Wallet balance");

    const dailyPercent = new Prisma.Decimal(getVipDailyIncomePercent(normalizedVipRank));
    const perTradePercent = dailyPercent.div(limit);
    const timeline = { windowStartAt: slotStart, windowCloseAt: slotEnd, completesAt: slotEnd, creditDueAt };
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
          tradeCode: null,
          tradeAmount: tradeAmount.toString(),
          source: input.source ?? "MANUAL",
          idempotencyKey: input.idempotencyKey ?? null,
          dailyPercent: dailyPercent.toString(),
          perTradePercent: perTradePercent.toString(),
          startTime: now.toISOString(),
          windowStartAt: timeline.windowStartAt.toISOString(),
          windowCloseAt: timeline.windowCloseAt.toISOString(),
          completionTime: timeline.completesAt.toISOString(),
          settlementDueAt: timeline.creditDueAt.toISOString(),
          result: "STARTED",
          activePackageId: null,
          device: input.device ?? null,
        },
      },
    });
    if (isAiAutoTrade) {
      await createNotification(tx, {
        userId: input.userId,
        type: "AI_AUTO_TRADE",
        title: "AI auto trade placed",
        message: AI_AUTO_TRADE_NOTIFICATION_MESSAGE,
        metadata: { tradeId: trade.id, slotId: slot.id, slotOpenTime: slotStart.toISOString(), slotCloseTime: slotEnd.toISOString(), settlementTime: creditDueAt.toISOString(), idempotencyKey: input.idempotencyKey ?? null, tradeCode: null, selectedRow: row.label, vipRank: normalizedVipRank },
      });
    }
    return trade;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function logActiveSubscriptionsSkippedOutsideLiveWindow(now: Date) {
  const subscriptions = await prisma.aiSubscription.findMany({
    where: { active: true, startsAt: { lte: now }, expiresAt: { gt: now } },
    select: {
      userId: true,
      user: { select: { vipRank: true, aiWalletBalance: true } },
    },
    distinct: ["userId"],
    take: 500,
  });
  await Promise.all(subscriptions.map(subscription => {
    const vipLevel = normalizeVipRank(subscription.user.vipRank);
    const row = getVipTradeRowForRank(vipLevel);
    return logAiTradeCycle({
      userId: subscription.userId,
      vipLevel,
      aiSubscriptionStatus: "ACTIVE",
      selectedVipRow: row?.label ?? null,
      currentTradeSlot: null,
      currentTime: now.toISOString(),
      tradeCodeFound: null,
      tradeCodeStatus: null,
      walletBalance: subscription.user.aiWalletBalance.toString(),
      reasonIfSkipped: "No live trade window",
      tradeExecuted: "No",
    });
  }));
  return subscriptions.length;
}

export async function debugAiAutoTradeForUser(input: { userId?: string; uid?: string; testExecute?: boolean; now?: Date }): Promise<AiAutoTradeDebugResult> {
  const now = input.now ?? new Date();
  const userLookup = input.userId ? { id: input.userId } : input.uid ? { uid: input.uid } : null;
  if (!userLookup) throw new Error("userId or uid is required");
  await ensureRequiredTradeSlots();
  await prisma.aiSubscription.updateMany({ where: { active: true, expiresAt: { lte: now } }, data: { active: false } });
  const user = await prisma.user.findUniqueOrThrow({
    where: userLookup,
    select: {
      id: true,
      uid: true,
      email: true,
      vipRank: true,
      status: true,
      aiWalletBalance: true,
      aiTradePrincipal: true,
    },
  });
  const [subscription, slot, tradeWindow] = await Promise.all([
    prisma.aiSubscription.findFirst({ where: { userId: user.id, active: true, startsAt: { lte: now }, expiresAt: { gt: now } }, select: { id: true, expiresAt: true } }),
    findOpenTradeSlot(now),
    getCurrentTradeWindow(now),
  ]);
  const normalizedVipRank = normalizeVipRank(user.vipRank);
  const selectedRow = getVipTradeRowForRank(normalizedVipRank);
  const slotStart = slot ? tradeSlotStart(slot.utcTime, now) : null;
  const slotEnd = slotStart && slot ? new Date(slotStart.getTime() + effectiveTradeSlotDuration(slot.durationMinutes) * 60_000) : null;
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const [dailyTradesUsed, existingWindowTrade] = await Promise.all([
    prisma.copyTrade.count({ where: { userId: user.id, startedAt: { gte: dayStart } } }),
    slot && slotStart && slotEnd
      ? prisma.copyTrade.findFirst({ where: { userId: user.id, slotId: slot.id, windowStartAt: slotStart, windowCloseAt: slotEnd }, select: { source: true } })
      : Promise.resolve(null),
  ]);
  const limit = dailyTradeLimit();
  const aiWalletActive = isAiWalletActive(user);
  const aiWalletActiveAmount = aiWalletBusinessAmount(user);
  const stakeAmount = user.aiWalletBalance.mul(COPY_TRADE_STAKE_RATE);
  const checks = [
    { pass: Boolean(subscription), reason: "AI Subscription is not active" },
    { pass: user.status === UserStatus.ACTIVE, reason: "User account is not active" },
    { pass: Boolean(slot), reason: "Trade window is not LIVE" },
    { pass: dailyTradesUsed < limit, reason: "Daily trade limit reached" },
    { pass: !existingWindowTrade, reason: duplicateTradeWindowMessageForSource(existingWindowTrade?.source) },
    { pass: Boolean(selectedRow), reason: INELIGIBLE_TRADE_MESSAGE },
    { pass: aiWalletActive, reason: "AI Wallet activation required" },
    { pass: stakeAmount.gte(MIN_COPY_TRADE_STAKE), reason: `Copy trade stake must be at least $${MIN_COPY_TRADE_STAKE.toFixed(2)}.` },
    { pass: user.aiWalletBalance.gte(stakeAmount) && user.aiWalletBalance.gt(0), reason: "Insufficient AI Wallet balance" },
  ];
  const skippedReason = checks.find(check => !check.pass)?.reason ?? null;
  const baseResult: AiAutoTradeDebugResult = {
    currentServerTime: now.toISOString(),
    currentTradeSlot: slot && slotStart && slotEnd ? {
      id: slot.id,
      label: slot.label,
      utcTime: slot.utcTime,
      openTime: slotStart.toISOString(),
      closeTime: slotEnd.toISOString(),
      durationMinutes: effectiveTradeSlotDuration(slot.durationMinutes),
    } : null,
    tradeStatus: tradeWindow.status,
    aiSubscriptionStatus: subscription ? "ACTIVE" : "INACTIVE",
    userId: user.id,
    uid: user.uid,
    email: user.email,
    subscriptionExpiry: subscription?.expiresAt.toISOString() ?? null,
    userVipRank: normalizedVipRank,
    selectedVipRow: selectedRow?.label ?? null,
    selectedVipRowId: selectedRow?.id ?? null,
    aiWalletBalance: user.aiWalletBalance.toString(),
    aiWalletActiveAmount: aiWalletActiveAmount.toString(),
    dailyTradesUsed,
    dailyTradeLimit: limit,
    alreadyTradedThisWindow: Boolean(existingWindowTrade),
    existingTradeSource: existingWindowTrade?.source ?? null,
    tradeCodeFound: null,
    tradeCodeStatus: null,
    stakeAmount: stakeAmount.toString(),
    minimumStakeAmount: MIN_COPY_TRADE_STAKE.toString(),
    balanceSufficient: user.aiWalletBalance.gte(stakeAmount) && user.aiWalletBalance.gt(0),
    canAutoTrade: !skippedReason,
    skippedReason,
    wouldExecute: !skippedReason,
    executedTradeId: null,
  };
  await logAiAutoTradeEvent("debug user", baseResult);
  if (!input.testExecute || skippedReason) return baseResult;
  const idempotencyKey = `debug-auto-trade:${user.id}:${slotStart?.toISOString() ?? now.toISOString()}`;
  const executed = await autoExecuteVipCopyTrade({ userId: user.id, now, idempotencyKey });
  return {
    ...baseResult,
    canAutoTrade: Boolean(executed.executed),
    skippedReason: executed.executed ? null : executed.reason ?? "Skipped",
    wouldExecute: true,
    executedTradeId: executed.executed ? executed.tradeId : null,
  };
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
    const aiWalletCredit = trade.principalAmount.add(profitAmount);
    await ensureUserWalletAccounts(tx, trade.userId);
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: "USDT" } });
    const [aiWalletAccount, revenueAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: trade.userId, assetId: asset.id, type: "AI" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
    ]);
    const principalJournal = await postBalancedJournal(tx, {
      referenceType: "COPY_TRADE_PRINCIPAL_RETURN",
      referenceId: trade.id,
      idempotencyKey: `copy-trade-principal-return:${trade.id}`,
      memo: "AI Trade Principal Return",
      lines: [{ accountId: revenueAccount.id, direction: "DEBIT", amount: trade.principalAmount }, { accountId: aiWalletAccount.id, direction: "CREDIT", amount: trade.principalAmount }],
    });
    const profitJournal = await postBalancedJournal(tx, {
      referenceType: "COPY_TRADE_INCOME",
      referenceId: trade.id,
      idempotencyKey: `copy-trade-profit:${trade.id}`,
      memo: "AI Trade Profit",
      lines: [{ accountId: revenueAccount.id, direction: "DEBIT", amount: profitAmount }, { accountId: aiWalletAccount.id, direction: "CREDIT", amount: profitAmount }],
    });
    await tx.income.create({ data: { userId: trade.userId, type: "COPY_TRADE", sourceType: "COPY_TRADE", sourceId: trade.id, amount: profitAmount, copyTradeId: trade.id, ledgerJournalId: profitJournal.id } });
    await createNotification(tx, {
      userId: trade.userId,
      type: "COPY_TRADE_INCOME",
      title: "AI trade settled",
      message: "AI trade settled: principal returned and profit credited.",
      metadata: { tradeId: trade.id, principalReturned: trade.principalAmount.toString(), incomeAmount: profitAmount.toString(), totalCredit: aiWalletCredit.toString(), principalLedgerJournalId: principalJournal.id, profitLedgerJournalId: profitJournal.id },
    });
    const progress = await tx.user.update({
      where: { id: trade.userId },
      data: { aiWalletBalance: { increment: aiWalletCredit }, aiTradeProfitEarned: { increment: profitAmount } },
      select: { aiTradeProfitEarned: true, aiTradePrincipal: true },
    });
    const requiredProfit = progress.aiTradePrincipal.mul("0.60");
    if (requiredProfit.eq(0) || progress.aiTradeProfitEarned.gte(requiredProfit)) {
      await tx.user.update({ where: { id: trade.userId }, data: { aiTradeWithdrawalUnlocked: true } });
    }
    await tx.auditLog.create({
      data: {
        actorId: trade.userId,
        actorType: "SYSTEM",
        action: "COPY_TRADE_INCOME_POSTED",
        entityType: "CopyTrade",
        entityId: trade.id,
        metadata: { tradeId: trade.id, principalReturned: trade.principalAmount.toString(), incomeAmount: profitAmount.toString(), totalCredit: aiWalletCredit.toString(), principalLedgerJournalId: principalJournal.id, profitLedgerJournalId: profitJournal.id, creditedAt: now.toISOString() },
      },
    });
    return tx.copyTrade.update({ where: { id: trade.id }, data: { incomeAmount: profitAmount, incomeCreditedAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function isSettleableTradeStatus(status: TradeStatus) {
  return status === TradeStatus.PENDING || status === TradeStatus.ACTIVE || status === TradeStatus.COMPLETED;
}

async function findOpenTradeSlot(now: Date, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const slots = await configuredTradeSlots(client);
  const live = tradeWindowCandidates(slots, now).find(candidate => candidate.isLive);
  return live?.slot ?? null;
}

export async function getLiveManualTradeWindow(now = new Date()) {
  const slots = await configuredTradeSlots();
  const live = tradeWindowCandidates(slots, now).find(candidate => candidate.isLive);
  if (!live) return null;
  return {
    slotId: live.slot.id,
    slotLabel: live.slot.label,
    windowStartAt: live.start,
    windowCloseAt: live.end,
    settlementDueAt: tradeSlotSettlementTime(live.start),
    serverNow: now,
  };
}

async function getCurrentTradeWindow(now: Date) {
  const slots = await configuredTradeSlots();
  const windows = tradeWindowCandidates(slots, now).sort((a, b) => a.start.getTime() - b.start.getTime());
  const live = windows.find(window => now >= window.start && now < window.end);
  const upcoming = windows.find(window => window.start > now);
  if (live) return tradeWindowPayload("LIVE", live.start, live.end, now, live.slot, upcoming?.slot ?? null, upcoming?.start ?? null, windows);
  if (upcoming) return tradeWindowPayload("UPCOMING", upcoming.start, upcoming.end, now, null, upcoming.slot, upcoming.start, windows);
  return {
    status: "CLOSED" as const,
    nextOpenTime: null,
    openTime: "",
    closeTime: "",
    windowStartAt: null,
    windowCloseAt: null,
    timezone: TRADE_TIMEZONE,
    secondsUntilOpen: 0,
    secondsUntilClose: 0,
    slot: null,
    debug: buildTradeWindowDebug(now, null, null, "CLOSED", 0, 0, windows),
  };
}

function isSlotOpen(utcTime: string, durationMinutes: number, now: Date) {
  return TRADE_WINDOW_DAY_OFFSETS.some(dayOffset => {
    const start = tradeSlotStart(utcTime, now, dayOffset);
    const end = new Date(start.getTime() + effectiveTradeSlotDuration(durationMinutes) * 60_000);
    return now >= start && now < end;
  });
}

function tradeSlotStart(utcTime: string, now: Date, dayOffset = 0) {
  const [hours, minutes] = utcTime.split(":").map(value => Number(value));
  const start = new Date(now);
  start.setUTCHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (dayOffset) start.setUTCDate(start.getUTCDate() + dayOffset);
  return start;
}

function tradeSlotSettlementTime(windowStartAt: Date) {
  return new Date(windowStartAt.getTime() + TRADE_SETTLEMENT_AFTER_START_MINUTES * 60_000);
}

function tradeWindowPayload(status: "LIVE" | "UPCOMING" | "CLOSED", start: Date, end: Date, now: Date, currentSlot: TradeWindowSlot | null, nextSlot: TradeWindowSlot | null, nextStart: Date | null, windows?: ReturnType<typeof tradeWindowCandidates>) {
  const displaySlot = currentSlot ?? nextSlot;
  const secondsUntilOpen = status === "UPCOMING" ? Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 1000)) : 0;
  const secondsUntilClose = status === "LIVE" || status === "UPCOMING" ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 1000)) : 0;
  return {
    status,
    nextOpenTime: nextStart?.toISOString() ?? (status === "UPCOMING" ? start.toISOString() : null),
    openTime: formatTradeDisplayTime(start),
    closeTime: formatTradeDisplayTime(end),
    windowStartAt: start.toISOString(),
    windowCloseAt: end.toISOString(),
    timezone: TRADE_TIMEZONE,
    secondsUntilOpen,
    secondsUntilClose,
    slot: displaySlot ? {
      id: displaySlot.id,
      label: displaySlot.label,
      utcTime: displaySlot.utcTime,
      durationMinutes: effectiveTradeSlotDuration(displaySlot.durationMinutes),
    } : null,
    debug: buildTradeWindowDebug(now, currentSlot, nextSlot, status, secondsUntilOpen, secondsUntilClose, windows),
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
  return Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : TRADE_WINDOW_DURATION_MINUTES;
}

async function ensureRequiredTradeSlots(client: Pick<typeof prisma, "tradeSlot"> = prisma) {
  for (const required of REQUIRED_TRADE_SLOTS) {
    const slot = await client.tradeSlot.findFirst({ where: { label: required.label } });
    if (slot) {
      if (slot.utcTime !== required.utcTime || slot.durationMinutes !== required.durationMinutes || slot.creditDelayMins !== TRADE_WINDOW_DURATION_MINUTES || !slot.enabled) {
        await client.tradeSlot.update({
          where: { id: slot.id },
          data: { utcTime: required.utcTime, durationMinutes: required.durationMinutes, creditDelayMins: TRADE_WINDOW_DURATION_MINUTES, enabled: true },
        });
      }
    } else {
      await client.tradeSlot.create({
        data: { label: required.label, utcTime: required.utcTime, durationMinutes: required.durationMinutes, creditDelayMins: TRADE_WINDOW_DURATION_MINUTES, enabled: true },
      });
    }
  }
}

async function configuredTradeSlots(client: Pick<typeof prisma, "tradeSlot"> = prisma): Promise<TradeWindowSlot[]> {
  await ensureRequiredTradeSlots(client);
  const rows = await client.tradeSlot.findMany({
    where: { label: { in: REQUIRED_TRADE_SLOTS.map(slot => slot.label) } },
    orderBy: { label: "asc" },
  });
  return REQUIRED_TRADE_SLOTS.map(required => {
    const row = rows.find(slot => slot.label === required.label);
    if (!row) throw new Error(`Required trade slot missing after sync: ${required.label}`);
    return {
      id: row.id,
      label: required.label,
      utcTime: required.utcTime,
      durationMinutes: required.durationMinutes,
    };
  });
}

function tradeWindowCandidates(slots: TradeWindowSlot[], now: Date) {
  return slots.flatMap(slot => TRADE_WINDOW_DAY_OFFSETS.map(dayOffset => {
    const start = tradeSlotStart(slot.utcTime, now, dayOffset);
    const durationMinutes = effectiveTradeSlotDuration(slot.durationMinutes);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    return {
      slot,
      dayOffset,
      start,
      end,
      durationMinutes,
      isLive: now >= start && now < end,
      startsInSeconds: Math.ceil((start.getTime() - now.getTime()) / 1000),
      endedSecondsAgo: Math.ceil((now.getTime() - end.getTime()) / 1000),
    };
  }));
}

async function tradeWindowComparisons(now: Date) {
  const [configuredSlots, dbSlots] = await Promise.all([
    configuredTradeSlots(),
    prisma.tradeSlot.findMany({ where: { enabled: true }, orderBy: { utcTime: "asc" } }),
  ]);
  return {
    currentUtcTime: now.toISOString(),
    currentIstTime: formatTradeDebugIst(now),
    sourceOfTruth: "REQUIRED_TRADE_SLOTS",
    configuredSlots: tradeWindowCandidates(configuredSlots, now).map(serializeWindowComparison),
    databaseSlots: tradeWindowCandidates(dbSlots, now).map(serializeWindowComparison),
  };
}

function serializeWindowComparison(window: ReturnType<typeof tradeWindowCandidates>[number]) {
  return {
    label: window.slot.label,
    configuredUtcTime: window.slot.utcTime,
    dayOffset: window.dayOffset,
    durationMinutes: window.durationMinutes,
    openUtc: window.start.toISOString(),
    closeUtc: window.end.toISOString(),
    settlementUtc: tradeSlotSettlementTime(window.start).toISOString(),
    openIst: formatTradeDebugIst(window.start),
    closeIst: formatTradeDebugIst(window.end),
    settlementIst: formatTradeDebugIst(tradeSlotSettlementTime(window.start)),
    nowAfterOrEqualOpen: window.isLive || window.startsInSeconds <= 0,
    nowBeforeClose: window.isLive || window.endedSecondsAgo <= 0,
    isLive: window.isLive,
    startsInSeconds: window.startsInSeconds,
    endedSecondsAgo: window.endedSecondsAgo,
  };
}

function buildTradeWindowDebug(now: Date, currentSlot: TradeWindowSlot | null, nextSlot: TradeWindowSlot | null, tradeStatus: "LIVE" | "UPCOMING" | "CLOSED", secondsUntilOpen: number, secondsUntilClose: number, windows?: ReturnType<typeof tradeWindowCandidates>) {
  return {
    serverNowUTC: now.toISOString(),
    serverNowIST: formatTradeDebugIst(now),
    currentSlot: currentSlot ? serializeDebugSlot(currentSlot) : null,
    nextSlot: nextSlot ? serializeDebugSlot(nextSlot) : null,
    tradeStatus,
    secondsUntilOpen,
    secondsUntilClose,
    windows: windows?.map(serializeWindowComparison) ?? null,
  };
}

function formatTradeDebugIst(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
    timeZone: TRADE_DISPLAY_TIMEZONE,
  }).format(value);
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

async function logAiTradeCycle(entry: AiTradeCycleLog) {
  const payload = {
    event: "AI_TRADE_CYCLE",
    loggedAt: new Date().toISOString(),
    userId: entry.userId,
    vipLevel: entry.vipLevel,
    aiSubscriptionStatus: entry.aiSubscriptionStatus,
    selectedVipRow: entry.selectedVipRow,
    currentTradeSlot: entry.currentTradeSlot,
    currentTime: entry.currentTime,
    tradeCodeFound: entry.tradeCodeFound,
    tradeCodeStatus: entry.tradeCodeStatus,
    walletBalance: entry.walletBalance,
    reasonIfSkipped: entry.reasonIfSkipped,
    tradeExecuted: entry.tradeExecuted,
    tradeId: entry.tradeId ?? null,
  };
  await logAiAutoTradeEvent("cycle", payload);
}

async function logAiAutoTradeEvent(message: string, metadata: Record<string, unknown>) {
  const payload = {
    event: "AI_AUTO_TRADE",
    message,
    loggedAt: new Date().toISOString(),
    ...metadata,
  };
  console.info("[AI_AUTO_TRADE]", payload);
  await mkdir(path.dirname(AI_AUTO_TRADE_LOG_FILE), { recursive: true }).catch(() => null);
  await appendFile(AI_AUTO_TRADE_LOG_FILE, `${JSON.stringify(payload)}\n`, "utf8").catch(error => {
    console.error("[AI_AUTO_TRADE] log write failed", error instanceof Error ? error.message : error);
  });
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

type CopyTradeStatusRecord = Prisma.CopyTradeGetPayload<{ select: typeof copyTradeStatusSelect }>;

function serializeTrade(trade: CopyTradeStatusRecord, now: Date) {
  const amount = Number(trade.principalAmount.toString());
  const returnPercent = Number(trade.returnPercent.toString());
  const profit = Number(((((amount / Number(COPY_TRADE_STAKE_RATE.toString())) * returnPercent) / 100)).toFixed(8));
  return {
    id: trade.id,
    code: trade.code?.code ?? "",
    amount,
    returnPercent,
    profit,
    status: trade.status,
    startedAt: trade.startedAt.toISOString(),
    completesAt: trade.completesAt.toISOString(),
    creditDueAt: trade.creditDueAt.toISOString(),
    windowStartAt: trade.startedAt.toISOString(),
    windowCloseAt: trade.completesAt.toISOString(),
    completedAt: trade.completedAt?.toISOString() ?? null,
    incomeCreditedAt: trade.incomeCreditedAt?.toISOString() ?? null,
    remainingTime: Math.max(0, Math.ceil((trade.creditDueAt.getTime() - now.getTime()) / 1000)),
  };
}
