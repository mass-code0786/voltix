export const BASE_DAILY_TRADES = 3;
export const EXTRA_TRADE_TRIAL_DAYS = 5;
export const REQUIRED_QUALIFIED_DIRECTS = 5;
export const MIN_QUALIFIED_PACKAGE_USD = 50;
export const RETURN_PERCENT_MIN = 2;
export const RETURN_PERCENT_MAX = 2.5;
export const COPY_TRADE_STAKE_RATE = 0.01;
export const MIN_COPY_TRADE_STAKE_USD = 1;

export function isValidUid(uid: string) {
  return /^\d{6,12}$/.test(uid);
}

export function dailyTradeLimit(input: {
  joinedAt: Date;
  now: Date;
  permanentExtraTrade: boolean;
}) {
  const trialEnd = new Date(input.joinedAt);
  trialEnd.setUTCDate(trialEnd.getUTCDate() + EXTRA_TRADE_TRIAL_DAYS);
  return BASE_DAILY_TRADES + (input.permanentExtraTrade || input.now < trialEnd ? 1 : 0);
}

export function qualifiesForPermanentExtraTrade(directPackagesUsd: number[]) {
  return directPackagesUsd.filter((amount) => amount >= MIN_QUALIFIED_PACKAGE_USD).length >= REQUIRED_QUALIFIED_DIRECTS;
}

export function calculateTradeIncome(principal: number, returnPercent: number) {
  if (returnPercent < RETURN_PERCENT_MIN || returnPercent > RETURN_PERCENT_MAX) {
    throw new Error("Trade return must be between 2% and 2.5%");
  }
  if (principal <= 0) throw new Error("Principal must be positive");
  return Number(((principal * returnPercent) / 100).toFixed(8));
}

export function calculateCopyTradeStake(bitexBalance: number) {
  if (bitexBalance <= 0) throw new Error("Please transfer funds to AI wallet before starting copy trade.");
  const stake = bitexBalance * COPY_TRADE_STAKE_RATE;
  if (stake < MIN_COPY_TRADE_STAKE_USD) throw new Error(`Copy trade stake must be at least $${MIN_COPY_TRADE_STAKE_USD.toFixed(2)}.`);
  return Number(stake.toFixed(8));
}

export function tradeTimeline(startedAt: Date, durationMinutes = 20, creditDelayMinutes = 10) {
  const completesAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
  const creditDueAt = new Date(completesAt.getTime() + creditDelayMinutes * 60_000);
  return { completesAt, creditDueAt };
}
