import { formatLedgerStatus } from "@/lib/format-ledger-status";

type LedgerDisplayInput = {
  title?: string | null;
  status?: string | null;
  referenceType?: string | null;
  type?: string | null;
  source?: string | null;
  createdAt?: string | Date | null;
};

export function getLedgerDisplay(entry: LedgerDisplayInput) {
  const tradePlacement = isTradePlacement(entry);
  return {
    title: tradePlacement ? tradePlacementTitle(entry.source) : safeLedgerTitle(entry.title),
    statusLabel: formatLedgerStatus(entry.status || ""),
    dateTimeLabel: formatLedgerDateTime(entry.createdAt),
  };
}

export function formatLedgerDateTime(timestamp: string | Date | null | undefined) {
  if (!timestamp) return "Date unavailable";
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.day} ${value.month} ${value.year} • ${value.hour}:${value.minute} ${(value.dayPeriod || "").toUpperCase()} IST`;
}

export function tradePlacementTitle(source?: string | null) {
  const normalized = source?.trim().toUpperCase();
  if (normalized === "AI_SUBSCRIPTION_AUTO" || normalized === "AI_SUBSCRIPTION") return "AI Trade Placed Successfully";
  if (normalized === "MANUAL") return "Manual Trade Placed Successfully";
  return "Trade Placed Successfully";
}

function isTradePlacement(entry: LedgerDisplayInput) {
  const key = `${entry.referenceType || ""}:${entry.type || ""}`.toUpperCase();
  return key.includes("COPY_TRADE") && !key.includes("INCOME") && !key.includes("PRINCIPAL_RETURN");
}

function safeLedgerTitle(title?: string | null) {
  if (!title) return "Wallet Activity";
  if (/principal\s+(locked|deducted)|locked\s+principal/i.test(title)) return "Trade Placed Successfully";
  return title;
}
