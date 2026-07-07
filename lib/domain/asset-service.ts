import { Prisma, type PrismaClient, type WalletType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserWalletAccounts } from "./user-wallets";
import { displayWalletName } from "@/lib/wallet-labels";

type AssetClient = Pick<PrismaClient, "asset" | "walletAccount" | "ledgerEntry" | "copyTrade" | "user"> | Prisma.TransactionClient;

const userWalletTypes: WalletType[] = ["SPOT", "FUTURES", "BITEX"];

export async function getUserAssetsAndTotals(client: AssetClient, userId: string) {
  await ensureUserWalletAccounts(client, userId);
  const [accounts, activeTrades, user] = await Promise.all([
    client.walletAccount.findMany({
      where: { userId, type: { in: userWalletTypes } },
      include: { asset: true },
      orderBy: [{ type: "asc" }, { asset: { symbol: "asc" } }],
    }),
    client.copyTrade.aggregate({
      where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
      _sum: { principalAmount: true },
    }),
    client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { spotBalance: true, futuresBalance: true, bitexBalance: true, bitexPrincipal: true, bitexIncomeEarned: true, bitexTargetAmount: true, bitexUnlocked: true },
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
    available: { spot: decimalToNumber(user.spotBalance), futures: decimalToNumber(user.futuresBalance), bitex: decimalToNumber(user.bitexBalance) },
    locked: { spot: 0, futures: 0, bitex: decimalToNumber(activeTrades._sum.principalAmount ?? 0) },
    total: { spot: decimalToNumber(user.spotBalance), futures: decimalToNumber(user.futuresBalance), bitex: decimalToNumber(user.bitexBalance) },
    portfolio: 0,
    bitex: {
      principal: decimalToNumber(user.bitexPrincipal),
      incomeEarned: decimalToNumber(user.bitexIncomeEarned),
      targetAmount: decimalToNumber(user.bitexTargetAmount),
      unlocked: user.bitexUnlocked,
    },
  };
  totals.portfolio = totals.total.spot + totals.total.futures + totals.total.bitex;

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
  journal: { id: string; referenceType: string; referenceId: string; memo: string; status: string };
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
    createdAt: entry.createdAt.toISOString(),
  };
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return Number(value.toString());
}

function walletBalanceForType(user: { spotBalance: Prisma.Decimal; futuresBalance: Prisma.Decimal; bitexBalance: Prisma.Decimal }, type: WalletType) {
  if (type === "FUTURES") return user.futuresBalance;
  if (type === "BITEX") return user.bitexBalance;
  return user.spotBalance;
}
