import { CodeStatus, Prisma, TradeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MIN_COPY_TRADE_STAKE_USD, dailyTradeLimit, tradeTimeline } from "./trade-rules";
import { postBalancedJournal } from "./ledger";

const COPY_TRADE_STAKE_RATE = new Prisma.Decimal("0.01");
const MIN_COPY_TRADE_STAKE = new Prisma.Decimal(MIN_COPY_TRADE_STAKE_USD);
const INVALID_CODE_MESSAGE = "Invalid copy trade code. Please use a valid code issued by the platform.";
const DEFAULT_TRADE_WINDOW_MINUTES = 10;
const DEFAULT_CODE_EXPIRY_MINUTES = 20;

export async function expireOldTradeCodes(now = new Date()) {
  await prisma.tradeCode.updateMany({
    where: { status: CodeStatus.ACTIVE, expiresAt: { lte: now } },
    data: { status: CodeStatus.EXPIRED },
  });
}

export async function createTradeCode(input: {
  code?: string;
  vipRank: string;
  returnPercent: Prisma.Decimal;
  maxUsage: number;
  createdBy: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const code = input.code?.trim().toUpperCase() || generateTradeCode();
  const slot = await prisma.tradeSlot.findFirst({ where: { enabled: true }, orderBy: { utcTime: "asc" } });
  return prisma.tradeCode.create({
    data: {
      code,
      vipRank: input.vipRank.trim().toUpperCase() || "NONE",
      returnPercent: input.returnPercent,
      maxUsage: input.maxUsage,
      expiresAt: new Date(now.getTime() + DEFAULT_CODE_EXPIRY_MINUTES * 60_000),
      tradeWindowMinutes: DEFAULT_TRADE_WINDOW_MINUTES,
      createdBy: input.createdBy,
      slotId: slot?.id,
    },
  });
}

export async function getAdminTradeCodes(now = new Date()) {
  await expireOldTradeCodes(now);
  return prisma.tradeCode.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
}

export async function getCopyTradeStatus(userId: string, now = new Date()) {
  await settleDueCopyTrades(userId, now);
  await expireOldTradeCodes(now);
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
  return {
    activeTrade: active,
    remainingTime: active?.remainingTime ?? 0,
    eligibility: {
      eligible: remaining > 0 && user.bitexBalance.gt(0),
      reason: remaining <= 0 ? "Daily trade limit reached" : user.bitexBalance.lte(0) ? "Please transfer funds to AI wallet before starting copy trade." : null,
    },
    vipRank: user.vipRank,
    todaysCompletedTrades: completedToday,
    todaysRemainingTrades: remaining,
    history: history.map(trade => serializeTrade(trade, now)),
  };
}

export async function redeemTradeCode(input: { userId: string; code: string; now?: Date; ipAddress?: string; device?: string }) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const normalizedCode = input.code.trim().toUpperCase();
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const code = await tx.tradeCode.findUnique({ where: { code: normalizedCode }, include: { slot: true } });
    const fail = async (reason: string): Promise<never> => {
      await tx.auditLog.create({ data: { actorId: input.userId, actorType: "USER", action: "COPY_TRADE_CODE_REJECTED", entityType: "TradeCode", entityId: code?.id ?? normalizedCode, ipAddress: input.ipAddress, metadata: { userId: input.userId, strategyCode: normalizedCode, result: "REJECTED", reason, device: input.device ?? null, attemptedAt: now.toISOString() } } });
      throw new Error(INVALID_CODE_MESSAGE);
    };
    if (!code) return fail("NOT_FOUND");
    if (code.status !== CodeStatus.ACTIVE) return fail(`STATUS_${code.status}`);
    if (code.expiresAt && code.expiresAt <= now) return fail("EXPIRED");
    if (code.vipRank !== user.vipRank) return fail("VIP_RANK_MISMATCH");
    if (code.assignedUserId && code.assignedUserId !== input.userId) return fail("ASSIGNED_TO_OTHER_USER");
    if (!code.slotId || !code.slot) return fail("NO_TRADE_SLOT");
    if (code.usedCount >= code.maxUsage) return fail("USAGE_LIMIT_EXCEEDED");
    const alreadyUsedByUser = await tx.copyTrade.findFirst({ where: { userId: input.userId, codeId: code.id }, select: { id: true } });
    if (alreadyUsedByUser) return fail("USER_ALREADY_USED_CODE");
    if (user.bitexBalance.lte(0)) throw new Error("Please transfer funds to AI wallet before starting copy trade.");
    const tradeAmount = user.bitexBalance.mul(COPY_TRADE_STAKE_RATE);
    if (tradeAmount.lt(MIN_COPY_TRADE_STAKE)) throw new Error(`Copy trade stake must be at least $${MIN_COPY_TRADE_STAKE.toFixed(2)}.`);

    const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
    const tradesToday = await tx.copyTrade.count({ where: { userId: input.userId, startedAt: { gte: dayStart } } });
    if (tradesToday >= dailyTradeLimit({ joinedAt: user.joinedAt, now, permanentExtraTrade: user.permanentExtraTrade })) throw new Error("Daily trade limit reached");

    const claimed = await tx.tradeCode.updateMany({
      where: { id: code.id, status: CodeStatus.ACTIVE, usedCount: { lt: code.maxUsage } },
      data: { usedCount: { increment: 1 }, ...(code.usedCount + 1 >= code.maxUsage ? { status: CodeStatus.USED } : {}) },
    });
    if (claimed.count !== 1) return fail("CONCURRENT_REPLAY_OR_LIMIT");
    const locked = await tx.user.updateMany({
      where: { id: input.userId, bitexBalance: { gte: tradeAmount } },
      data: { bitexBalance: { decrement: tradeAmount } },
    });
    if (locked.count !== 1) throw new Error("Insufficient AI wallet balance");

    const timeline = tradeTimeline(now, code.tradeWindowMinutes, 0);
    const trade = await tx.copyTrade.create({
      data: { userId: input.userId, codeId: code.id, slotId: code.slotId, principalAmount: tradeAmount, returnPercent: code.returnPercent, status: TradeStatus.ACTIVE, startedAt: now, ...timeline },
    });
    await tx.auditLog.create({ data: { actorId: input.userId, actorType: "USER", action: "COPY_TRADE_STARTED", entityType: "CopyTrade", entityId: trade.id, ipAddress: input.ipAddress, metadata: { userId: input.userId, strategyCode: code.code, tradeAmount: tradeAmount.toString(), profitPercent: code.returnPercent.toString(), startTime: now.toISOString(), completionTime: timeline.completesAt.toISOString(), result: "STARTED", device: input.device ?? null } } });
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
    const profitAmount = trade.principalAmount.mul(trade.returnPercent).div(100);
    const bitexCredit = trade.principalAmount.add(profitAmount);
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: "USDT" } });
    const [bitexAccount, revenueAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: trade.userId, assetId: asset.id, type: "BITEX" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
    ]);
    const journal = await postBalancedJournal(tx, { referenceType: "COPY_TRADE_INCOME", referenceId: trade.id, idempotencyKey: `copy-income:${trade.id}`, memo: "Copy trade principal returned and income credited to AI", lines: [{ accountId: revenueAccount.id, direction: "DEBIT", amount: bitexCredit }, { accountId: bitexAccount.id, direction: "CREDIT", amount: bitexCredit }] });
    await tx.income.create({ data: { userId: trade.userId, type: "COPY_TRADE", sourceType: "COPY_TRADE", sourceId: trade.id, amount: profitAmount, copyTradeId: trade.id, ledgerJournalId: journal.id } });
    const progress = await tx.user.update({
      where: { id: trade.userId },
      data: { bitexBalance: { increment: bitexCredit }, bitexIncomeEarned: { increment: profitAmount } },
      select: { bitexIncomeEarned: true, bitexTargetAmount: true },
    });
    if (progress.bitexTargetAmount.gt(0) && progress.bitexIncomeEarned.gte(progress.bitexTargetAmount)) {
      await tx.user.update({ where: { id: trade.userId }, data: { bitexUnlocked: true } });
    }
    return tx.copyTrade.update({ where: { id: trade.id }, data: { status: "INCOME_CREDITED", incomeAmount: profitAmount, incomeCreditedAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function generateTradeCode() {
  return Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase().padEnd(6, "X");
}

function serializeTrade(trade: Awaited<ReturnType<typeof prisma.copyTrade.findFirst>> & { code?: { code: string } | null }, now: Date) {
  const amount = Number(trade!.principalAmount.toString());
  const returnPercent = Number(trade!.returnPercent.toString());
  const profit = Number((((amount * returnPercent) / 100)).toFixed(8));
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
