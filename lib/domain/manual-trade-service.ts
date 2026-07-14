import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getLiveManualTradeWindow,
  startVipCopyTrade,
} from "./trade-service";
import { getVipTradeRowForRank } from "./trade-rules";
import { getOrCreateTradeWindowSignal, parseTradeSignalPairs, TRADE_SIGNAL_PAIR_COUNT, type TradeSignalPair } from "./trade-window-signal";

export const WRONG_MANUAL_PAIR_MESSAGE = "That is not the recommended pair for this trading window. Please select the highlighted pair.";
export const CLOSED_MANUAL_WINDOW_MESSAGE = "This trading window has ended. Please wait for the next trading window.";

export type ManualSignalPair = TradeSignalPair;

export async function getManualTradeSignal(userId?: string, now = new Date()) {
  const window = await getLiveManualTradeWindow(now);
  if (!window) return { live: false as const, serverNow: now.toISOString(), message: "No manual trading window is currently active." };

  const stored = await getOrCreateTradeWindowSignal({ ...window, windowLabel: window.slotLabel });
  const pairs = parseTradeSignalPairs(stored.pairs);
  const recommendedPair = pairs.find(pair => pair.symbol === stored.recommendedPair);
  if (!recommendedPair || pairs.length !== TRADE_SIGNAL_PAIR_COUNT) throw new Error("Stored manual trade signal is invalid.");
  const existingTrade = userId ? await prisma.copyTrade.findFirst({
    where: { userId, slotId: window.slotId, windowStartAt: window.windowStartAt, windowCloseAt: window.windowCloseAt },
    select: { source: true },
  }) : null;
  const blockedMessage = existingTrade
    ? existingTrade.source === "AI_SUBSCRIPTION_AUTO" || existingTrade.source === "AI_SUBSCRIPTION"
      ? "An AI trade has already been executed for this trading window."
      : "Your manual trade has already been placed for this trading window."
    : null;

  return {
    live: true as const,
    signalId: stored.id,
    occurrenceKey: stored.occurrenceKey,
    serverNow: window.serverNow.toISOString(),
    slotId: window.slotId,
    windowLabel: stored.windowLabel,
    windowStartAt: window.windowStartAt.toISOString(),
    windowCloseAt: window.windowCloseAt.toISOString(),
    settlementDueAt: stored.settlementDueAt.toISOString(),
    recommendedPair: recommendedPair.symbol,
    recommendedDisplayPair: recommendedPair.displayPair,
    pairs,
    blockedMessage,
  };
}

export async function placeGuidedManualTrade(input: { userId: string; signalId: string; slotId: string; selectedPair: string; clientRequestId: string; now?: Date; ipAddress?: string; device?: string }) {
  const now = input.now ?? new Date();
  const selectedPair = normalizePair(input.selectedPair);
  const idempotencyKey = `manual-trade:${input.userId}:${input.clientRequestId}:${selectedPair}`;
  const signal = await getManualTradeSignal(input.userId, now);
  if (!signal.live) throw new Error(CLOSED_MANUAL_WINDOW_MESSAGE);
  if (signal.signalId !== input.signalId || signal.slotId !== input.slotId) throw new Error(CLOSED_MANUAL_WINDOW_MESSAGE);

  if (!signal.pairs.some(pair => pair.symbol === selectedPair)) throw new Error("Selected pair is not available for this trading window.");
  if (selectedPair !== signal.recommendedPair) throw new Error(WRONG_MANUAL_PAIR_MESSAGE);
  if (signal.blockedMessage) throw new Error(signal.blockedMessage);

  const existingRequest = await prisma.copyTrade.findUnique({ where: { idempotencyKey } });
  if (existingRequest) {
    if (existingRequest.userId !== input.userId) throw new Error("Invalid manual trade request.");
    return { trade: existingRequest, selectedPair, windowLabel: signal.windowLabel, idempotent: true };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { vipRank: true } });
  const row = getVipTradeRowForRank(user.vipRank);
  if (!row) throw new Error("You are not eligible for this trade.");
  const executionNow = input.now ?? new Date();
  if (executionNow >= new Date(signal.windowCloseAt)) throw new Error(CLOSED_MANUAL_WINDOW_MESSAGE);

  try {
    const trade = await startVipCopyTrade({
      userId: input.userId,
      rowId: row.id,
      pair: selectedPair,
      now: executionNow,
      ipAddress: input.ipAddress,
      device: input.device,
      idempotencyKey,
      expectedSlotId: signal.slotId,
    });
    return { trade, selectedPair, windowLabel: signal.windowLabel, idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const repeated = await prisma.copyTrade.findUnique({ where: { idempotencyKey } });
      if (repeated?.userId === input.userId) return { trade: repeated, selectedPair, windowLabel: signal.windowLabel, idempotent: true };
    }
    throw error;
  }
}

function normalizePair(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function validateManualTradeFunds(userId: string, amount: Prisma.Decimal) {
  if (amount.lte(0)) throw new Error("Manual trade amount must be positive");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { futuresBalance: true } });
  if (user.futuresBalance.lt(amount)) throw new Error("Please transfer funds to Futures wallet before starting manual trade.");
  return true;
}
