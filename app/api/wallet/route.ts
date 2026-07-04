import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserWalletSnapshot } from "@/lib/domain/user-wallets";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, wallet: null }, { status: 401 });
  }

  const wallet = await getUserWalletSnapshot(prisma, user.id);
  return NextResponse.json({ authenticated: true, userId: user.id, wallet });
}
