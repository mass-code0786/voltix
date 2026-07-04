import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserWalletHistory } from "@/lib/domain/asset-service";

const emptyHistory = { authenticated: false, assets: [], totals: {}, history: [] };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(emptyHistory, { status: 401 });
  const { history } = await getUserWalletHistory(user.id);
  return NextResponse.json({ authenticated: true, assets: [], totals: {}, history });
}
