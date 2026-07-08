import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ referralCode: string }> }) {
  const { referralCode } = await params;
  const code = referralCode.trim().toUpperCase();
  if (!code) return NextResponse.json({ valid: false, error: "Invalid referral link" }, { status: 400 });

  const sponsor = await prisma.user.findUnique({
    where: { uid: code },
    select: { uid: true, name: true, status: true },
  });

  if (!sponsor || sponsor.status !== "ACTIVE") {
    return NextResponse.json({ valid: false, error: "Invalid referral link" }, { status: 404 });
  }

  return NextResponse.json({
    valid: true,
    sponsor: {
      uid: sponsor.uid,
      name: sponsor.name,
      label: sponsor.name || sponsor.uid,
    },
  });
}
