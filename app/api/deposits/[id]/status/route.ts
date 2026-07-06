import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserDepositStatus } from "@/lib/domain/payment-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  try {
    const { id } = await params;
    return NextResponse.json({ deposit: await getUserDepositStatus({ userId: user.id, depositId: id }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deposit status unavailable" }, { status: 404 });
  }
}
