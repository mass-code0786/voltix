import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAiSubscriptionStatus } from "@/lib/domain/ai-subscription-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const subscription = await getAiSubscriptionStatus(user.id);
  return NextResponse.json(subscription);
}
