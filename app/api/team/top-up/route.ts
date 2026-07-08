import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTopUpTeamMembers } from "@/lib/domain/team-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ authenticated: false, members: [] }, { status: 401 });

  const team = await getTopUpTeamMembers(prisma, user.id);
  return NextResponse.json({ authenticated: true, members: team.members });
}
