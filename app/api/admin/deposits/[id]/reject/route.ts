import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { rejectDepositRequest } from "@/lib/domain/payment-service";
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
    const deposit = await rejectDepositRequest({ depositId: id, adminUserId: admin.user.id, reason: typeof body.reason === "string" ? body.reason : undefined });
    await auditSuccess({ request, adminId: admin.user.id, role: "ADMIN", action: "DEPOSIT_REJECT", module: "DEPOSIT", description: "Admin rejected deposit", newValue: deposit, metadata: { reason: typeof body.reason === "string" ? body.reason : null } }).catch(() => null);
    return NextResponse.json({ deposit });
  } catch (error) {
    await auditFailure({ request, adminId: admin.user.id, role: "ADMIN", action: "DEPOSIT_REJECT", module: "DEPOSIT", description: "Deposit rejection failed", errorMessage: error instanceof Error ? error.message : "Deposit rejection failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deposit rejection failed" }, { status: 400 });
  }
}
