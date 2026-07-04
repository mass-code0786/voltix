import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdminIncomeHistory, getUserIncomeHistory } from "@/lib/domain/income-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const income = user.role === "ADMIN" || user.role === "SUPER_ADMIN"
    ? await getAdminIncomeHistory()
    : await getUserIncomeHistory(user.id);
  return NextResponse.json(income);
}
