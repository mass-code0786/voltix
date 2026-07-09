import { NextResponse } from "next/server";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { runAiAutoTradeScheduler } from "@/lib/domain/trade-service";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const configuredSecret = process.env.VOLTIX_SCHEDULER_SECRET;
  if (configuredSecret) {
    const provided = request.headers.get("x-scheduler-secret");
    if (provided !== configuredSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await auditSuccess({ request, role: "SYSTEM", action: "AI_AUTO_TRADE_SCHEDULER_START", module: "SCHEDULER", description: "AI auto trade scheduler started" }).catch(() => null);
  try {
    const result = await runAiAutoTradeScheduler();
    await auditSuccess({ request, role: "SYSTEM", action: "AI_AUTO_TRADE_SCHEDULER_COMPLETE", module: "SCHEDULER", description: "AI auto trade scheduler completed", metadata: result, durationMs: Date.now() - startedAt }).catch(() => null);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await auditFailure({ request, role: "SYSTEM", action: "AI_AUTO_TRADE_SCHEDULER_FAILED", module: "SCHEDULER", description: "AI auto trade scheduler failed", errorMessage: error instanceof Error ? error.message : "AI auto trade scheduler failed", durationMs: Date.now() - startedAt }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI auto trade scheduler failed" }, { status: 500 });
  }
}
