import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { redeemTradeCode } from "@/lib/domain/trade-service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const body = await request.json().catch(() => null) as { code?: string } | null;
  const code = body?.code?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Copy trade code is required" }, { status: 400 });

  try {
    const trade = await redeemTradeCode({ userId: user.id, code });
    return NextResponse.json({
      trade: {
        id: trade.id,
        code,
        amount: Number(trade.principalAmount.toString()),
        returnPercent: Number(trade.returnPercent.toString()),
        status: trade.status,
        startedAt: trade.startedAt.toISOString(),
        completesAt: trade.completesAt.toISOString(),
        creditDueAt: trade.creditDueAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Copy trade failed" }, { status: 400 });
  }
}
