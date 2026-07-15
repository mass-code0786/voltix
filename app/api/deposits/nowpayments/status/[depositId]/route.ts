import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserDepositStatus } from "@/lib/domain/payment-service";

export async function GET(_request: Request, context: { params: Promise<{ depositId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { depositId } = await context.params;
  try {
    return NextResponse.json({ deposit: await getUserDepositStatus({ userId: user.id, depositId }) });
  } catch {
    return NextResponse.json({ error: "Deposit status is unavailable" }, { status: 404 });
  }
}
