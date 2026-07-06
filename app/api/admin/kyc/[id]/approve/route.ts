import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { reviewKyc } from "@/lib/domain/kyc-support-service";
import { rateLimitByAdmin } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const limited = rateLimitByAdmin(admin.user.id);
  if (limited) return limited;
  const { id } = await params;
  try {
    const kyc = await reviewKyc({ id, adminUserId: admin.user.id, status: "APPROVED" });
    await auditSuccess({ request: _request, adminId: admin.user.id, role: "ADMIN", action: "KYC_APPROVE", module: "KYC", description: "Admin approved KYC request", newValue: kyc }).catch(() => null);
    return NextResponse.json({ kyc });
  } catch (error) {
    await auditFailure({ request: _request, adminId: admin.user.id, role: "ADMIN", action: "KYC_APPROVE", module: "KYC", description: "KYC approval failed", errorMessage: error instanceof Error ? error.message : "KYC approval failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "KYC approval failed" }, { status: 400 });
  }
}
