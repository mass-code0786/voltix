import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { approveDepositRequest } from "@/lib/domain/payment-service";
import { postFirstDepositReferralIncome } from "@/lib/domain/income-service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  try {
    const { id } = await params;
    const deposit = await approveDepositRequest({ depositId: id, adminUserId: admin.user.id });
    const referral = await postFirstDepositReferralIncome(id, admin.user.id).catch(() => ({ posted: 0 }));
    return NextResponse.json({ deposit, referral });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deposit approval failed" }, { status: 400 });
  }
}
