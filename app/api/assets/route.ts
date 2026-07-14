import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserAssetsAndTotals, getUserWalletHistory } from "@/lib/domain/asset-service";
import { prisma } from "@/lib/prisma";
import { validTimeZone } from "@/lib/domain/local-day";

const emptyAssets = { authenticated: false, assets: [], totals: {}, walletSummary: null, history: [] };

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(emptyAssets, { status: 401 });
  const timeZone = validTimeZone(new URL(request.url).searchParams.get("timezone"));
  const [{ assets, totals, walletSummary }, { history }] = await Promise.all([
    getUserAssetsAndTotals(prisma, user.id, { timeZone }),
    getUserWalletHistory(user.id),
  ]);
  return NextResponse.json({ authenticated: true, assets, totals, walletSummary, history });
}
