import { NextResponse } from "next/server";
import { formatLedgerStatus } from "@/lib/format-ledger-status";
import { getCurrentUser } from "@/lib/auth";
import { getUserWalletHistory } from "@/lib/domain/asset-service";
import { prisma } from "@/lib/prisma";
import { displayWalletName } from "@/lib/wallet-labels";
import { tradePlacementTitle } from "@/lib/ledger-display";

const emptyHistory = { authenticated: false, assets: [], totals: {}, history: [] };
const copyTradeIncomeTypes = new Set(["COPY_TRADE"]);
const referralIncomeTypes = new Set(["DIRECT", "LEVEL", "BOT_COMMISSION"]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json(emptyHistory, { status: 401 });
  const [{ history: ledger }, deposits, withdrawals, transfers, p2pTransfers, incomes, trades] = await Promise.all([
    getUserWalletHistory(user.id),
    prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { asset: true, network: true } }),
    prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { asset: true, network: true } }),
    prisma.walletTransfer.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.p2PTransfer.findMany({ where: { OR: [{ senderId: user.id }, { receiverId: user.id }] }, orderBy: { createdAt: "desc" }, take: 100, include: { asset: true, sender: { select: { name: true, uid: true } }, receiver: { select: { name: true, uid: true } } } }),
    prisma.income.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.copyTrade.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100, include: { slot: { select: { label: true } } } }),
  ]);
  const tradesById = new Map(trades.map(trade => [trade.id, trade]));
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
      status: formatLedgerStatus(row.status),
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
      status: formatLedgerStatus(row.status),
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
      status: formatLedgerStatus(row.status),
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
    })),
    ...p2pTransfers.map(row => {
      const sent = row.senderId === user.id;
      const peer = sent ? row.receiver : row.sender;
      return {
        id: row.id,
        type: sent ? "P2P_SENT" : "P2P_RECEIVED",
        walletType: displayWalletName("SPOT"),
        asset: row.asset.symbol,
        direction: sent ? "DEBIT" : "CREDIT",
        amount: Number(row.amount.toString()),
        signedAmount: sent ? -Number(row.amount.toString()) : Number(row.amount.toString()),
        title: sent ? `P2P Sent to ${peer.name} / ${peer.uid}` : `P2P Received from ${peer.name} / ${peer.uid}`,
        referenceType: "P2P_TRANSFER",
        referenceId: row.id,
        status: formatLedgerStatus(row.status),
        createdAt: row.createdAt.toISOString(),
        sortAt: row.createdAt.toISOString(),
      };
    }),
    ...incomes.map(row => {
      const trade = copyTradeIncomeTypes.has(row.type) ? tradesById.get(row.sourceId) : undefined;
      return ({
      id: row.id,
      type: "INCOME",
      walletType: displayWalletName(copyTradeIncomeTypes.has(row.type) ? "AI" : "SPOT"),
      asset: "USDT",
      direction: "CREDIT",
      amount: Number(row.amount.toString()),
      signedAmount: Number(row.amount.toString()),
      title: trade?.source === "NEW_DEPOSITOR_EXTRA" ? "Additional Trade Profit" : incomeTitle(row.type),
      referenceType: copyTradeIncomeTypes.has(row.type) ? "COPY_TRADE_INCOME" : row.sourceType,
      referenceId: row.sourceId,
      tradeId: copyTradeIncomeTypes.has(row.type) ? row.sourceId : undefined,
      pair: trade ? displayTradePair(trade.pair) : undefined,
      window: trade?.slot.label,
      promotionDay: trade?.promotionDay,
      status: "Completed",
      createdAt: row.createdAt.toISOString(),
      sortAt: row.createdAt.toISOString(),
      });
    }),
    ...trades.map(row => ({
      id: row.id,
      type: "COPY_TRADE",
      walletType: displayWalletName("AI"),
      asset: "USDT",
      direction: "DEBIT",
      amount: Number(row.principalAmount.toString()),
      signedAmount: -Number(row.principalAmount.toString()),
      title: tradePlacementTitle(row.source),
      source: row.source,
      referenceType: "COPY_TRADE_PLACEMENT",
      referenceId: row.id,
      tradeId: row.id,
      tradeType: row.source === "MANUAL" ? "MANUAL" : row.source === "NEW_DEPOSITOR_EXTRA" ? "PROMOTION" : "AI",
      pair: displayTradePair(row.pair),
      tradeAmount: Number(row.principalAmount.toString()),
      window: row.slot.label,
      promotionDay: row.promotionDay,
      walletSnapshotAtTrade: row.source === "NEW_DEPOSITOR_EXTRA" && row.walletSnapshotAtTrade ? Number(row.walletSnapshotAtTrade.toString()) : undefined,
      profitPercent: row.source === "NEW_DEPOSITOR_EXTRA" && row.selectedRate ? Number(row.selectedRate.toString()) : undefined,
      placedAt: row.startedAt.toISOString(),
      settledAt: row.incomeCreditedAt?.toISOString() ?? null,
      status: row.status === "FAILED" ? "Failed" : row.incomeCreditedAt ? "Completed" : "Running",
      createdAt: row.startedAt.toISOString(),
      sortAt: row.startedAt.toISOString(),
    })),
    ...trades.filter(row => row.incomeCreditedAt).map(row => ({
      id: `${row.id}:principal-return`,
      type: "COPY_TRADE_PRINCIPAL_RETURN",
      walletType: displayWalletName("AI"),
      asset: "USDT",
      direction: "CREDIT" as const,
      amount: Number(row.principalAmount.toString()),
      signedAmount: Number(row.principalAmount.toString()),
      title: row.source === "NEW_DEPOSITOR_EXTRA" ? "Additional Trade Principal Return" : "AI Trade Principal Return",
      referenceType: "COPY_TRADE_PRINCIPAL_RETURN",
      referenceId: row.id,
      tradeId: row.id,
      pair: displayTradePair(row.pair),
      window: row.slot.label,
      promotionDay: row.promotionDay,
      status: "Completed",
      createdAt: row.incomeCreditedAt!.toISOString(),
      sortAt: row.incomeCreditedAt!.toISOString(),
    })),
  ];

  for (const row of historyRows) primaryReferences.add(referenceKey(row.referenceType, row.referenceId));

  const fallbackLedger = ledger
    .filter(row => row.referenceType !== "COPY_TRADE_INCOME")
    .filter(row => !primaryReferences.has(referenceKey(row.referenceType, row.referenceId)))
    .map(row => ({
      ...row,
      type: "LEDGER",
      title: ledgerTitle(row.referenceType, row.title, row.direction),
      status: formatLedgerStatus(row.status),
      sortAt: row.createdAt,
    }));

  const history = [...historyRows, ...fallbackLedger]
    .sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt)
      || walletEventOrder(b.referenceType) - walletEventOrder(a.referenceType)
      || b.id.localeCompare(a.id))
    .slice(0, 150)
    .map(({ sortAt: _sortAt, ...row }) => row);
  return NextResponse.json({ authenticated: true, assets: [], totals: {}, history });
}

function walletEventOrder(referenceType: string) {
  if (referenceType === "COPY_TRADE_INCOME") return 3;
  if (referenceType === "COPY_TRADE_PRINCIPAL_RETURN") return 2;
  if (referenceType === "COPY_TRADE_PLACEMENT") return 1;
  return 0;
}

function referenceKey(referenceType: string, referenceId: string) {
  return `${referenceType}:${referenceId}`;
}

function displayTradePair(pair: string | null) {
  if (!pair) return "Pair unavailable";
  const normalized = pair.toUpperCase().replace("/", "");
  return normalized.endsWith("USDT") ? `${normalized.slice(0, -4)}/USDT` : normalized;
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
  if (referenceType === "P2P_TRANSFER") return direction === "CREDIT" ? "P2P Received" : "P2P Sent";
  if (referenceType.includes("DEPOSIT")) return "Deposit";
  if (referenceType.includes("WITHDRAWAL")) return "Withdrawal";
  if (referenceType.includes("REFERRAL") || memo.toLowerCase().includes("referral")) return "Referral Income";
  return memo || "Wallet Activity";
}
