import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { reviewKyc } from "@/lib/domain/kyc-support-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const kyc = await reviewKyc({ id, adminUserId: admin.user.id, status: "REJECTED", reason: typeof body.reason === "string" ? body.reason : undefined });
    return NextResponse.json({ kyc });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "KYC rejection failed" }, { status: 400 });
  }
}
