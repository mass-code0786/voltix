import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { approveDepositRequest } from "@/lib/domain/payment-service";
import { postFirstDepositReferralIncome } from "@/lib/domain/income-service";
import { rateLimitByAdmin } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const limited = rateLimitByAdmin(admin.user.id);
  if (limited) return limited;
  try {
    const { id } = await params;
    const deposit = await approveDepositRequest({ depositId: id, adminUserId: admin.user.id });
    const referral = await postFirstDepositReferralIncome(id, admin.user.id).catch(() => ({ posted: 0 }));
    await auditSuccess({ request: _request, adminId: admin.user.id, role: "ADMIN", action: "DEPOSIT_APPROVE", module: "DEPOSIT", description: "Admin approved deposit", newValue: { deposit, referral } }).catch(() => null);
    return NextResponse.json({ deposit, referral });
  } catch (error) {
    await auditFailure({ request: _request, adminId: admin.user.id, role: "ADMIN", action: "DEPOSIT_APPROVE", module: "DEPOSIT", description: "Deposit approval failed", errorMessage: error instanceof Error ? error.message : "Deposit approval failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deposit approval failed" }, { status: 400 });
  }
}
