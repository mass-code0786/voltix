import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeLanguage } from "@/lib/profile-options";
import { auditSuccess } from "@/lib/audit";
import { buildReferralLink } from "@/lib/app-url";
import { refreshUserVipRank } from "@/lib/domain/vip-rank-service";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  country: z.string().trim().min(1, "Country is required"),
  language: z.string().trim().optional(),
  profileImageUrl: z.string().trim().optional(),
});

function referralLink(uid: string | null | undefined) {
  return buildReferralLink(uid);
}

async function profilePayload(userId: string) {
  await refreshUserVipRank(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      uid: true,
      name: true,
      email: true,
      country: true,
      language: true,
      profileImageUrl: true,
      vipRank: true,
      joinedAt: true,
      kycRequests: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });
  if (!user) return null;
  const latestKyc = user.kycRequests[0]?.status ?? "NOT_SUBMITTED";
  return {
    avatar: user.profileImageUrl,
    profileImageUrl: user.profileImageUrl,
    fullName: user.name,
    uid: user.uid,
    email: user.email,
    country: user.country,
    language: user.language,
    vipRank: user.vipRank,
    referralUid: user.uid,
    referralLink: referralLink(user.uid),
    memberSince: user.joinedAt.toISOString(),
    kycStatus: latestKyc,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const profile = await profilePayload(user.id);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const before = await profilePayload(user.id);
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile details" }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      country: parsed.data.country,
      language: normalizeLanguage(parsed.data.language),
      profileImageUrl: parsed.data.profileImageUrl || null,
    },
  });
  const profile = await profilePayload(user.id);
  await auditSuccess({ request, userId: user.id, role: "USER", action: "PROFILE_UPDATE", module: "PROFILE", description: "User profile updated", oldValue: before, newValue: profile }).catch(() => null);
  return NextResponse.json({ profile });
}
