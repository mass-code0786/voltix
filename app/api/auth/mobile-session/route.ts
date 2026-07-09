import { NextResponse } from "next/server";
import { z } from "zod";
import { restoreSessionFromToken } from "@/lib/auth";
import { auditFailure, auditSuccess } from "@/lib/audit";

const restoreSchema = z.object({
  token: z.string().min(20).max(512),
});

export async function POST(request: Request) {
  if (request.headers.get("x-voltix-capacitor") !== "1") {
    return NextResponse.json({ error: "Mobile session restore is only available in the Voltix app" }, { status: 403 });
  }
  const parsed = restoreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid mobile session" }, { status: 400 });

  const user = await restoreSessionFromToken(parsed.data.token);
  if (!user) {
    await auditFailure({ request, action: "MOBILE_SESSION_RESTORE", module: "AUTH", description: "Mobile biometric session restore failed" }).catch(() => null);
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  await auditSuccess({ request, userId: user.role === "USER" ? user.id : undefined, adminId: user.role !== "USER" ? user.id : undefined, role: user.role === "USER" ? "USER" : "ADMIN", action: "MOBILE_SESSION_RESTORE", module: "AUTH", description: "Mobile biometric session restored", metadata: { uid: user.uid, email: user.email } }).catch(() => null);
  return NextResponse.json({ authenticated: true, user });
}
