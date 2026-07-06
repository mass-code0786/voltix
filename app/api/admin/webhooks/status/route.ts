import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const deposits = await prisma.deposit.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: true, asset: true, network: true },
  });
  return NextResponse.json({
    status: process.env.CHAIN_WEBHOOK_SECRET ? "configured" : "missing_secret",
    latestDeposits: deposits.map(deposit => ({
      id: deposit.id,
      user: deposit.user.name,
      uid: deposit.user.uid,
      asset: deposit.asset.symbol,
      network: deposit.network.key.toUpperCase(),
      amount: Number(deposit.amount.toString()),
      txHash: deposit.txHash,
      confirmations: deposit.confirmations,
      status: deposit.status,
      createdAt: deposit.createdAt.toISOString(),
    })),
    latestConfirmations: deposits.filter(deposit => deposit.confirmations > 0).slice(0, 10).map(deposit => ({
      id: deposit.id,
      txHash: deposit.txHash,
      confirmations: deposit.confirmations,
      status: deposit.status,
    })),
    processingErrors: deposits.filter(deposit => deposit.status === "FAILED").map(deposit => ({
      id: deposit.id,
      txHash: deposit.txHash,
      status: deposit.status,
    })),
    checkedAt: new Date().toISOString(),
  });
}
