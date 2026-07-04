import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { rejectWithdrawalRequest } from "@/lib/domain/payment-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const withdrawal = await rejectWithdrawalRequest({ withdrawalId: id, adminUserId: admin.user.id, reason: typeof body.reason === "string" ? body.reason : undefined });
    return NextResponse.json({ withdrawal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Withdrawal rejection failed" }, { status: 400 });
  }
}
