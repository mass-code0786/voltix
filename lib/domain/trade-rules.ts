export const BASE_DAILY_TRADES = 3;
export const RETURN_PERCENT_MIN = 2;
export const RETURN_PERCENT_MAX = 2.5;
export const COPY_TRADE_STAKE_RATE = 0.01;
export const MIN_COPY_TRADE_STAKE_USD = 1;

export type VipTradeRow = {
  id: string;
  label: string;
  vipRanks: string[];
  dailyPercentMin: number;
  dailyPercentMax: number;
};

export const VIP_TRADE_ROWS: VipTradeRow[] = [
  { id: "vip-0", label: "VIP 0", vipRanks: ["VIP0"], dailyPercentMin: 1, dailyPercentMax: 1.1 },
  { id: "vip-1-2", label: "VIP 1 / VIP 2", vipRanks: ["VIP1", "VIP2"], dailyPercentMin: 1.1, dailyPercentMax: 1.2 },
  { id: "vip-3-4", label: "VIP 3 / VIP 4", vipRanks: ["VIP3", "VIP4"], dailyPercentMin: 1.2, dailyPercentMax: 1.3 },
  { id: "vip-5-6", label: "VIP 5 / VIP 6", vipRanks: ["VIP5", "VIP6"], dailyPercentMin: 1.3, dailyPercentMax: 1.4 },
  { id: "vip-7-10", label: "VIP 7 / VIP 8 / VIP 9 / VIP 10", vipRanks: ["VIP7", "VIP8", "VIP9", "VIP10"], dailyPercentMin: 1.4, dailyPercentMax: 1.5 },
];

export function isValidUid(uid: string) {
  return /^\d{6,12}$/.test(uid);
}

export function dailyTradeLimit() {
  return BASE_DAILY_TRADES;
}

export function calculateTradeIncome(principal: number, returnPercent: number) {
  if (returnPercent < RETURN_PERCENT_MIN || returnPercent > RETURN_PERCENT_MAX) {
    throw new Error("Trade return must be between 2% and 2.5%");
  }
  if (principal <= 0) throw new Error("Principal must be positive");
  return Number(((principal * returnPercent) / 100).toFixed(8));
}

export function calculateCopyTradeStake(bitexBalance: number) {
  if (bitexBalance <= 0) throw new Error("Please transfer funds to AI Wallet before starting copy trade.");
  const stake = bitexBalance * COPY_TRADE_STAKE_RATE;
  if (stake < MIN_COPY_TRADE_STAKE_USD) throw new Error(`Copy trade stake must be at least $${MIN_COPY_TRADE_STAKE_USD.toFixed(2)}.`);
  return Number(stake.toFixed(8));
}

export function normalizeVipRank(rank?: string | null) {
  const value = (rank ?? "NONE").trim().toUpperCase().replace(/\s+/g, "");
  if (!value || value === "NONE") return "VIP0";
  const numeric = value.match(/^(?:VIP)?(\d{1,2})$/);
  if (!numeric) return value;
  const level = Number(numeric[1]);
  return level >= 0 && level <= 10 ? `VIP${level}` : value;
}

export function getVipTradeRow(rowId: string) {
  return VIP_TRADE_ROWS.find(row => row.id === rowId) ?? null;
}

export function getVipTradeRowForRank(rank?: string | null) {
  const normalized = normalizeVipRank(rank);
  return VIP_TRADE_ROWS.find(row => row.vipRanks.includes(normalized)) ?? null;
}

export function getVipDailyIncomePercent(rank?: string | null) {
  return getVipTradeRowForRank(rank)?.dailyPercentMin ?? 1;
}

export function tradeTimeline(startedAt: Date, durationMinutes = 15, creditDelayMinutes = 15) {
  const completesAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
  const creditDueAt = new Date(completesAt.getTime() + creditDelayMinutes * 60_000);
  return { completesAt, creditDueAt };
}
