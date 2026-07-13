import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateDepositAddresses } from "@/lib/domain/payment-service";
import { rateLimitByUser } from "@/lib/security";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "deposit-addresses", 5, 60 * 60 * 1000);
  if (limited) return limited;
  try {
    return NextResponse.json(await getOrCreateDepositAddresses(user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deposit addresses unavailable" }, { status: 503 });
  }
}
