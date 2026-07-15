import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { rateLimitByAdmin } from "@/lib/security";

export async function POST() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const limited = rateLimitByAdmin(admin.user.id);
  if (limited) return limited;
  return NextResponse.json({ error: "Legacy AI withdrawals are read-only and can no longer be rejected." }, { status: 410 });
}
