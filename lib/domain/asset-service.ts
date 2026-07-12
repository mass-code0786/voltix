import { Prisma, type PrismaClient, type WalletType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserWalletAccounts } from "./user-wallets";
import { displayWalletName } from "@/lib/wallet-labels";
import { SHINE_PRICE_USD, SHINE_SYMBOL } from "@/lib/shine-token";

type AssetClient = Pick<PrismaClient, "asset" | "walletAccount" | "ledgerEntry" | "copyTrade" | "user"> | Prisma.TransactionClient;

const userWalletTypes: WalletType[] = ["SPOT", "FUTURES", "AI"];

export async function getUserAssetsAndTotals(client: AssetClient, userId: string) {
  await ensureUserWalletAccounts(client, userId);
  const [accounts, activeTrades, user] = await Promise.all([
    client.walletAccount.findMany({
      where: { userId, type: { in: userWalletTypes } },
      include: { asset: true },
      orderBy: [{ type: "asc" }, { asset: { symbol: "asc" } }],
    }),
    client.copyTrade.aggregate({
      where: { userId, status: { in: ["PENDING", "ACTIVE", "COMPLETED"] } },
      _sum: { principalAmount: true },
    }),
    client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { spotBalance: true, futuresBalance: true, aiWalletBalance: true, aiTradePrincipal: true, aiTradeProfitEarned: true, aiTradeTargetAmount: true, aiTradeWithdrawalUnlocked: true },
    }),
  ]);

  const entries = accounts.length
    ? await client.ledgerEntry.findMany({
        where: { accountId: { in: accounts.map(account => account.id) } },
        select: { accountId: true, direction: true, amount: true },
      })
    : [];
  const balanceByAccount = new Map<string, Prisma.Decimal>();
  for (const entry of entries) {
    const current = balanceByAccount.get(entry.accountId) ?? new Prisma.Decimal(0);
    balanceByAccount.set(entry.accountId, entry.direction === "CREDIT" ? current.add(entry.amount) : current.sub(entry.amount));
  }

  const shineBalance = accounts
    .filter(account => account.type === "SPOT" && account.asset.symbol === SHINE_SYMBOL)
    .reduce((sum, account) => sum.add(balanceByAccount.get(account.id) ?? 0), new Prisma.Decimal(0));
  const shineUsdPrice = new Prisma.Decimal(SHINE_PRICE_USD);
  const shineUsdValue = shineBalance.mul(shineUsdPrice);
  const spotWalletUsd = user.spotBalance;
  const futuresWalletUsd = user.futuresBalance;
  const aiWalletUsd = user.aiWalletBalance;
  const otherAssetValueUsd = new Prisma.Decimal(0);
  const totalBalanceUsd = spotWalletUsd.add(futuresWalletUsd).add(aiWalletUsd).add(shineUsdValue).add(otherAssetValueUsd);

  const totals = {
    available: { spot: decimalToNumber(user.spotBalance), futures: decimalToNumber(user.futuresBalance), aiWallet: decimalToNumber(user.aiWalletBalance) },
    locked: { spot: 0, futures: 0, aiWallet: decimalToNumber(activeTrades._sum.principalAmount ?? 0) },
    total: { spot: decimalToNumber(user.spotBalance), futures: decimalToNumber(user.futuresBalance), aiWallet: decimalToNumber(user.aiWalletBalance) },
    portfolio: 0,
    aiWallet: {
      principal: decimalToNumber(user.aiTradePrincipal),
      incomeEarned: decimalToNumber(user.aiTradeProfitEarned),
      targetAmount: decimalToNumber(user.aiTradePrincipal.mul("0.60")),
      unlocked: user.aiTradePrincipal.eq(0) || user.aiTradeProfitEarned.gte(user.aiTradePrincipal.mul("0.60")),
    },
  };
  totals.portfolio = decimalToNumber(totalBalanceUsd);

  const walletSummary = {
    spotWalletUsd: decimalToNumber(spotWalletUsd),
    aiWalletUsd: decimalToNumber(aiWalletUsd),
    futuresWalletUsd: decimalToNumber(futuresWalletUsd),
    shineBalance: decimalToNumber(shineBalance),
    shineUsdPrice: decimalToNumber(shineUsdPrice),
    shineUsdValue: decimalToNumber(shineUsdValue),
    otherAssetValueUsd: decimalToNumber(otherAssetValueUsd),
    totalBalanceUsd: decimalToNumber(totalBalanceUsd),
    updatedAt: new Date().toISOString(),
  };

  const assets = accounts
    .map(account => {
      const ledgerBalance = balanceByAccount.get(account.id) ?? new Prisma.Decimal(0);
      const availableBalance = account.asset.symbol === "USDT" ? walletBalanceForType(user, account.type) : ledgerBalance;
      return {
        accountId: account.id,
        walletType: account.type,
        assetId: account.assetId,
        symbol: account.asset.symbol,
        name: account.asset.name,
        decimals: account.asset.decimals,
        enabled: account.asset.enabled,
        balance: decimalToNumber(availableBalance),
        ledgerBalance: decimalToNumber(ledgerBalance),
        usdPrice: account.asset.symbol === SHINE_SYMBOL ? decimalToNumber(shineUsdPrice) : account.asset.symbol === "USDT" ? 1 : null,
        usdValue: account.asset.symbol === SHINE_SYMBOL ? decimalToNumber(availableBalance.mul(shineUsdPrice)) : account.asset.symbol === "USDT" ? decimalToNumber(availableBalance) : null,
      };
    })
    .filter(asset => asset.balance !== 0);

  return { assets, totals, walletSummary };
}

