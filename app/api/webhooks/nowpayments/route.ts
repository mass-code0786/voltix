import { NextResponse } from "next/server";
import { processNowPaymentsIpn } from "@/lib/domain/payment-service";
import { postFirstDepositReferralIncome } from "@/lib/domain/income-service";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/security";
import { auditFailure, auditSuccess, auditWarning } from "@/lib/audit";
import { validateNowPaymentsSignature } from "@/lib/nowpayments-signature";

export async function POST(request: Request) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return NextResponse.json({ error: "NOWPayments IPN secret is not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-nowpayments-sig") ?? "";
  const payload = parsePayload(rawBody);
  const signatureResult = validateNowPaymentsSignature(rawBody, signature, secret);
  const diagnostics = webhookDiagnostics(payload, signatureResult.verified);
  console.info("NOWPayments IPN received", diagnostics);
  if (!signatureResult.verified) {
    console.warn("NOWPayments IPN rejected", { ...diagnostics, reason: signatureResult.reason });
    await logInvalidWebhook(request, "INVALID_NOWPAYMENTS_SIGNATURE", signatureResult.reason ?? undefined, diagnostics);
    await auditWarning({ request, role: "SYSTEM", action: "NOWPAYMENTS_WEBHOOK", module: "WEBHOOK", description: "NOWPayments webhook rejected due to invalid signature", metadata: { ...diagnostics, reason: signatureResult.reason } }).catch(() => null);
    return NextResponse.json({ error: "Invalid NOWPayments signature" }, { status: 401 });
  }

  try {
    if (!payload) throw new Error("NOWPayments callback body is not valid JSON");
    const deposit = await processNowPaymentsIpn(payload, { signatureVerified: true });
    if (deposit.status === "COMPLETED") {
      await postFirstDepositReferralIncome(deposit.id).catch(() => ({ posted: 0 }));
    }
    console.info("NOWPayments IPN processed", { ...diagnostics, depositId: deposit.id, localStatus: deposit.status, creditedAt: deposit.creditedAt });
    await auditSuccess({ request, role: "SYSTEM", action: "NOWPAYMENTS_WEBHOOK", module: "WEBHOOK", description: "NOWPayments webhook processed", metadata: { ...diagnostics, orderId: payload.order_id ?? null, depositId: deposit.id, localStatus: deposit.status, creditedAt: deposit.creditedAt } }).catch(() => null);
    return NextResponse.json({ accepted: true, deposit });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.error("NOWPayments IPN processing failed", { ...diagnostics, reason });
    await logInvalidWebhook(request, "NOWPAYMENTS_IPN_PROCESSING_FAILED", reason, diagnostics);
    await auditFailure({ request, role: "SYSTEM", action: "NOWPAYMENTS_WEBHOOK", module: "WEBHOOK", description: "NOWPayments webhook processing failed", errorMessage: error instanceof Error ? error.message : "NOWPayments IPN processing failed" }).catch(() => null);
    return NextResponse.json({ error: "NOWPayments IPN could not be processed" }, { status: 400 });
  }
}

function parsePayload(rawBody: string) {
  try { return JSON.parse(rawBody) as Record<string, unknown>; } catch { return null; }
}

function webhookDiagnostics(payload: Record<string, unknown> | null, signatureVerified: boolean) {
  const payCurrency = payload?.pay_currency ?? null;
  return {
    paymentId: payload?.payment_id ?? null,
    paymentStatus: payload?.payment_status ?? null,
    actuallyPaid: payload?.actually_paid ?? null,
    payAmount: payload?.pay_amount ?? null,
    payCurrency,
    network: payload?.network ?? (payCurrency === "usdtbsc" ? "BSC" : payCurrency === "usdttrc20" ? "TRON" : null),
    txHash: payload?.payin_hash ?? payload?.outcome_hash ?? null,
    signatureVerified,
  };
}

async function logInvalidWebhook(request: Request, action: string, reason?: string, diagnostics?: ReturnType<typeof webhookDiagnostics>) {
  await prisma.auditLog.create({
    data: {
      actorType: "SYSTEM",
      action,
      entityType: "Webhook",
      entityId: "nowpayments",
      ipAddress: clientIp(request),
      metadata: { ...diagnostics, reason: reason ?? null },
    },
  }).catch(() => null);
}
