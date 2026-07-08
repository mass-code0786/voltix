import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserWalletHistory } from "@/lib/domain/asset-service";
import { prisma } from "@/lib/prisma";
import { displayWalletName } from "@/lib/wallet-labels";

const emptyHistory = { authenticated: false, assets: [], totals: {}, history: [] };
const copyTradeIncomeTypes = new Set(["COPY_TRADE"]);
const referralIncomeTypes = new Set(["DIRECT", "LEVEL", "BOT_COMMISSION"]);

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
  const primaryReferences = new Set<string>();
  const historyRows = [
    ...deposits.map(row => ({
      id: row.id,
      type: "DEPOSIT",
      walletType: displayWalletName("SPOT"),
      asset: row.asset.symbol,
      direction: "CREDIT",
      amount: Number(row.amount.toString()),
      signedAmount: Number(row.amount.toString()),
      title: "Deposit",
      referenceType: "DEPOSIT",
      referenceId: row.id,
      status: cleanStatus(row.status),
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
      title: "Withdrawal",
      referenceType: "WITHDRAWAL",
      referenceId: row.id,
      status: cleanStatus(row.status),
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
      status: cleanStatus(row.status),
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
    })),
    ...incomes.map(row => ({
      id: row.id,
      type: "INCOME",
      walletType: displayWalletName(copyTradeIncomeTypes.has(row.type) ? "BITEX" : "SPOT"),
      asset: "USDT",
      direction: "CREDIT",
      amount: Number(row.amount.toString()),
      signedAmount: Number(row.amount.toString()),
      title: incomeTitle(row.type),
      referenceType: row.sourceType,
      referenceId: row.sourceId,
      status: "Completed",
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
      status: cleanStatus(row.status),
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
    })),
  ];

  for (const row of historyRows) primaryReferences.add(referenceKey(row.referenceType, row.referenceId));

  const fallbackLedger = ledger
    .filter(row => !primaryReferences.has(referenceKey(row.referenceType, row.referenceId)))
    .map(row => ({
      ...row,
      type: "LEDGER",
      title: ledgerTitle(row.referenceType, row.title, row.direction),
      status: cleanStatus(row.status),
      sortAt: row.createdAt,
    }));

  const history = [...historyRows, ...fallbackLedger].sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt)).slice(0, 150).map(({ sortAt: _sortAt, ...row }) => row);
  return NextResponse.json({ authenticated: true, assets: [], totals: {}, history });
}

function referenceKey(referenceType: string, referenceId: string) {
  return `${referenceType}:${referenceId}`;
}

function incomeTitle(type: string) {
  if (copyTradeIncomeTypes.has(type)) return "AI Trade Profit";
  if (referralIncomeTypes.has(type)) return "Referral Income";
  if (type === "VIP_SALARY") return "VIP Salary";
  return "Income";
}

function ledgerTitle(referenceType: string, memo: string, direction: string) {
  if (referenceType === "ADMIN_WALLET_ADJUSTMENT") return direction === "CREDIT" ? "Admin Credit" : "Admin Debit";
  if (referenceType === "COPY_TRADE_INCOME") return "AI Trade Profit";
  if (referenceType === "WALLET_TRANSFER") return "Wallet Transfer";
  if (referenceType.includes("DEPOSIT")) return "Deposit";
  if (referenceType.includes("WITHDRAWAL")) return "Withdrawal";
  if (referenceType.includes("REFERRAL") || memo.toLowerCase().includes("referral")) return "Referral Income";
  return memo || "Wallet Activity";
}

function cleanStatus(status: string) {
  if (status === "POSTED" || status === "CREDITED" || status === "COMPLETED" || status === "APPROVED" || status === "INCOME_CREDITED") return "Completed";
  if (status === "PENDING" || status === "CONFIRMING" || status === "CONFIRMED" || status === "DETECTED") return "Pending";
  if (status === "REJECTED" || status === "FAILED" || status === "EXPIRED") return "Failed";
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}