export async function getUserWalletHistory(userId: string) {
  const [accounts, trades] = await Promise.all([
    prisma.walletAccount.findMany({
      where: { userId, type: { in: userWalletTypes } },
      select: { id: true },
    }),
    prisma.copyTrade.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 100,
      include: { slot: { select: { label: true } } },
    }),
  ]);
  const entries = accounts.length ? await prisma.ledgerEntry.findMany({
    where: { accountId: { in: accounts.map(account => account.id) } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      account: { include: { asset: true } },
      journal: true,
    },
  }) : [];
  const history = [
    ...entries.map(formatLedgerEntry),
    ...trades.map(formatTradePlacement),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    || walletEventOrder(b.referenceType) - walletEventOrder(a.referenceType)
    || b.id.localeCompare(a.id)).slice(0, 150);
  return { history };
}

function walletEventOrder(referenceType: string) {
  if (referenceType === "COPY_TRADE_INCOME") return 3;
  if (referenceType === "COPY_TRADE_PRINCIPAL_RETURN") return 2;
  if (referenceType === "COPY_TRADE_PLACEMENT") return 1;
  return 0;
}

function formatTradePlacement(trade: {
  id: string;
  source: string;
  pair: string | null;
  principalAmount: Prisma.Decimal;
  status: string;
  startedAt: Date;
  incomeCreditedAt: Date | null;
  failureReason: string | null;
  slot: { label: string };
}) {
  const manual = trade.source === "MANUAL";
  const status = trade.status === "FAILED" ? "Failed" : trade.incomeCreditedAt ? "Completed" : "Running";
  return {
    id: `${trade.id}:placed`,
    tradeId: trade.id,
    type: "COPY_TRADE_PLACEMENT",
    walletType: displayWalletName("AI"),
    asset: "USDT",
    direction: "DEBIT" as const,
    amount: decimalToNumber(trade.principalAmount),
    signedAmount: decimalToNumber(trade.principalAmount.neg()),
    title: manual ? "Manual Trade Placed" : "AI Trade Placed",
    source: trade.source,
    referenceType: "COPY_TRADE_PLACEMENT",
    referenceId: trade.id,
    status,
    tradeType: manual ? "MANUAL" : "AI",
    pair: displayTradePair(trade.pair),
    tradeAmount: decimalToNumber(trade.principalAmount),
    window: trade.slot.label,
    placedAt: trade.startedAt.toISOString(),
    settledAt: trade.incomeCreditedAt?.toISOString() ?? null,
    failureReason: trade.failureReason,
    createdAt: trade.startedAt.toISOString(),
  };
}

function displayTradePair(pair: string | null) {
  if (!pair) return "Pair unavailable";
  const normalized = pair.toUpperCase().replace("/", "");
  return normalized.endsWith("USDT") ? `${normalized.slice(0, -4)}/USDT` : normalized;
}

function formatLedgerEntry(entry: {
  id: string;
  direction: "DEBIT" | "CREDIT";
  amount: Prisma.Decimal;
  createdAt: Date;
  account: { type: WalletType; asset: { symbol: string } };
  journal: { id: string; referenceType: string; referenceId: string; memo: string; status: string; postedAt: Date | null };
}) {
  return {
    id: entry.id,
    journalId: entry.journal.id,
    walletType: displayWalletName(entry.account.type),
    asset: entry.account.asset.symbol,
    direction: entry.direction,
    amount: decimalToNumber(entry.amount),
    signedAmount: decimalToNumber(entry.direction === "CREDIT" ? entry.amount : entry.amount.neg()),
    title: entry.journal.memo,
    referenceType: entry.journal.referenceType,
    referenceId: entry.journal.referenceId,
    tradeId: entry.journal.referenceType.startsWith("COPY_TRADE") ? entry.journal.referenceId : undefined,
    status: entry.journal.status,
    createdAt: (entry.journal.postedAt ?? entry.createdAt).toISOString(),
  };
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return Number(value.toString());
}

function walletBalanceForType(user: { spotBalance: Prisma.Decimal; futuresBalance: Prisma.Decimal; aiWalletBalance: Prisma.Decimal }, type: WalletType) {
  if (type === "FUTURES") return user.futuresBalance;
  if (type === "AI") return user.aiWalletBalance;
  return user.spotBalance;
}
