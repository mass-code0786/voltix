import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCopyTradeStatus } from "@/lib/domain/trade-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      status: {
        activeTrade: null,
        remainingTime: 0,
        eligibility: { eligible: false, reason: "Login required" },
        vipRank: null,
        todaysCompletedTrades: 0,
        todaysRemainingTrades: 0,
        history: [],
      },
    }, { status: 401 });
  }

  const status = await getCopyTradeStatus(user.id);
  return NextResponse.json({ authenticated: true, status });
}
