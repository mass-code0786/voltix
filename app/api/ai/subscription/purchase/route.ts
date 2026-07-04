import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { purchaseAiSubscription } from "@/lib/domain/ai-subscription-service";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  try {
    const result = await purchaseAiSubscription(user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI purchase failed" }, { status: 400 });
  }
}
