import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTeamSnapshot } from "@/lib/domain/team-service";
import { prisma } from "@/lib/prisma";

const emptyTeam = {
  referralUid: null,
  referralLink: null,
  stats: {
    directTeamCount: 0,
    totalNetworkCount: 0,
    activeUsersCount: 0,
    teamVolume: 0,
  },
  members: [],
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, team: emptyTeam }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const team = await getTeamSnapshot(prisma, user.id, origin);
  return NextResponse.json({ authenticated: true, userId: user.id, team });
}
