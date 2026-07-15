import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createNowPaymentsDeposit } from "@/lib/domain/payment-service";
import { rateLimitByUser } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { NowPaymentsApiError } from "@/lib/domain/nowpayments-client";

const createSchema = z.object({
  amount: z.coerce.number().positive(),
  network: z.string().trim().min(1).default("BSC"),
  payCurrency: z.string().trim().min(2).max(16).default("usdtbsc"),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const limited = rateLimitByUser(user.id, "nowpayments-create", 10, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid deposit request" }, { status: 400 });
  }
  try {
    const deposit = await createNowPaymentsDeposit({
      userId: user.id,
      amount: new Prisma.Decimal(parsed.data.amount),
      network: parsed.data.network,
      payCurrency: parsed.data.payCurrency,
    });
    await auditSuccess({ request, userId: user.id, role: "USER", action: "DEPOSIT_CREATED", module: "DEPOSIT", description: "NOWPayments deposit created", newValue: deposit }).catch(() => null);
    return NextResponse.json({ deposit }, { status: 201 });
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "DEPOSIT_CREATED", module: "DEPOSIT", description: "NOWPayments deposit creation failed", errorMessage: error instanceof Error ? error.message : "NOWPayments deposit creation failed" }).catch(() => null);
    const status = error instanceof NowPaymentsApiError && error.status === 503 ? 503 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "NOWPayments deposit creation failed" }, { status });
  }
}
