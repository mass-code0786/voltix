import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { id } = await params;
  await prisma.notification.deleteMany({ where: { id, userId: user.id } });
  const unreadCount = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return NextResponse.json({ deleted: true, unreadCount });
}
