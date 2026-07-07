import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserWalletHistory } from "@/lib/domain/asset-service";
import { prisma } from "@/lib/prisma";
import { displayWalletName } from "@/lib/wallet-labels";

const emptyHistory = { authenticated: false, assets: [], totals: {}, history: [] };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(emptyHistory, { status: 401 });
  const [{ history: ledger }, deposits, withdrawals, transfers, incomes, trades] = await Promise.all([
    getUserWalletHistory(user.id),
    prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { asset: true, network: true } }),
    prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { asset: true, network: true } }),
    prisma.walletTransfer.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.income.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.copyTrade.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const history = [
    ...ledger.map(row => ({ ...row, type: "LEDGER", sortAt: row.createdAt })),
    ...deposits.map(row => ({
      id: row.id,
      type: "DEPOSIT",
      walletType: displayWalletName("SPOT"),
      asset: row.asset.symbol,
      direction: "CREDIT",
      amount: Number(row.amount.toString()),
      signedAmount: Number(row.amount.toString()),
      title: `Deposit ${row.network.key.toUpperCase()}`,
      referenceType: "DEPOSIT",
      referenceId: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
    })),
    ...withdrawals.map(row => ({
      id: row.id,
      type: "WITHDRAWAL",
      walletType: displayWalletName(row.walletType),
      asset: row.asset.symbol,
      direction: "DEBIT",
      amount: Number(row.amount.toString()),
      signedAmount: -Number(row.amount.toString()),
      title: `Withdrawal ${row.network.key.toUpperCase()}`,
      referenceType: "WITHDRAWAL",
      referenceId: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
    })),
    ...transfers.map(row => ({
      id: row.id,
      type: "TRANSFER",
      walletType: displayWalletName(row.fromWallet),
      asset: "USDT",
      direction: "DEBIT",
      amount: Number(row.amount.toString()),
      signedAmount: -Number(row.amount.toString()),
      title: `Transfer ${displayWalletName(row.fromWallet)} to ${displayWalletName(row.toWallet)}`,
      referenceType: "WALLET_TRANSFER",
      referenceId: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
    })),
    ...incomes.map(row => ({
      id: row.id,
      type: "INCOME",
      walletType: displayWalletName("BITEX"),
      asset: "USDT",
      direction: "CREDIT",
      amount: Number(row.amount.toString()),
      signedAmount: Number(row.amount.toString()),
      title: `${row.type.replaceAll("_", " ")} income`,
      referenceType: row.sourceType,
      referenceId: row.sourceId,
      status: "POSTED",
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
    })),
    ...trades.map(row => ({
      id: row.id,
      type: "COPY_TRADE",
      walletType: displayWalletName("BITEX"),
      asset: "USDT",
      direction: "DEBIT",
      amount: Number(row.principalAmount.toString()),
      signedAmount: -Number(row.principalAmount.toString()),
      title: "Copy trade",
      referenceType: "COPY_TRADE",
      referenceId: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
    })),
  ].sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt)).slice(0, 150).map(({ sortAt: _sortAt, ...row }) => row);
  return NextResponse.json({ authenticated: true, assets: [], totals: {}, history });
}
