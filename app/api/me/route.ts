import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recalculateVipRanksForUserAndUplines } from "@/lib/domain/vip-rank-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ authenticated: false, user: null });
  const vip = (await recalculateVipRanksForUserAndUplines(user.id)).find(result => result.userId === user.id) ?? null;
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, uid: true, name: true, email: true, country: true, language: true, profileImageUrl: true, vipRank: true, role: true },
  });
  const latestKyc = await prisma.kycRequest.findFirst({
    where: { userId: user.id },
    orderBy: { submittedAt: "desc" },
    select: { status: true },
  });
  return NextResponse.json({ authenticated: true, user: currentUser ? { ...currentUser, ...vip, kycStatus: latestKyc?.status ?? "NOT_SUBMITTED" } : null });
}
