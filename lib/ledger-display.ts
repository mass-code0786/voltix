import { formatLedgerStatus } from "@/lib/format-ledger-status";
import { formatLocalDateTime } from "@/lib/local-time";

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
  return formatLocalDateTime(timestamp);
}

export function tradePlacementTitle(source?: string | null) {
  const normalized = source?.trim().toUpperCase();
  if (normalized === "NEW_DEPOSITOR_EXTRA") return "Additional Trade Placed";
  if (normalized === "AI_SUBSCRIPTION_AUTO" || normalized === "AI_SUBSCRIPTION") return "AI Trade Placed";
  if (normalized === "MANUAL") return "Manual Trade Placed";
  return "Trade Placed";
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
