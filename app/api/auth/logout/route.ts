import { NextResponse } from "next/server";
import { clearSession, getCurrentUser } from "@/lib/auth";
import { auditSuccess } from "@/lib/audit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  await clearSession();
  if (user) {
    await auditSuccess({ request, userId: user.role === "USER" ? user.id : undefined, adminId: user.role !== "USER" ? user.id : undefined, role: user.role === "USER" ? "USER" : "ADMIN", action: user.role === "USER" ? "LOGOUT" : "ADMIN_LOGOUT", module: "AUTH", description: `${user.role === "USER" ? "User" : "Admin"} logged out`, metadata: { uid: user.uid, email: user.email } }).catch(() => null);
  }
  return NextResponse.json({ authenticated: false, user: null });
}
