import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/auth";
import { adjustAdminWallet } from "@/lib/domain/admin-wallet-adjustment-service";
import { postFirstDepositReferralIncome } from "@/lib/domain/income-service";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { rateLimitByUser } from "@/lib/security";

const adjustSchema = z.object({
  userId: z.string().min(1, "User is required"),
  walletType: z.enum(["SPOT", "FUTURES", "AI"]),
  action: z.enum(["CREDIT", "DEBIT"]),
  amount: z.coerce.number().positive("Amount must be positive"),
  asset: z.literal("USDT").default("USDT"),
  reason: z.string().trim().min(3, "Reason is required").max(240, "Reason is too long"),
  idempotencyKey: z.string().trim().min(8, "Idempotency key is required").max(120, "Idempotency key is too long"),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const limited = rateLimitByUser(admin.user.id, "admin-wallet-adjustment", 20, 60 * 1000);
  if (limited) {
    await auditFailure({ request, adminId: admin.user.id, role: "ADMIN", action: "ADMIN_WALLET_ADJUST", module: "WALLET", description: "Admin wallet adjustment rate limited", errorMessage: "Too many wallet adjustment requests" }).catch(() => null);
    return limited;
  }

  const parsed = adjustSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid wallet adjustment";
    await auditFailure({ request, adminId: admin.user.id, role: "ADMIN", action: "ADMIN_WALLET_ADJUST", module: "WALLET", description: "Admin wallet adjustment validation failed", errorMessage: message }).catch(() => null);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const adjustment = await adjustAdminWallet({
      adminUserId: admin.user.id,
      userId: parsed.data.userId,
      walletType: parsed.data.walletType,
      action: parsed.data.action,
      amount: new Prisma.Decimal(parsed.data.amount),
      asset: parsed.data.asset,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const referral = adjustment.action === "CREDIT" && adjustment.walletType === "SPOT" && adjustment.depositId
      ? await postFirstDepositReferralIncome(adjustment.depositId, admin.user.id).catch(() => ({ posted: 0 }))
      : { posted: 0 };

    await auditSuccess({
      request,
      adminId: admin.user.id,
      userId: parsed.data.userId,
      role: "ADMIN",
      action: parsed.data.action === "CREDIT" ? "ADMIN_WALLET_CREDIT" : "ADMIN_WALLET_DEBIT",
      module: "WALLET",
      description: "Admin adjusted user wallet balance",
      newValue: { adjustment, referral },
      metadata: {
        adjustmentId: adjustment.id,
        userId: parsed.data.userId,
        walletType: parsed.data.walletType,
        action: parsed.data.action,
        amount: String(parsed.data.amount),
        asset: parsed.data.asset,
        reason: parsed.data.reason,
        status: adjustment.status,
      },
    }).catch(() => null);

    return NextResponse.json({ adjustment, referral });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Wallet adjustment failed";
    await auditFailure({
      request,
      adminId: admin.user.id,
      userId: parsed.data.userId,
      role: "ADMIN",
      action: parsed.data.action === "CREDIT" ? "ADMIN_WALLET_CREDIT" : "ADMIN_WALLET_DEBIT",
      module: "WALLET",
      description: "Admin wallet adjustment failed",
      errorMessage: message,
      metadata: {
        userId: parsed.data.userId,
        walletType: parsed.data.walletType,
        action: parsed.data.action,
        amount: String(parsed.data.amount),
        asset: parsed.data.asset,
        reason: parsed.data.reason,
      },
    }).catch(() => null);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
