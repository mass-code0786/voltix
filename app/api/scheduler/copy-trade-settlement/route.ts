import { NextResponse } from "next/server";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { settleDueCopyTrades } from "@/lib/domain/trade-service";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const configuredSecret = process.env.VOLTIX_SCHEDULER_SECRET;
  if (configuredSecret) {
    const provided = request.headers.get("x-scheduler-secret");
    if (provided !== configuredSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await auditSuccess({ request, role: "SYSTEM", action: "COPY_TRADE_SETTLEMENT_START", module: "SCHEDULER", description: "Copy trade settlement started" }).catch(() => null);
  try {
    const result = await settleDueCopyTrades();
    await auditSuccess({ request, role: "SYSTEM", action: "COPY_TRADE_SETTLEMENT_COMPLETE", module: "SCHEDULER", description: "Copy trade settlement completed", metadata: result, durationMs: Date.now() - startedAt }).catch(() => null);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await auditFailure({ request, role: "SYSTEM", action: "COPY_TRADE_SETTLEMENT_FAILED", module: "SCHEDULER", description: "Copy trade settlement failed", errorMessage: error instanceof Error ? error.message : "Copy trade settlement failed", durationMs: Date.now() - startedAt }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Copy trade settlement failed" }, { status: 500 });
  }
}
