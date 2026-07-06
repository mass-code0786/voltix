import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/auth";
import { reviewKyc } from "@/lib/domain/kyc-support-service";
import { rateLimitByAdmin } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

const rejectSchema = z.object({
  reason: z.string().trim().min(3, "Rejection reason is required").max(500),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const limited = rateLimitByAdmin(admin.user.id);
  if (limited) return limited;
  const { id } = await params;
  const parsed = rejectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid rejection reason" }, { status: 400 });
  try {
    const kyc = await reviewKyc({ id, adminUserId: admin.user.id, status: "REJECTED", reason: parsed.data.reason });
    await auditSuccess({ request, adminId: admin.user.id, role: "ADMIN", action: "KYC_REJECT", module: "KYC", description: "Admin rejected KYC request", newValue: kyc, metadata: { reason: parsed.data.reason } }).catch(() => null);
    return NextResponse.json({ kyc });
  } catch (error) {
    await auditFailure({ request, adminId: admin.user.id, role: "ADMIN", action: "KYC_REJECT", module: "KYC", description: "KYC rejection failed", errorMessage: error instanceof Error ? error.message : "KYC rejection failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "KYC rejection failed" }, { status: 400 });
  }
}
