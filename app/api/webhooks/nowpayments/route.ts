import { NextResponse } from "next/server";
import { processNowPaymentsIpn } from "@/lib/domain/payment-service";
import { postFirstDepositReferralIncome } from "@/lib/domain/income-service";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/security";
import { auditFailure, auditSuccess, auditWarning } from "@/lib/audit";
import { verifyNowPaymentsSignature } from "@/lib/nowpayments-signature";

export async function POST(request: Request) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return NextResponse.json({ error: "NOWPayments IPN secret is not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-nowpayments-sig") ?? "";
  if (!verifyNowPaymentsSignature(rawBody, signature, secret)) {
    await logInvalidWebhook(request, "INVALID_NOWPAYMENTS_SIGNATURE");
    await auditWarning({ request, role: "SYSTEM", action: "NOWPAYMENTS_WEBHOOK", module: "WEBHOOK", description: "NOWPayments webhook rejected due to invalid signature" }).catch(() => null);
    return NextResponse.json({ error: "Invalid NOWPayments signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const deposit = await processNowPaymentsIpn(payload);
    if (deposit.status === "CREDITED") {
      await postFirstDepositReferralIncome(deposit.id).catch(() => ({ posted: 0 }));
    }
    await auditSuccess({ request, role: "SYSTEM", action: "NOWPAYMENTS_WEBHOOK", module: "WEBHOOK", description: "NOWPayments webhook processed", metadata: { paymentId: payload.payment_id ?? null, orderId: payload.order_id ?? null, depositId: deposit.id, status: deposit.status } }).catch(() => null);
    return NextResponse.json({ accepted: true, deposit });
  } catch (error) {
    await logInvalidWebhook(request, "NOWPAYMENTS_IPN_PROCESSING_FAILED", error instanceof Error ? error.message : "Unknown error");
    await auditFailure({ request, role: "SYSTEM", action: "NOWPAYMENTS_WEBHOOK", module: "WEBHOOK", description: "NOWPayments webhook processing failed", errorMessage: error instanceof Error ? error.message : "NOWPayments IPN processing failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "NOWPayments IPN processing failed" }, { status: 400 });
  }
}

async function logInvalidWebhook(request: Request, action: string, reason?: string) {
  await prisma.auditLog.create({
    data: {
      actorType: "SYSTEM",
      action,
      entityType: "Webhook",
      entityId: "nowpayments",
      ipAddress: clientIp(request),
      metadata: { reason: reason ?? null },
    },
  }).catch(() => null);
}
