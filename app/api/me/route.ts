import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { refreshUserVipRank } from "@/lib/domain/vip-rank-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ authenticated: false, user: null });
  const refreshed = await refreshUserVipRank(user.id);
  const currentUser = refreshed
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, uid: true, name: true, email: true, country: true, language: true, vipRank: true, role: true },
      })
    : user;
  return NextResponse.json({ authenticated: true, user: currentUser });
}
