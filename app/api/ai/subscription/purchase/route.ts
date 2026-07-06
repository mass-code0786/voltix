import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { purchaseAiSubscription } from "@/lib/domain/ai-subscription-service";
import { rateLimitByUser } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "ai-subscription-purchase", 10, 60 * 60 * 1000);
  if (limited) return limited;
  try {
    const result = await purchaseAiSubscription(user.id);
    await auditSuccess({ request, userId: user.id, role: "USER", action: "AI_SUBSCRIPTION_PURCHASE", module: "AI_TRADE", description: "User purchased AI subscription", newValue: result }).catch(() => null);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "AI_SUBSCRIPTION_PURCHASE", module: "AI_TRADE", description: "AI subscription purchase failed", errorMessage: error instanceof Error ? error.message : "AI purchase failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI purchase failed" }, { status: 400 });
  }
}
