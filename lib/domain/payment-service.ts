import { Prisma, WalletType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserWalletAccounts } from "./user-wallets";
import { postBalancedJournal } from "./ledger";

const WITHDRAWAL_FIXED_FEE = new Prisma.Decimal(2);
const WITHDRAWAL_PERCENTAGE_RATE = new Prisma.Decimal("0.05");
const networkNames: Record<string, string> = {
  bsc: "BNB Smart Chain",
  tron: "TRON",
  eth: "Ethereum",
};

type WithdrawalWallet = Extract<WalletType, "SPOT" | "BITEX">;

export async function getUserDeposits(userId: string) {
  const deposits = await prisma.deposit.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { asset: true, network: true },
  });
  return { deposits: deposits.map(formatDeposit) };
}

export async function createDepositRequest(input: { userId: string; amount: Prisma.Decimal; network: string; txHash?: string }) {
  if (input.amount.lte(0)) throw new Error("Deposit amount must be positive");
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { id: true, uid: true } });
    const asset = await ensureUserWalletAccounts(tx, input.userId);
    const network = await ensureNetwork(tx, input.network);
    const address = await ensureDepositAddress(tx, { userId: user.id, uid: user.uid, assetId: asset.id, networkId: network.id, networkKey: network.key });
    const deposit = await tx.deposit.create({
      data: {
        userId: input.userId,
        assetId: asset.id,
        networkId: network.id,
        addressId: address.id,
        txHash: input.txHash?.trim() || null,
        amount: input.amount,
        status: "PENDING",
      },
      include: { asset: true, network: true },
    });
    return formatDeposit(deposit);
  });
}

export async function getUserWithdrawals(userId: string) {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { asset: true, network: true },
  });
  return { withdrawals: withdrawals.map(formatWithdrawal) };
}

export async function createWithdrawalRequest(input: { userId: string; walletType: WithdrawalWallet; amount: Prisma.Decimal; address: string; network: string; idempotencyKey: string }) {
  if (!input.idempotencyKey.trim()) throw new Error("Idempotency key is required");
  if (!input.address.trim()) throw new Error("External wallet address is required");
  if (input.amount.lte(0)) throw new Error("Withdrawal amount must be positive");
  if (input.walletType !== "SPOT" && input.walletType !== "BITEX") throw new Error("Only Spot and AI withdrawals are supported");

  const feeAmount = calculateWithdrawalFee(input.walletType, input.amount);
  const receivableAmount = input.amount.sub(feeAmount);
  if (receivableAmount.lte(0)) throw new Error("Withdrawal amount must exceed the total fee");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.withdrawal.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { asset: true, network: true },
    });
    if (existing) return formatWithdrawal(existing);

    const asset = await ensureUserWalletAccounts(tx, input.userId);
    const network = await ensureNetwork(tx, input.network);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { spotBalance: true, bitexBalance: true, bitexPrincipal: true, bitexIncomeEarned: true },
    });

    if (input.walletType === "SPOT" && user.spotBalance.lt(input.amount)) throw new Error("Insufficient Spot wallet balance");
    if (input.walletType === "BITEX") {
      if (user.bitexPrincipal.gt(0) && user.bitexIncomeEarned.lt(user.bitexPrincipal.mul(2))) {
        throw new Error("AI withdrawal will unlock after completing 2x copy trade income.");
      }
      if (user.bitexBalance.lt(input.amount)) throw new Error("Insufficient AI wallet balance");
    }

    const withdrawal = await tx.withdrawal.create({
      data: {
        userId: input.userId,
        assetId: asset.id,
        networkId: network.id,
        walletType: input.walletType,
        address: input.address.trim(),
        amount: input.amount,
        feeAmount,
        receivableAmount,
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
      },
      include: { asset: true, network: true },
    });
    return formatWithdrawal(withdrawal);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function calculateWithdrawalFee(walletType: WithdrawalWallet, amount: Prisma.Decimal) {
  return walletType === "SPOT" ? WITHDRAWAL_FIXED_FEE.add(amount.mul(WITHDRAWAL_PERCENTAGE_RATE)) : new Prisma.Decimal(0);
}

