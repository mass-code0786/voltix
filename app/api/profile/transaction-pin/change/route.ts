import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { changeTransactionPin } from "@/lib/domain/transaction-pin-service";
import { clientIp, rateLimit, rateLimitByUser } from "@/lib/security";

const schema = z.object({
  currentPin: z.string().regex(/^\d{6}$/, "Transaction PIN must be exactly 6 digits."),
  newPin: z.string().regex(/^\d{6}$/, "Transaction PIN must be exactly 6 digits."),
  confirmPin: z.string().regex(/^\d{6}$/, "Transaction PIN must be exactly 6 digits."),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "transaction-pin-change", 5, 60 * 60 * 1000) ?? rateLimit({ key: `transaction-pin-change:ip:${clientIp(request)}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid Transaction PIN" }, { status: 400 });
  try {
    const result = await changeTransactionPin(user.id, parsed.data.currentPin, parsed.data.newPin, parsed.data.confirmPin);
    await auditSuccess({ request, userId: user.id, role: "USER", action: "TRANSACTION_PIN_CHANGE", module: "PROFILE", description: "Transaction PIN changed" }).catch(() => null);
    return NextResponse.json(result);
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "TRANSACTION_PIN_CHANGE", module: "PROFILE", description: "Transaction PIN change failed", errorMessage: error instanceof Error ? error.message : "Transaction PIN change failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transaction PIN change failed" }, { status: 400 });
  }
}
