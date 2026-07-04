import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { approveWithdrawalRequest } from "@/lib/domain/payment-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  try {
    const { id } = await params;
    const withdrawal = await approveWithdrawalRequest({ withdrawalId: id, adminUserId: admin.user.id });
    return NextResponse.json({ withdrawal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Withdrawal approval failed" }, { status: 400 });
  }
}
