import { Prisma } from "@prisma/client";
import { coinCatalog } from "@/lib/coin-list";
import { prisma } from "@/lib/prisma";
import {
  getLiveManualTradeWindow,
  startVipCopyTrade,
} from "./trade-service";
import { getVipTradeRowForRank } from "./trade-rules";

const MANUAL_PAIR_COUNT = 10;
export const WRONG_MANUAL_PAIR_MESSAGE = "That is not the recommended pair for this trading window. Please select the assigned pair.";
export const CLOSED_MANUAL_WINDOW_MESSAGE = "This trading window has closed. Please wait for the next trading window.";

export type ManualSignalPair = {
  symbol: string;
  displayPair: string;
  baseSymbol: string;
  logo: string;
};

export async function getManualTradeSignal(userId?: string, now = new Date()) {
  const window = await getLiveManualTradeWindow(now);
  if (!window) return { live: false as const, serverNow: now.toISOString(), message: "No manual trading window is currently active." };

  const pairs = await deterministicPairsForWindow(window.slotId, window.windowStartAt);
  const seed = `manual-pairs:${window.slotId}:${window.windowStartAt.toISOString()}`;
  const recommendedPair = pairs[hashString(`${seed}:recommended`) % pairs.length];
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
    serverNow: window.serverNow.toISOString(),
    slotId: window.slotId,
    windowStartAt: window.windowStartAt.toISOString(),
    windowCloseAt: window.windowCloseAt.toISOString(),
    recommendedPair: recommendedPair.symbol,
    recommendedDisplayPair: recommendedPair.displayPair,
    pairs,
    blockedMessage,
  };
}

export async function placeGuidedManualTrade(input: { userId: string; slotId: string; selectedPair: string; clientRequestId: string; now?: Date; ipAddress?: string; device?: string }) {
  const now = input.now ?? new Date();
  const selectedPair = normalizePair(input.selectedPair);
  const idempotencyKey = `manual-trade:${input.userId}:${input.clientRequestId}:${selectedPair}`;
  const existingRequest = await prisma.copyTrade.findUnique({ where: { idempotencyKey } });
  if (existingRequest) {
    if (existingRequest.userId !== input.userId) throw new Error("Invalid manual trade request.");
    return { trade: existingRequest, selectedPair, idempotent: true };
  }

  const signal = await getManualTradeSignal(input.userId, now);
  if (!signal.live) throw new Error(CLOSED_MANUAL_WINDOW_MESSAGE);
  if (signal.slotId !== input.slotId) throw new Error(CLOSED_MANUAL_WINDOW_MESSAGE);

  if (!signal.pairs.some(pair => pair.symbol === selectedPair)) throw new Error("Selected pair is not available for this trading window.");
  if (selectedPair !== signal.recommendedPair) throw new Error(WRONG_MANUAL_PAIR_MESSAGE);
  if (signal.blockedMessage) throw new Error(signal.blockedMessage);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { vipRank: true } });
  const row = getVipTradeRowForRank(user.vipRank);
  if (!row) throw new Error("You are not eligible for this trade.");
  const executionNow = input.now ?? new Date();
  if (executionNow >= new Date(signal.windowCloseAt)) throw new Error(CLOSED_MANUAL_WINDOW_MESSAGE);

  try {
    const trade = await startVipCopyTrade({
      userId: input.userId,
      rowId: row.id,
      now: executionNow,
      ipAddress: input.ipAddress,
      device: input.device,
      idempotencyKey,
      expectedSlotId: signal.slotId,
    });
    return { trade, selectedPair, idempotent: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const repeated = await prisma.copyTrade.findUnique({ where: { idempotencyKey } });
      if (repeated?.userId === input.userId) return { trade: repeated, selectedPair, idempotent: true };
    }
    throw error;
  }
}

async function deterministicPairsForWindow(slotId: string, windowStartAt: Date) {
  const databaseCoins = await prisma.coinMetadata.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { symbol: "asc" }],
    select: { symbol: true, pair: true, localLogoPath: true },
  }).catch(() => []);
  const catalogCoins = coinCatalog.filter(coin => coin.enabled !== false).map(coin => ({
    symbol: coin.symbol,
    pair: coin.pair ?? `${coin.symbol}USDT`,
    localLogoPath: coin.localLogoPath ?? `/coin-logos/${coin.symbol.toLowerCase()}.png`,
  }));
  const unique = new Map<string, ManualSignalPair>();
  for (const coin of [...databaseCoins, ...catalogCoins]) {
    const symbol = normalizePair(coin.pair);
    const baseSymbol = symbol.endsWith("USDT") ? symbol.slice(0, -4) : "";
    if (!symbol.endsWith("USDT") || symbol === "USDTUSDT" || !baseSymbol || unique.has(symbol)) continue;
    unique.set(symbol, { symbol, displayPair: `${baseSymbol}/USDT`, baseSymbol, logo: coin.localLogoPath || `/coin-logos/${baseSymbol.toLowerCase()}.png` });
  }
  const candidates = Array.from(unique.values()).slice(0, 40);
  if (candidates.length < MANUAL_PAIR_COUNT) throw new Error("Not enough supported USDT pairs are available.");
  const seed = hashString(`manual-pairs:${slotId}:${windowStartAt.toISOString()}`);
  return seededShuffle(candidates, seed).slice(0, MANUAL_PAIR_COUNT);
}

function seededShuffle<T>(values: readonly T[], initialSeed: number) {
  const result = [...values];
  let seed = initialSeed || 1;
  const random = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
