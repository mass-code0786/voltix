import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { refreshUserVipRank } from "@/lib/domain/vip-rank-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ authenticated: false, user: null });
  await refreshUserVipRank(user.id);
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, uid: true, name: true, email: true, country: true, language: true, profileImageUrl: true, vipRank: true, role: true },
  });
  const latestKyc = await prisma.kycRequest.findFirst({
    where: { userId: user.id },
    orderBy: { submittedAt: "desc" },
    select: { status: true },
  });
  return NextResponse.json({ authenticated: true, user: currentUser ? { ...currentUser, kycStatus: latestKyc?.status ?? "NOT_SUBMITTED" } : null });
}
