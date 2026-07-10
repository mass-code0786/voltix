import type { Prisma, PrismaClient, WalletType } from "@prisma/client";

const userWalletTypes = ["SPOT", "FUTURES", "BITEX"] as const satisfies readonly WalletType[];

type WalletClient = Pick<PrismaClient, "asset" | "walletAccount" | "user"> | Prisma.TransactionClient;

export async function ensureUserWalletAccounts(client: WalletClient, userId: string) {
  const usdt = await client.asset.upsert({
    where: { symbol: "USDT" },
    update: {},
    create: { symbol: "USDT", name: "Tether", decimals: 18 },
  });

  await client.walletAccount.createMany({
    data: userWalletTypes.map(type => ({ userId, assetId: usdt.id, type })),
    skipDuplicates: true,
  });

  return usdt;
}

export async function getUserWalletSnapshot(client: WalletClient, userId: string) {
  await ensureUserWalletAccounts(client, userId);
  const user = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      spotBalance: true,
      futuresBalance: true,
      bitexBalance: true,
      bitexPrincipal: true,
      bitexIncomeEarned: true,
      bitexTargetAmount: true,
      bitexUnlocked: true,
      wallets: {
        select: {
          id: true,
          type: true,
          asset: { select: { symbol: true } },
        },
        orderBy: { type: "asc" },
      },
    },
  });

  return {
    balances: {
      spot: decimalToNumber(user.spotBalance),
      funding: decimalToNumber(user.futuresBalance),
      futures: decimalToNumber(user.futuresBalance),
      bitex: decimalToNumber(user.bitexBalance),
    },
    bitex: {
      principal: decimalToNumber(user.bitexPrincipal),
      incomeEarned: decimalToNumber(user.bitexIncomeEarned),
      targetAmount: decimalToNumber(user.bitexPrincipal.mul("0.60")),
      unlocked: user.bitexPrincipal.eq(0) || user.bitexIncomeEarned.gte(user.bitexPrincipal.mul("0.60")),
    },
    accounts: user.wallets.map(account => ({
      id: account.id,
      type: account.type,
      asset: account.asset.symbol,
    })),
  };
}

function decimalToNumber(value: Prisma.Decimal) {
  return Number(value.toString());
}
