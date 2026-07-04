import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createDepositRequest, getUserDeposits } from "@/lib/domain/payment-service";

const depositSchema = z.object({
  amount: z.coerce.number().positive(),
  network: z.string().trim().min(1).default("BSC"),
  txHash: z.string().trim().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await getUserDeposits(user.id));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = depositSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid deposit request" }, { status: 400 });
  }
  try {
    const deposit = await createDepositRequest({
      userId: user.id,
      amount: new Prisma.Decimal(parsed.data.amount),
      network: parsed.data.network,
      txHash: parsed.data.txHash,
    });
    return NextResponse.json({ deposit }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deposit request failed" }, { status: 400 });
  }
}
