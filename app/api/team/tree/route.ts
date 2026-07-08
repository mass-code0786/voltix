import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTeamTreeMembers } from "@/lib/domain/team-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ authenticated: false, members: [] }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const parentUserId = searchParams.get("parentUserId");
  const mode = searchParams.get("mode") === "top-up" ? "top-up" : "all";
  const tree = await getTeamTreeMembers(prisma, user, parentUserId, mode);

  return NextResponse.json({ authenticated: true, members: tree.members });
}
