import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { approveWithdrawalRequest } from "@/lib/domain/payment-service";
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
    const withdrawal = await approveWithdrawalRequest({ withdrawalId: id, adminUserId: admin.user.id });
    await auditSuccess({ request: _request, adminId: admin.user.id, role: "ADMIN", action: "WITHDRAWAL_APPROVE", module: "WITHDRAWAL", description: "Admin approved withdrawal", newValue: withdrawal }).catch(() => null);
    return NextResponse.json({ withdrawal });
  } catch (error) {
    await auditFailure({ request: _request, adminId: admin.user.id, role: "ADMIN", action: "WITHDRAWAL_APPROVE", module: "WITHDRAWAL", description: "Withdrawal approval failed", errorMessage: error instanceof Error ? error.message : "Withdrawal approval failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Withdrawal approval failed" }, { status: 400 });
  }
}
