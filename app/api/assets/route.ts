import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserAssetsAndTotals, getUserWalletHistory } from "@/lib/domain/asset-service";
import { prisma } from "@/lib/prisma";

const emptyAssets = { authenticated: false, assets: [], totals: {}, walletSummary: null, history: [] };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(emptyAssets, { status: 401 });
  const [{ assets, totals, walletSummary }, { history }] = await Promise.all([
    getUserAssetsAndTotals(prisma, user.id),
    getUserWalletHistory(user.id),
  ]);
  return NextResponse.json({ authenticated: true, assets, totals, walletSummary, history });
}
