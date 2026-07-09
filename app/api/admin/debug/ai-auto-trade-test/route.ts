import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { debugAiAutoTradeForUser } from "@/lib/domain/trade-service";

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;

  const body = await request.json().catch(() => null) as { userId?: string; uid?: string; testExecute?: boolean } | null;
  const userId = body?.userId?.trim();
  const uid = body?.uid?.trim();
  if (!userId && !uid) return NextResponse.json({ error: "userId or uid is required" }, { status: 400 });

  try {
    const result = await debugAiAutoTradeForUser({ userId, uid, testExecute: body?.testExecute === true });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI auto trade debug failed" }, { status: 400 });
  }
}
