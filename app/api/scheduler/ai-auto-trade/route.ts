import { NextResponse } from "next/server";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { runAiAutoTradeScheduler } from "@/lib/domain/trade-service";
import { runNewDepositorExtraTradeScheduler } from "@/lib/domain/new-depositor-promotion";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const configuredSecret = process.env.VOLTIX_SCHEDULER_SECRET;
  if (configuredSecret) {
    const provided = request.headers.get("x-scheduler-secret");
    if (provided !== configuredSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await auditSuccess({ request, role: "SYSTEM", action: "AI_AUTO_TRADE_SCHEDULER_START", module: "SCHEDULER", description: "AI auto trade scheduler started" }).catch(() => null);
  try {
    const promotion = await runNewDepositorExtraTradeScheduler();
    const result = await runAiAutoTradeScheduler();
    const combined = { ...result, newDepositorPromotion: promotion };
    await auditSuccess({ request, role: "SYSTEM", action: "AI_AUTO_TRADE_SCHEDULER_COMPLETE", module: "SCHEDULER", description: "AI auto trade scheduler completed", metadata: combined, durationMs: Date.now() - startedAt }).catch(() => null);
    return NextResponse.json({ ok: true, result: combined });
  } catch (error) {
    await auditFailure({ request, role: "SYSTEM", action: "AI_AUTO_TRADE_SCHEDULER_FAILED", module: "SCHEDULER", description: "AI auto trade scheduler failed", errorMessage: error instanceof Error ? error.message : "AI auto trade scheduler failed", durationMs: Date.now() - startedAt }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI auto trade scheduler failed" }, { status: 500 });
  }
}
