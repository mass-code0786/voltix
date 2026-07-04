import { Prisma, TradeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MIN_COPY_TRADE_STAKE_USD, VIP_TRADE_ROWS, dailyTradeLimit, getVipDailyIncomePercent, getVipTradeRow, getVipTradeRowForRank, normalizeVipRank, tradeTimeline } from "./trade-rules";
import { postBalancedJournal } from "./ledger";
import { createNotification } from "./notification-service";

const COPY_TRADE_STAKE_RATE = new Prisma.Decimal("0.01");
const MIN_COPY_TRADE_STAKE = new Prisma.Decimal(MIN_COPY_TRADE_STAKE_USD);
const INELIGIBLE_TRADE_MESSAGE = "You are not eligible for this trade.";
const TRADE_UNAVAILABLE_MESSAGE = "Trade not available.";

export async function getCopyTradeStatus(userId: string, now = new Date()) {
  await settleDueCopyTrades(userId, now);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { joinedAt: true, permanentExtraTrade: true, vipRank: true, bitexBalance: true },
  });
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const [activeTrade, completedToday, totalToday, history] = await Promise.all([
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
  ]);
  const limit = dailyTradeLimit({ joinedAt: user.joinedAt, now, permanentExtraTrade: user.permanentExtraTrade });
  const remaining = Math.max(0, limit - totalToday);
  const active = activeTrade ? serializeTrade(activeTrade, now) : null;
  const tradeWindow = await getCurrentTradeWindow(now);
  const normalizedVipRank = normalizeVipRank(user.vipRank);
  const tradeAmount = user.bitexBalance.mul(COPY_TRADE_STAKE_RATE);
  return {
    activeTrade: active,
    remainingTime: active?.remainingTime ?? 0,
    eligibility: {
      eligible: remaining > 0 && user.bitexBalance.gt(0),
      reason: remaining <= 0 ? "Daily trade limit reached" : user.bitexBalance.lte(0) ? "Please transfer funds to AI wallet before starting copy trade." : null,
    },
    vipRank: normalizedVipRank,
    todaysCompletedTrades: completedToday,
    todaysRemainingTrades: remaining,
    tradeRows: VIP_TRADE_ROWS.map(row => ({
      ...row,
      eligible: row.vipRanks.includes(normalizedVipRank),
      available: tradeWindow.status === "Live",
      tradeAmount: Number(tradeAmount.toString()),
      perTradePercent: Number(new Prisma.Decimal(row.dailyPercentMin).div(limit).toString()),
      currentTradeTime: tradeWindow.time,
      tradeStatus: tradeWindow.status,
      message: tradeWindow.status === "Live" ? null : TRADE_UNAVAILABLE_MESSAGE,
    })),
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

    const slot = await findOpenTradeSlot(now, tx);
    if (!slot) throw new Error(TRADE_UNAVAILABLE_MESSAGE);
    const activePackage = await tx.userPackage.findFirst({
      where: { userId: input.userId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true },
    });
    if (!activePackage) throw new Error("Active package required.");
    if (user.bitexBalance.lte(0)) throw new Error("Please transfer funds to AI wallet before starting copy trade.");
    const tradeAmount = user.bitexBalance.mul(COPY_TRADE_STAKE_RATE);
    if (tradeAmount.lt(MIN_COPY_TRADE_STAKE)) throw new Error(`Copy trade stake must be at least $${MIN_COPY_TRADE_STAKE.toFixed(2)}.`);

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const tradesToday = await tx.copyTrade.count({ where: { userId: input.userId, startedAt: { gte: dayStart } } });
    const limit = dailyTradeLimit({ joinedAt: user.joinedAt, now, permanentExtraTrade: user.permanentExtraTrade });
    if (tradesToday >= limit) throw new Error("Daily trade limit reached");
    const slotStart = tradeSlotStart(slot.utcTime, now);
    const slotEnd = new Date(slotStart.getTime() + slot.durationMinutes * 60_000);
    const existingSlotTrade = await tx.copyTrade.findFirst({
      where: { userId: input.userId, slotId: slot.id, startedAt: { gte: slotStart, lt: slotEnd } },
      select: { id: true },
    });
    if (existingSlotTrade) throw new Error("Trade already executed for this slot.");

    const locked = await tx.user.updateMany({
      where: { id: input.userId, bitexBalance: { gte: tradeAmount } },
      data: { bitexBalance: { decrement: tradeAmount } },
    });
    if (locked.count !== 1) throw new Error("Insufficient AI wallet balance");

    const dailyPercent = new Prisma.Decimal(getVipDailyIncomePercent(normalizedVipRank));
    const perTradePercent = dailyPercent.div(limit);
    const timeline = tradeTimeline(now, slot.durationMinutes, slot.creditDelayMins);
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
      message: `${profitAmount.toString()} USDT income has been credited to your AI wallet.`,
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
  const slots = await client.tradeSlot.findMany({ where: { enabled: true }, orderBy: { utcTime: "asc" } });
  return slots.find(slot => isSlotOpen(slot.utcTime, slot.durationMinutes, now)) ?? null;
}

async function getCurrentTradeWindow(now: Date) {
  const slots = await prisma.tradeSlot.findMany({ where: { enabled: true }, orderBy: { utcTime: "asc" } });
  const openSlot = slots.find(slot => isSlotOpen(slot.utcTime, slot.durationMinutes, now));
  if (openSlot) return { time: openSlot.utcTime, status: "Live" as const };
  const upcoming = slots.find(slot => tradeSlotStart(slot.utcTime, now) > now);
  if (upcoming) return { time: upcoming.utcTime, status: "Upcoming" as const };
  return { time: slots.at(-1)?.utcTime ?? "--:--", status: "Closed" as const };
}

function isSlotOpen(utcTime: string, durationMinutes: number, now: Date) {
  const start = tradeSlotStart(utcTime, now);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return now >= start && now < end;
}

function tradeSlotStart(utcTime: string, now: Date) {
  const [hours, minutes] = utcTime.split(":").map(value => Number(value));
  const start = new Date(now);
  start.setUTCHours(Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return start;
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
