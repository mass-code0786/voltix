import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { AdditionalTradePlacementError, placeNewDepositorAdditionalTrade } from "@/lib/domain/new-depositor-promotion";
import { rateLimitByUser } from "@/lib/security";

const messages = {
  WINDOW_ENDED: "This Additional Trade window has ended. Please wait for the next eligible opportunity.",
  ALREADY_PLACED: "Your Additional Trade has already been placed for this occurrence.",
  NOT_ELIGIBLE: "You are not eligible for this Additional Trade.",
  INSUFFICIENT_BALANCE: "Insufficient AI Wallet balance to place this trade.",
} as const;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "additional-trade-execute", 10, 60 * 60 * 1000);
  if (limited) return limited;

  try {
    const result = await placeNewDepositorAdditionalTrade(user.id);
    const trade = result.trade;
    const pair = displayPair(trade.pair);
    await auditSuccess({
      request,
      userId: user.id,
      role: "USER",
      action: "ADDITIONAL_TRADE_EXECUTE",
      module: "COPY_TRADE",
      description: "User placed Additional Trade",
      newValue: { tradeId: trade.id, occurrenceKey: result.occurrenceKey, pair, promotionDay: trade.promotionDay, idempotent: result.idempotent },
    }).catch(() => null);
    return NextResponse.json({
      success: true,
      tradeId: trade.id,
      occurrenceKey: result.occurrenceKey,
      pair,
      tradeAmount: Number(trade.principalAmount.toString()),
      walletSnapshot: Number(trade.walletSnapshotAtTrade.toString()),
      profitRate: Number(trade.selectedRate.toString()),
      calculatedProfit: Number(trade.calculatedProfit.toString()),
      promotionDay: trade.promotionDay,
      totalPromotionDays: 10,
      windowCloseAt: trade.windowCloseAt?.toISOString() ?? null,
      settlementDueAt: trade.creditDueAt.toISOString(),
      status: "PLACED",
      idempotent: result.idempotent,
    }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    const code = error instanceof AdditionalTradePlacementError ? error.code : "NOT_ELIGIBLE";
    await auditFailure({ request, userId: user.id, role: "USER", action: "ADDITIONAL_TRADE_EXECUTE", module: "COPY_TRADE", description: "Additional Trade placement failed", errorMessage: code }).catch(() => null);
    return NextResponse.json({ code, error: messages[code] }, { status: code === "ALREADY_PLACED" ? 409 : 400 });
  }
}

function displayPair(value: string | null) {
  if (!value) return "Pair unavailable";
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.endsWith("USDT") ? `${normalized.slice(0, -4)}/USDT` : normalized;
}
