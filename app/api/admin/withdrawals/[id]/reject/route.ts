import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { rejectWithdrawalRequest } from "@/lib/domain/payment-service";
import { rateLimitByAdmin } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const limited = rateLimitByAdmin(admin.user.id);
  if (limited) return limited;
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const withdrawal = await rejectWithdrawalRequest({ withdrawalId: id, adminUserId: admin.user.id, reason: typeof body.reason === "string" ? body.reason : undefined });
    await auditSuccess({ request, adminId: admin.user.id, role: "ADMIN", action: "WITHDRAWAL_REJECT", module: "WITHDRAWAL", description: "Admin rejected withdrawal", newValue: withdrawal, metadata: { reason: typeof body.reason === "string" ? body.reason : null } }).catch(() => null);
    return NextResponse.json({ withdrawal });
  } catch (error) {
    await auditFailure({ request, adminId: admin.user.id, role: "ADMIN", action: "WITHDRAWAL_REJECT", module: "WITHDRAWAL", description: "Withdrawal rejection failed", errorMessage: error instanceof Error ? error.message : "Withdrawal rejection failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Withdrawal rejection failed" }, { status: 400 });
  }
}
