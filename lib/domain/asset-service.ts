import { Prisma, type PrismaClient, type WalletType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserWalletAccounts } from "./user-wallets";
import { displayWalletName } from "@/lib/wallet-labels";

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
  totals.portfolio = totals.total.spot + totals.total.futures + totals.total.aiWallet;

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
      };
    })
    .filter(asset => asset.balance !== 0);

  return { assets, totals };
}

export async function getUserWalletHistory(userId: string) {
  const accounts = await prisma.walletAccount.findMany({
    where: { userId, type: { in: userWalletTypes } },
    select: { id: true },
  });
  if (!accounts.length) return { history: [] };
  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId: { in: accounts.map(account => account.id) } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      account: { include: { asset: true } },
      journal: true,
    },
  });
  return { history: entries.map(formatLedgerEntry) };
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
