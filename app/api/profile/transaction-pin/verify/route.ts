import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { verifyTransactionPinForUser } from "@/lib/domain/transaction-pin-service";
import { clientIp, rateLimit, rateLimitByUser } from "@/lib/security";

const schema = z.object({
  transactionPin: z.string().regex(/^\d{6}$/, "Transaction PIN must be exactly 6 digits."),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "transaction-pin-verify", 8, 15 * 60 * 1000) ?? rateLimit({ key: `transaction-pin-verify:ip:${clientIp(request)}`, limit: 20, windowMs: 15 * 60 * 1000 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Transaction PIN." }, { status: 400 });
  try {
    const result = await verifyTransactionPinForUser(user.id, parsed.data.transactionPin);
    await auditSuccess({ request, userId: user.id, role: "USER", action: "TRANSACTION_PIN_VERIFY", module: "PROFILE", description: "Transaction PIN verified" }).catch(() => null);
    return NextResponse.json(result);
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "TRANSACTION_PIN_VERIFY", module: "PROFILE", description: "Transaction PIN verification failed", errorMessage: error instanceof Error ? error.message : "Transaction PIN verification failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Transaction PIN." }, { status: 400 });
  }
}
