import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAiTradingOverview, type AiOverviewRange } from "@/lib/domain/ai-trading-overview-service";

const validRanges = new Set<AiOverviewRange>(["today", "week", "month"]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const requested = new URL(request.url).searchParams.get("range") ?? "week";
  if (!validRanges.has(requested as AiOverviewRange)) return NextResponse.json({ error: "Invalid overview range" }, { status: 400 });
  return NextResponse.json(await getAiTradingOverview(user.id, requested as AiOverviewRange));
}
