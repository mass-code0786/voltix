import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createWithdrawalRequest, getUserWithdrawals } from "@/lib/domain/payment-service";

const withdrawalSchema = z.object({
  walletType: z.enum(["SPOT", "BITEX"]),
  amount: z.coerce.number().positive(),
  address: z.string().trim().min(1),
  network: z.string().trim().min(1).default("BSC"),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await getUserWithdrawals(user.id));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = withdrawalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid withdrawal request" }, { status: 400 });
  }
  try {
    const withdrawal = await createWithdrawalRequest({
      userId: user.id,
      walletType: parsed.data.walletType,
      amount: new Prisma.Decimal(parsed.data.amount),
      address: parsed.data.address,
      network: parsed.data.network,
      idempotencyKey: `${user.id}:${Date.now()}:${crypto.randomUUID()}`,
    });
    return NextResponse.json({ withdrawal }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Withdrawal request failed" }, { status: 400 });
  }
}
