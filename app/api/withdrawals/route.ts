import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createWithdrawalRequest, getUserWithdrawals } from "@/lib/domain/payment-service";
import { rateLimitByUser } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { verifyTransactionPinForUser } from "@/lib/domain/transaction-pin-service";

const withdrawalSchema = z.object({
  walletType: z.enum(["SPOT", "BITEX"]),
  amount: z.coerce.number().positive(),
  address: z.string().trim().min(1),
  network: z.string().trim().min(1).default("BSC"),
  transactionPin: z.string().trim().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await getUserWithdrawals(user.id));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "withdrawals", 10, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = withdrawalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid withdrawal request" }, { status: 400 });
  }
  try {
    const pinLimited = rateLimitByUser(user.id, "transaction-pin-withdrawal", 8, 15 * 60 * 1000);
    if (pinLimited) return pinLimited;
    await verifyTransactionPinForUser(user.id, parsed.data.transactionPin);
    const withdrawal = await createWithdrawalRequest({
      userId: user.id,
      walletType: parsed.data.walletType,
      amount: new Prisma.Decimal(parsed.data.amount),
      address: parsed.data.address,
      network: parsed.data.network,
      idempotencyKey: `${user.id}:${Date.now()}:${crypto.randomUUID()}`,
    });
    await auditSuccess({ request, userId: user.id, role: "USER", action: "WITHDRAWAL_REQUESTED", module: "WITHDRAWAL", description: "User requested withdrawal", newValue: withdrawal }).catch(() => null);
    return NextResponse.json({ withdrawal }, { status: 201 });
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "WITHDRAWAL_REQUESTED", module: "WITHDRAWAL", description: "Withdrawal request failed", errorMessage: error instanceof Error ? error.message : "Withdrawal request failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Withdrawal request failed" }, { status: 400 });
  }
}