export async function approveDepositRequest(input: { depositId: string; adminUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: input.depositId }, include: { asset: true, user: true } });
    if (deposit.status !== "PENDING") throw new Error("Deposit has already been actioned");
    const [spotAccount, treasuryAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: deposit.userId, assetId: deposit.assetId, type: "SPOT" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: deposit.assetId, type: "FEE" } }),
    ]);
    const journal = await postBalancedJournal(tx, {
      referenceType: "DEPOSIT_APPROVAL",
      referenceId: deposit.id,
      idempotencyKey: `deposit-approval:${deposit.id}`,
      memo: "Admin approved user deposit request",
      lines: [
        { accountId: treasuryAccount.id, direction: "DEBIT", amount: deposit.amount },
        { accountId: spotAccount.id, direction: "CREDIT", amount: deposit.amount },
      ],
    });
    await tx.user.update({ where: { id: deposit.userId }, data: { spotBalance: { increment: deposit.amount } } });
    const updated = await tx.deposit.update({ where: { id: deposit.id }, data: { status: "APPROVED", creditedAt: new Date() }, include: { asset: true, network: true } });
    await tx.auditLog.create({
      data: {
        actorId: input.adminUserId,
        actorType: "ADMIN",
        action: "DEPOSIT_APPROVED",
        entityType: "Deposit",
        entityId: deposit.id,
        metadata: { userId: deposit.userId, amount: deposit.amount.toString(), asset: deposit.asset.symbol, ledgerJournalId: journal.id },
      },
    });
    return formatDeposit(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectDepositRequest(input: { depositId: string; adminUserId: string; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: input.depositId }, include: { asset: true, network: true } });
    if (deposit.status !== "PENDING") throw new Error("Deposit has already been actioned");
    const journal = await postMemoJournal(tx, {
      referenceType: "DEPOSIT_REJECTION",
      referenceId: deposit.id,
      idempotencyKey: `deposit-rejection:${deposit.id}`,
      memo: "Admin rejected user deposit request",
    });
    const updated = await tx.deposit.update({ where: { id: deposit.id }, data: { status: "REJECTED" }, include: { asset: true, network: true } });
    await tx.auditLog.create({
      data: {
        actorId: input.adminUserId,
        actorType: "ADMIN",
        action: "DEPOSIT_REJECTED",
        entityType: "Deposit",
        entityId: deposit.id,
        metadata: { userId: deposit.userId, amount: deposit.amount.toString(), asset: deposit.asset.symbol, reason: input.reason ?? null, ledgerJournalId: journal.id },
      },
    });
    return formatDeposit(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function approveWithdrawalRequest(input: { withdrawalId: string; adminUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: input.withdrawalId }, include: { asset: true, network: true } });
    if (withdrawal.status !== "PENDING") throw new Error("Withdrawal has already been actioned");
    if (withdrawal.walletType !== "SPOT" && withdrawal.walletType !== "BITEX") throw new Error("Only Spot and AI withdrawals are supported");
    const feeAmount = calculateWithdrawalFee(withdrawal.walletType, withdrawal.amount);
    const receivableAmount = withdrawal.amount.sub(feeAmount);
    if (receivableAmount.lte(0)) throw new Error("Withdrawal amount must exceed the total fee");

    const debit = withdrawal.walletType === "BITEX"
      ? await tx.user.updateMany({ where: { id: withdrawal.userId, bitexBalance: { gte: withdrawal.amount } }, data: { bitexBalance: { decrement: withdrawal.amount } } })
      : await tx.user.updateMany({ where: { id: withdrawal.userId, spotBalance: { gte: withdrawal.amount } }, data: { spotBalance: { decrement: withdrawal.amount } } });
    if (debit.count !== 1) throw new Error(`Insufficient ${withdrawal.walletType} wallet balance`);

    const [sourceAccount, externalPayable, feeAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: withdrawal.userId, assetId: withdrawal.assetId, type: withdrawal.walletType } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: withdrawal.assetId, type: "SPOT" } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: withdrawal.assetId, type: "FEE" } }),
    ]);
    const lines = [
      { accountId: sourceAccount.id, direction: "DEBIT" as const, amount: withdrawal.amount },
      { accountId: externalPayable.id, direction: "CREDIT" as const, amount: receivableAmount },
    ];
    if (feeAmount.gt(0)) lines.push({ accountId: feeAccount.id, direction: "CREDIT", amount: feeAmount });
    const journal = await postBalancedJournal(tx, {
      referenceType: "WITHDRAWAL_APPROVAL",
      referenceId: withdrawal.id,
      idempotencyKey: `withdrawal-approval:${withdrawal.id}`,
      memo: "Admin approved withdrawal request",
      lines,
    });
    const updated = await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: "APPROVED", feeAmount, receivableAmount, adminActionBy: input.adminUserId, adminActionAt: new Date(), ledgerJournalId: journal.id },
      include: { asset: true, network: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.adminUserId,
        actorType: "ADMIN",
        action: "WITHDRAWAL_APPROVED",
        entityType: "Withdrawal",
        entityId: withdrawal.id,
        metadata: { userId: withdrawal.userId, walletType: withdrawal.walletType, amount: withdrawal.amount.toString(), feeAmount: feeAmount.toString(), receivableAmount: receivableAmount.toString(), ledgerJournalId: journal.id },
      },
    });
    return formatWithdrawal(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectWithdrawalRequest(input: { withdrawalId: string; adminUserId: string; reason?: string }) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: input.withdrawalId }, include: { asset: true, network: true } });
    if (withdrawal.status !== "PENDING") throw new Error("Withdrawal has already been actioned");
    const journal = await postMemoJournal(tx, {
      referenceType: "WITHDRAWAL_REJECTION",
      referenceId: withdrawal.id,
      idempotencyKey: `withdrawal-rejection:${withdrawal.id}`,
      memo: "Admin rejected withdrawal request",
    });
    const updated = await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: "REJECTED", adminActionBy: input.adminUserId, adminActionAt: new Date(), rejectionReason: input.reason?.trim() || null },
      include: { asset: true, network: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.adminUserId,
        actorType: "ADMIN",
        action: "WITHDRAWAL_REJECTED",
        entityType: "Withdrawal",
        entityId: withdrawal.id,
        metadata: { userId: withdrawal.userId, walletType: withdrawal.walletType, amount: withdrawal.amount.toString(), reason: input.reason ?? null, ledgerJournalId: journal.id },
      },
    });
    return formatWithdrawal(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function ensureNetwork(client: Prisma.TransactionClient, rawNetwork: string) {
  const key = (rawNetwork || "BSC").trim().toLowerCase();
  return client.chainNetwork.upsert({
    where: { key },
    update: {},
    create: {
      key,
      name: networkNames[key] ?? (rawNetwork.trim() || key.toUpperCase()),
      requiredConfirmations: key === "bsc" ? 12 : 20,
    },
  });
}

async function ensureDepositAddress(client: Prisma.TransactionClient, input: { userId: string; uid: string; assetId: string; networkId: string; networkKey: string }) {
  const existing = await client.depositAddress.findFirst({
    where: { userId: input.userId, assetId: input.assetId, networkId: input.networkId, active: true },
  });
  if (existing) return existing;
  const derivationIndex = await client.depositAddress.count({ where: { networkId: input.networkId } });
  return client.depositAddress.create({
    data: {
      userId: input.userId,
      assetId: input.assetId,
      networkId: input.networkId,
      address: `manual-${input.networkKey}-${input.uid}`,
      derivationIndex,
      path: "manual/request",
    },
  });
}

function formatDeposit(deposit: { id: string; amount: Prisma.Decimal; txHash: string | null; status: string; createdAt: Date; asset: { symbol: string }; network: { key: string; name: string } }) {
  return {
    id: deposit.id,
    amount: Number(deposit.amount.toString()),
    asset: deposit.asset.symbol,
    network: deposit.network.key.toUpperCase(),
    networkName: deposit.network.name,
    txHash: deposit.txHash,
    status: deposit.status,
    createdAt: deposit.createdAt.toISOString(),
  };
}

function formatWithdrawal(withdrawal: { id: string; walletType: WalletType; amount: Prisma.Decimal; feeAmount: Prisma.Decimal; receivableAmount: Prisma.Decimal; address: string; txHash: string | null; status: string; rejectionReason: string | null; createdAt: Date; asset: { symbol: string }; network: { key: string; name: string } }) {
  return {
    id: withdrawal.id,
    walletType: withdrawal.walletType,
    amount: Number(withdrawal.amount.toString()),
    fee: Number(withdrawal.feeAmount.toString()),
    receivable: Number(withdrawal.receivableAmount.toString()),
    asset: withdrawal.asset.symbol,
    address: withdrawal.address,
    network: withdrawal.network.key.toUpperCase(),
    networkName: withdrawal.network.name,
    txHash: withdrawal.txHash,
    status: withdrawal.status,
    rejectionReason: withdrawal.rejectionReason,
    createdAt: withdrawal.createdAt.toISOString(),
  };
}

async function postMemoJournal(tx: Prisma.TransactionClient, input: { referenceType: string; referenceId: string; idempotencyKey: string; memo: string }) {
  return tx.ledgerJournal.create({
    data: {
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      memo: input.memo,
      status: "POSTED",
      postedAt: new Date(),
    },
  });
}
