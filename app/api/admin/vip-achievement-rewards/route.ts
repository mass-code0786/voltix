import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const rewards = await prisma.vipAchievementReward.findMany({ include: { user: { select: { name: true, uid: true, email: true } } }, orderBy: { achievedAt: "desc" }, take: 500 });
  return NextResponse.json({ rows: rewards.map(row => [ `${row.user.name} / ${row.user.uid}`, `VIP ${row.vipRank}`, `${row.rewardAmount.toFixed(2)} USDT`, "Spot Wallet", row.status, row.achievedAt.toISOString(), row.creditedAt?.toISOString() ?? "—", row.uniqueReference ]) });
}
