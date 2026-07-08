import { NextResponse } from "next/server";
import { getCurrentUser, clearSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditSuccess } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, expiresAt: true },
  });
  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { transactionPinSetAt: true },
  });
  return NextResponse.json({
    sessions: sessions.map(session => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    })),
    transactionPin: {
      isSet: Boolean(profile.transactionPinSetAt),
      setAt: profile.transactionPinSetAt?.toISOString() ?? null,
    },
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const result = await prisma.session.deleteMany({ where: { userId: user.id } });
  await auditSuccess({ request, userId: user.id, role: "USER", action: "LOGOUT_ALL_DEVICES", module: "PROFILE", description: "User logged out all devices", metadata: { sessions: result.count } }).catch(() => null);
  await clearSession();
  return NextResponse.json({ ok: true, removed: result.count });
}
