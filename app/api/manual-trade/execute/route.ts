import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { placeGuidedManualTrade } from "@/lib/domain/manual-trade-service";
import { AI_ALREADY_TRADED_IN_WINDOW_MESSAGE, ALREADY_TRADED_IN_WINDOW, AlreadyTradedInWindowError } from "@/lib/domain/trade-service";
import { rateLimitByUser } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

const requestSchema = z.object({
  signalId: z.string().trim().min(1).max(64),
  slotId: z.string().trim().min(1).max(64),
  selectedPair: z.string().trim().regex(/^[A-Za-z0-9/]{5,24}$/),
  clientRequestId: z.string().trim().min(8).max(120),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "manual-trade-execute", 10, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid manual trade request" }, { status: 400 });

  try {
    const result = await placeGuidedManualTrade({
      userId: user.id,
      ...parsed.data,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      device: request.headers.get("user-agent") ?? undefined,
    });
    await auditSuccess({ request, userId: user.id, role: "USER", action: "MANUAL_TRADE_EXECUTE", module: "COPY_TRADE", description: "User executed guided manual trade", newValue: { tradeId: result.trade.id, slotId: parsed.data.slotId, selectedPair: result.selectedPair, idempotent: result.idempotent } }).catch(() => null);
    const displayPair = `${result.selectedPair.slice(0, -4)}/USDT`;
    return NextResponse.json({
      success: true,
      tradeId: result.trade.id,
      pair: displayPair,
      windowLabel: result.windowLabel,
      stakeAmount: Number(result.trade.principalAmount.toString()),
      stakePercent: 1,
      windowCloseAt: result.trade.windowCloseAt?.toISOString() ?? result.trade.completesAt.toISOString(),
      settlementDueAt: result.trade.creditDueAt.toISOString(),
      status: "PLACED",
      idempotent: result.idempotent,
    }, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "MANUAL_TRADE_EXECUTE", module: "COPY_TRADE", description: "Guided manual trade execution failed", metadata: parsed.data, errorMessage: error instanceof Error ? error.message : "Manual trade failed" }).catch(() => null);
    if (error instanceof AlreadyTradedInWindowError) {
      const message = error.message === AI_ALREADY_TRADED_IN_WINDOW_MESSAGE
        ? "An AI trade has already been executed for this trading window."
        : "Your manual trade has already been placed for this trading window.";
      return NextResponse.json({ code: ALREADY_TRADED_IN_WINDOW, error: message }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Manual trade failed" }, { status: 400 });
  }
}
