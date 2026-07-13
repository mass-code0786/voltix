import { formatLocalDateTime } from "@/lib/local-time";

export function promotionNotificationDetails(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const value = metadata as Record<string, unknown>;
  if (!value.promotionDay) return [];
  const details: string[] = [];
  if (typeof value.pair === "string") details.push(`Pair: ${displayPair(value.pair)}`);
  if (value.tradeAmount != null) details.push(`Trade amount: ${value.tradeAmount} USDT`);
  details.push(`Promotion Day: ${value.promotionDay} of ${value.totalPromotionDays ?? 10}`);
  if (value.principalReturned != null) details.push(`Principal returned: ${value.principalReturned} USDT`);
  if (value.incomeAmount != null) details.push(`Profit credited: ${value.incomeAmount} USDT`);
  if (value.profitPercent != null) details.push(`Profit percentage: ${value.profitPercent}%`);
  if (typeof value.settlementDueAt === "string") details.push(`Settlement: ${formatLocalDateTime(value.settlementDueAt)}`);
  return details;
}

function displayPair(pair: string) {
  const normalized = pair.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.endsWith("USDT") ? `${normalized.slice(0, -4)}/USDT` : pair;
}
