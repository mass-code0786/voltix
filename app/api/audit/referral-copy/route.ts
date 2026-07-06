import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { auditSuccess } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  await auditSuccess({
    request,
    userId: user.id,
    role: "USER",
    action: "REFERRAL_COPY",
    module: "REFERRAL",
    description: "User copied referral link",
    metadata: { uid: user.uid },
  }).catch(() => null);
  return NextResponse.json({ ok: true });
}
