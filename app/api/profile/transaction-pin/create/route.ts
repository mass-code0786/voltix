import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { createTransactionPin } from "@/lib/domain/transaction-pin-service";
import { clientIp, rateLimit, rateLimitByUser } from "@/lib/security";

const schema = z.object({
  pin: z.string().regex(/^\d{6}$/, "Transaction PIN must be exactly 6 digits."),
  confirmPin: z.string().regex(/^\d{6}$/, "Transaction PIN must be exactly 6 digits."),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "transaction-pin-create", 5, 60 * 60 * 1000) ?? rateLimit({ key: `transaction-pin-create:ip:${clientIp(request)}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid Transaction PIN" }, { status: 400 });
  try {
    const result = await createTransactionPin(user.id, parsed.data.pin, parsed.data.confirmPin);
    await auditSuccess({ request, userId: user.id, role: "USER", action: "TRANSACTION_PIN_CREATE", module: "PROFILE", description: "Transaction PIN created" }).catch(() => null);
    return NextResponse.json(result);
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "TRANSACTION_PIN_CREATE", module: "PROFILE", description: "Transaction PIN create failed", errorMessage: error instanceof Error ? error.message : "Transaction PIN create failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transaction PIN create failed" }, { status: 400 });
  }
}
