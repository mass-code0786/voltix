import { Prisma, type PrismaClient } from "@prisma/client";
import { coinCatalog } from "@/lib/coin-list";
import { prisma } from "@/lib/prisma";

export const TRADE_SIGNAL_PAIR_COUNT = 10;

export type TradeSignalPair = {
  symbol: string;
  displayPair: string;
  baseSymbol: string;
  logo: string;
};

type SignalClient = Pick<PrismaClient, "manualTradeSignal" | "coinMetadata"> | Prisma.TransactionClient;

type TradeWindowSignalInput = {
  slotId: string;
  windowLabel: string;
  windowStartAt: Date;
  windowCloseAt: Date;
  settlementDueAt: Date;
};

export async function getOrCreateTradeWindowSignal(window: TradeWindowSignalInput, client: SignalClient = prisma) {
  const occurrenceKey = tradeWindowSignalOccurrenceKey(window.slotId, window.windowStartAt);
  const existing = await client.manualTradeSignal.findUnique({ where: { occurrenceKey } });
  if (existing) return existing;

  const generatedPairs = await deterministicPairsForWindow(client, window.slotId, window.windowStartAt);
  const seed = `manual-pairs:${window.slotId}:${window.windowStartAt.toISOString()}`;
  const recommendedPair = generatedPairs[hashString(`${seed}:recommended`) % generatedPairs.length];
  return client.manualTradeSignal.upsert({
    where: { occurrenceKey },
    update: {},
    create: {
      occurrenceKey,
      slotId: window.slotId,
      windowLabel: window.windowLabel,
      windowStartAt: window.windowStartAt,
      windowCloseAt: window.windowCloseAt,
      settlementDueAt: window.settlementDueAt,
      pairs: generatedPairs as unknown as Prisma.InputJsonValue,
      recommendedPair: recommendedPair.symbol,
    },
  });
}

export async function getPersistedTradeWindowSignal(window: Pick<TradeWindowSignalInput, "slotId" | "windowStartAt" | "windowCloseAt">, client: SignalClient = prisma) {
  const occurrenceKey = tradeWindowSignalOccurrenceKey(window.slotId, window.windowStartAt);
  const signal = await client.manualTradeSignal.findUnique({ where: { occurrenceKey } });
  if (!signal || !matchesTradeWindowSignalOccurrence(signal, window)) return null;
  return signal;
}

export function matchesTradeWindowSignalOccurrence(
  signal: { occurrenceKey: string; slotId: string; windowStartAt: Date; windowCloseAt: Date; recommendedPair: string },
  window: Pick<TradeWindowSignalInput, "slotId" | "windowStartAt" | "windowCloseAt">,
) {
  return signal.occurrenceKey === tradeWindowSignalOccurrenceKey(window.slotId, window.windowStartAt)
    && signal.slotId === window.slotId
    && signal.windowStartAt.getTime() === window.windowStartAt.getTime()
    && signal.windowCloseAt.getTime() === window.windowCloseAt.getTime()
    && Boolean(signal.recommendedPair.trim());
}

export function tradeWindowSignalOccurrenceKey(slotId: string, windowStartAt: Date) {
  return `manual-signal:${slotId}:${windowStartAt.toISOString()}`;
}

export function parseTradeSignalPairs(value: Prisma.JsonValue): TradeSignalPair[] {
  return value as unknown as TradeSignalPair[];
}

async function deterministicPairsForWindow(client: SignalClient, slotId: string, windowStartAt: Date) {
  const databaseCoins = await client.coinMetadata.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { symbol: "asc" }],
    select: { symbol: true, pair: true, localLogoPath: true },
  }).catch(() => []);
  const catalogCoins = coinCatalog.filter(coin => coin.enabled !== false).map(coin => ({
    symbol: coin.symbol,
    pair: coin.pair ?? `${coin.symbol}USDT`,
    localLogoPath: coin.localLogoPath ?? `/coin-logos/${coin.symbol.toLowerCase()}.png`,
  }));
  const unique = new Map<string, TradeSignalPair>();
  for (const coin of [...databaseCoins, ...catalogCoins]) {
    const symbol = normalizePair(coin.pair);
    const baseSymbol = symbol.endsWith("USDT") ? symbol.slice(0, -4) : "";
    if (!symbol.endsWith("USDT") || symbol === "USDTUSDT" || !baseSymbol || unique.has(symbol)) continue;
    unique.set(symbol, { symbol, displayPair: `${baseSymbol}/USDT`, baseSymbol, logo: coin.localLogoPath || `/coin-logos/${baseSymbol.toLowerCase()}.png` });
  }
  const candidates = Array.from(unique.values()).slice(0, 40);
  if (candidates.length < TRADE_SIGNAL_PAIR_COUNT) throw new Error("Not enough supported USDT pairs are available.");
  const seed = hashString(`manual-pairs:${slotId}:${windowStartAt.toISOString()}`);
  return seededShuffle(candidates, seed).slice(0, TRADE_SIGNAL_PAIR_COUNT);
}

function normalizePair(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.endsWith("USDT") ? normalized : `${normalized}USDT`;
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
