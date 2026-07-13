import { NextResponse } from "next/server";
import { processNowPaymentsPayoutIpn } from "@/lib/domain/payment-service";
import { verifyNowPaymentsSignature } from "@/lib/nowpayments-signature";
import { auditFailure, auditSuccess, auditWarning } from "@/lib/audit";

export async function POST(request: Request) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret) return NextResponse.json({ error: "NOWPayments IPN secret is not configured" }, { status: 503 });
  const rawBody = await request.text();
  const signature = request.headers.get("x-nowpayments-sig") ?? "";
  if (!verifyNowPaymentsSignature(rawBody, signature, secret)) {
    await auditWarning({ request, role: "SYSTEM", action: "NOWPAYMENTS_PAYOUT_WEBHOOK", module: "WITHDRAWAL", description: "NOWPayments payout webhook rejected due to invalid signature" }).catch(() => null);
    return NextResponse.json({ error: "Invalid NOWPayments signature" }, { status: 401 });
  }
  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const withdrawal = await processNowPaymentsPayoutIpn(payload);
    await auditSuccess({ request, role: "SYSTEM", action: "NOWPAYMENTS_PAYOUT_WEBHOOK", module: "WITHDRAWAL", description: "NOWPayments payout webhook processed", metadata: { payoutId: payload.id ?? payload.payout_id ?? null, withdrawalId: withdrawal.id, status: withdrawal.status } }).catch(() => null);
    return NextResponse.json({ accepted: true, withdrawal });
  } catch (error) {
    await auditFailure({ request, role: "SYSTEM", action: "NOWPAYMENTS_PAYOUT_WEBHOOK", module: "WITHDRAWAL", description: "NOWPayments payout webhook failed", errorMessage: error instanceof Error ? error.message : "Payout webhook failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payout webhook failed" }, { status: 400 });
  }
}
