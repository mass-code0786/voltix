import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getManualTradeSignal } from "@/lib/domain/manual-trade-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  try {
    return NextResponse.json(await getManualTradeSignal(user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Manual trade signal unavailable" }, { status: 500 });
  }
}
