import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitByUser } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Confirm password must match",
  path: ["confirmPassword"],
});

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const userLimited = rateLimitByUser(currentUser.id, "password-change", 5, 60 * 60 * 1000);
  if (userLimited) return userLimited;
  const ipLimited = rateLimit({ key: `password-change:ip:${clientIp(request)}`, limit: 5, windowMs: 60 * 60 * 1000 });
  if (ipLimited) return ipLimited;

  const parsed = passwordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid password details" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { id: true, passwordHash: true },
  });
  if (!user || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    await auditFailure({ request, userId: currentUser.id, role: "USER", action: "PASSWORD_CHANGE", module: "PROFILE", description: "Password change failed", errorMessage: "Current password is incorrect" }).catch(() => null);
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  await auditSuccess({ request, userId: user.id, role: "USER", action: "PASSWORD_CHANGE", module: "PROFILE", description: "Password changed successfully" }).catch(() => null);
  return NextResponse.json({ ok: true });
}
