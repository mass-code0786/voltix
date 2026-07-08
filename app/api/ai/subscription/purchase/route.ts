import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ACTIVE_SUBSCRIPTION_EXISTS, ActiveSubscriptionExistsError, purchaseAiSubscription } from "@/lib/domain/ai-subscription-service";
import { rateLimitByUser } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "ai-subscription-purchase", 10, 60 * 60 * 1000);
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as { idempotencyKey?: string } | null;
  const idempotencyKey = body?.idempotencyKey?.trim() || request.headers.get("idempotency-key")?.trim() || crypto.randomUUID();
  try {
    const result = await purchaseAiSubscription(user.id, idempotencyKey);
    await auditSuccess({ request, userId: user.id, role: "USER", action: "AI_SUBSCRIPTION_PURCHASE", module: "AI_TRADE", description: "User purchased AI subscription", newValue: result }).catch(() => null);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "AI_SUBSCRIPTION_PURCHASE", module: "AI_TRADE", description: "AI subscription purchase failed", errorMessage: error instanceof Error ? error.message : "AI purchase failed" }).catch(() => null);
    if (error instanceof ActiveSubscriptionExistsError) {
      return NextResponse.json({ code: ACTIVE_SUBSCRIPTION_EXISTS, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI purchase failed" }, { status: 400 });
  }
}
