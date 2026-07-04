import { NextResponse } from "next/server";
import { runIncomeScheduler } from "@/lib/domain/income-service";

export async function POST(request: Request) {
  const configuredSecret = process.env.VOLTIX_SCHEDULER_SECRET;
  if (configuredSecret) {
    const provided = request.headers.get("x-scheduler-secret");
    if (provided !== configuredSecret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runIncomeScheduler();
  return NextResponse.json({ ok: true, result });
}
