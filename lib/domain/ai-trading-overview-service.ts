import { TradeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AiOverviewRange = "today" | "week" | "month";
const IST_OFFSET_MS = 330 * 60_000;

export async function getAiTradingOverview(userId: string, range: AiOverviewRange, now = new Date()) {
  const { start, end } = rangeBounds(range, now);
  const [trades, slots] = await Promise.all([
    prisma.copyTrade.findMany({
      where: { userId, status: TradeStatus.INCOME_CREDITED, incomeCreditedAt: { gte: start, lt: end }, incomeAmount: { not: null } },
      select: { incomeAmount: true, incomeCreditedAt: true, slotId: true },
      orderBy: { incomeCreditedAt: "asc" },
    }),
    range === "today" ? prisma.tradeSlot.findMany({ where: { enabled: true }, select: { id: true, utcTime: true }, orderBy: { utcTime: "asc" } }) : Promise.resolve([]),
  ]);
  const totalIncome = trades.reduce((sum, trade) => sum + Number(trade.incomeAmount?.toString() ?? 0), 0);
  return { range, totalIncome, currency: "USDT", points: buildPoints(range, start, trades, slots) };
}

function rangeBounds(range: AiOverviewRange, now: Date) {
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  let startLocal: number;
  let endLocal: number;
  if (range === "today") {
    startLocal = Date.UTC(year, month, day);
    endLocal = Date.UTC(year, month, day + 1);
  } else if (range === "week") {
    const mondayOffset = (local.getUTCDay() + 6) % 7;
    startLocal = Date.UTC(year, month, day - mondayOffset);
    endLocal = startLocal + 7 * 86_400_000;
  } else {
    startLocal = Date.UTC(year, month, 1);
    endLocal = Date.UTC(year, month + 1, 1);
  }
  return { start: new Date(startLocal - IST_OFFSET_MS), end: new Date(endLocal - IST_OFFSET_MS) };
}

function buildPoints(range: AiOverviewRange, start: Date, trades: { incomeAmount: { toString(): string } | null; incomeCreditedAt: Date | null; slotId: string }[], slots: { id: string; utcTime: string }[]) {
  if (range === "today") {
    const totals = new Map(slots.map(slot => [slot.id, 0]));
    for (const trade of trades) totals.set(trade.slotId, (totals.get(trade.slotId) ?? 0) + Number(trade.incomeAmount?.toString() ?? 0));
    return slots.map(slot => ({ label: formatIstSlotTime(slot.utcTime), value: totals.get(slot.id) ?? 0 }));
  }
  const days = range === "week" ? 7 : daysInIstMonth(start);
  const values = Array.from({ length: days }, () => 0);
  for (const trade of trades) {
    if (!trade.incomeCreditedAt) continue;
    const local = new Date(trade.incomeCreditedAt.getTime() + IST_OFFSET_MS);
    const index = range === "week" ? Math.floor((trade.incomeCreditedAt.getTime() - start.getTime()) / 86_400_000) : local.getUTCDate() - 1;
    if (index >= 0 && index < values.length) values[index] += Number(trade.incomeAmount?.toString() ?? 0);
  }
  const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return values.map((value, index) => ({ label: range === "week" ? weekLabels[index] : String(index + 1), value }));
}

function formatIstSlotTime(utcTime: string) {
  const [hour = 0, minute = 0] = utcTime.split(":").map(Number);
  const totalMinutes = (hour * 60 + minute + 330) % 1440;
  const localHour = Math.floor(totalMinutes / 60);
  const suffix = localHour >= 12 ? "PM" : "AM";
  const hour12 = localHour % 12 || 12;
  const localMinute = totalMinutes % 60;
  return localMinute ? `${hour12}:${String(localMinute).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
}

function daysInIstMonth(start: Date) {
  const local = new Date(start.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
}
