import { NextResponse } from "next/server";
import { runIncomeScheduler } from "@/lib/domain/income-service";
import { auditFailure, auditSuccess } from "@/lib/audit";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const configuredSecret = process.env.VOLTIX_SCHEDULER_SECRET;
  if (configuredSecret) {
    const provided = request.headers.get("x-scheduler-secret");
    if (provided !== configuredSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await auditSuccess({ request, role: "SYSTEM", action: "SCHEDULER_START", module: "SCHEDULER", description: "Income scheduler started" }).catch(() => null);
  try {
    const result = await runIncomeScheduler();
    await auditSuccess({ request, role: "SYSTEM", action: "SCHEDULER_COMPLETE", module: "SCHEDULER", description: "Income scheduler completed", metadata: result, durationMs: Date.now() - startedAt }).catch(() => null);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    await auditFailure({ request, role: "SYSTEM", action: "SCHEDULER_FAILED", module: "SCHEDULER", description: "Income scheduler failed", errorMessage: error instanceof Error ? error.message : "Scheduler failed", durationMs: Date.now() - startedAt }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduler failed" }, { status: 500 });
  }
}
