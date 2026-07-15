import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createNowPaymentsDeposit } from "@/lib/domain/payment-service";
import { rateLimitByUser } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { NowPaymentsApiError, nowPaymentsDepositUserMessage } from "@/lib/domain/nowpayments-client";

const createSchema = z.object({
  amount: z.coerce.number().positive(),
  network: z.string().trim().min(1).default("BSC"),
  payCurrency: z.string().trim().min(2).max(16).default("usdtbsc"),
  clientRequestId: z.string().uuid(),
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
      clientRequestId: parsed.data.clientRequestId,
    });
    await auditSuccess({ request, userId: user.id, role: "USER", action: "DEPOSIT_CREATED", module: "DEPOSIT", description: "NOWPayments deposit created", newValue: deposit }).catch(() => null);
    return NextResponse.json({ deposit }, { status: 201 });
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "DEPOSIT_CREATED", module: "DEPOSIT", description: "NOWPayments deposit creation failed", errorMessage: error instanceof Error ? error.message : "NOWPayments deposit creation failed" }).catch(() => null);
    const status = error instanceof NowPaymentsApiError && error.status === 503 ? 503 : 400;
    const message = error instanceof NowPaymentsApiError
      ? nowPaymentsDepositUserMessage(error, parsed.data.payCurrency)
      : error instanceof Error ? error.message : "NOWPayments deposit creation failed";
    return NextResponse.json({ error: message }, { status });
  }
}
