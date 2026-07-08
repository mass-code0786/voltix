import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ALREADY_TRADED_IN_WINDOW, AlreadyTradedInWindowError, startVipCopyTrade } from "@/lib/domain/trade-service";
import { rateLimitByUser } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "copy-trade-execute", 10, 60 * 60 * 1000);
  if (limited) return limited;

  const body = await request.json().catch(() => null) as { rowId?: string } | null;
  const rowId = body?.rowId?.trim();
  if (!rowId) return NextResponse.json({ error: "Trade row is required" }, { status: 400 });

  try {
    const trade = await startVipCopyTrade({ userId: user.id, rowId });
    await auditSuccess({ request, userId: user.id, role: "USER", action: "COPY_TRADE_EXECUTE", module: "COPY_TRADE", description: "User executed copy trade", newValue: { tradeId: trade.id, rowId, amount: trade.principalAmount.toString(), status: trade.status } }).catch(() => null);
    return NextResponse.json({
      trade: {
        id: trade.id,
        rowId,
        amount: Number(trade.principalAmount.toString()),
        returnPercent: Number(trade.returnPercent.toString()),
        status: trade.status,
        startedAt: trade.startedAt.toISOString(),
        completesAt: trade.completesAt.toISOString(),
        creditDueAt: trade.creditDueAt.toISOString(),
        settlementDueAt: trade.creditDueAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "COPY_TRADE_EXECUTE", module: "COPY_TRADE", description: "Copy trade execution failed", metadata: { rowId }, errorMessage: error instanceof Error ? error.message : "Copy trade failed" }).catch(() => null);
    if (error instanceof AlreadyTradedInWindowError) {
      return NextResponse.json({ code: ALREADY_TRADED_IN_WINDOW, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Copy trade failed" }, { status: 400 });
  }
}
