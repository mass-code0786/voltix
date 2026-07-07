import { Prisma, WalletType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { postBalancedJournal } from "./ledger";
import { ensureUserWalletAccounts } from "./user-wallets";
import { displayWalletName } from "@/lib/wallet-labels";

const WITHDRAWAL_FIXED_FEE = new Prisma.Decimal(2);
const WITHDRAWAL_PERCENTAGE_RATE = new Prisma.Decimal("0.05");
const allowedRoutes = new Set([
  "SPOT:FUTURES", "SPOT:BITEX",
  "FUTURES:SPOT", "FUTURES:BITEX",
]);

type UserWallet = Exclude<WalletType, "FEE">;
type WithdrawalWallet = Extract<UserWallet, "SPOT" | "BITEX">;

export async function transferWallet(input: {
  userId: string;
  fromWallet: UserWallet;
  toWallet: UserWallet;
  amount: Prisma.Decimal;
  idempotencyKey: string;
}) {
  if (!input.idempotencyKey.trim()) throw new Error("Idempotency key is required");
  if (input.amount.lte(0)) throw new Error("Transfer amount must be positive");
  if (!allowedRoutes.has(`${input.fromWallet}:${input.toWallet}`)) throw new Error("Wallet transfer route is not supported");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.walletTransfer.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;

    if (input.fromWallet === "BITEX") throw new Error("AI funds cannot be transferred back to another wallet");
    const receivedAmount = input.amount;
    const reason = `${input.fromWallet}_TO_${input.toWallet}`;

    const sourceField = balanceField(input.fromWallet);
    const destinationField = balanceField(input.toWallet);
    const debit = await tx.user.updateMany({
      where: { id: input.userId, [sourceField]: { gte: input.amount } },
      data: { [sourceField]: { decrement: input.amount } },
    });
    if (debit.count !== 1) throw new Error(`Insufficient ${displayWalletName(input.fromWallet)} balance`);

    await tx.user.update({
      where: { id: input.userId },
      data: {
        [destinationField]: { increment: receivedAmount },
        ...(input.toWallet === "BITEX" ? {
          bitexPrincipal: { increment: input.amount },
          bitexTargetAmount: { increment: input.amount.mul(2) },
          bitexUnlocked: false,
        } : {}),
      },
    });

    const asset = await ensureUserWalletAccounts(tx, input.userId);
    const [source, destination] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: input.userId, assetId: asset.id, type: input.fromWallet } } }),
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: input.userId, assetId: asset.id, type: input.toWallet } } }),
    ]);

    const transfer = await tx.walletTransfer.create({
      data: { userId: input.userId, fromWallet: input.fromWallet, toWallet: input.toWallet, amount: input.amount, feeAmount: new Prisma.Decimal(0), receivedAmount, reason, idempotencyKey: input.idempotencyKey },
    });
    const journal = await postBalancedJournal(tx, {
      referenceType: "WALLET_TRANSFER",
      referenceId: transfer.id,
      idempotencyKey: `wallet-transfer:${input.idempotencyKey}`,
      memo: reason,
      lines: [
        { accountId: source.id, direction: "DEBIT", amount: input.amount },
        { accountId: destination.id, direction: "CREDIT", amount: receivedAmount },
      ],
    });

    return tx.walletTransfer.update({ where: { id: transfer.id }, data: { status: "COMPLETED", ledgerJournalId: journal.id, completedAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function creditConfirmedDepositToSpot(depositId: string) {
  return prisma.$transaction(async (tx) => {
    const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: depositId } });
    if (deposit.status === "CREDITED") return deposit;
    if (deposit.status !== "CONFIRMED") throw new Error("Deposit is not confirmed");
    const [spot, treasury] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: deposit.userId, assetId: deposit.assetId, type: "SPOT" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: deposit.assetId, type: "FEE" } }),
    ]);
    await postBalancedJournal(tx, { referenceType: "DEPOSIT", referenceId: deposit.id, idempotencyKey: `deposit:${deposit.id}`, memo: "Deposit credited to Spot wallet", lines: [{ accountId: treasury.id, direction: "DEBIT", amount: deposit.amount }, { accountId: spot.id, direction: "CREDIT", amount: deposit.amount }] });
    await tx.user.update({ where: { id: deposit.userId }, data: { spotBalance: { increment: deposit.amount } } });
    return tx.deposit.update({ where: { id: deposit.id }, data: { status: "CREDITED", creditedAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createWithdrawal(input: { userId: string; walletType: WithdrawalWallet; networkId: string; address: string; amount: Prisma.Decimal; idempotencyKey: string }) {
  if (!input.idempotencyKey.trim()) throw new Error("Idempotency key is required");
  if (!input.address.trim()) throw new Error("External wallet address is required");
  if (input.amount.lte(0)) throw new Error("Withdrawal amount must be positive");
  if (input.walletType !== "SPOT" && input.walletType !== "BITEX") throw new Error("Only Spot and AI withdrawals are supported");
  const percentageFee = input.amount.mul(WITHDRAWAL_PERCENTAGE_RATE);
  const feeAmount = input.walletType === "SPOT" ? WITHDRAWAL_FIXED_FEE.add(percentageFee) : new Prisma.Decimal(0);
  const receivableAmount = input.amount.sub(feeAmount);
  if (receivableAmount.lte(0)) throw new Error("Withdrawal amount must exceed the total fee");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.withdrawal.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: "USDT" } });
    await tx.chainNetwork.findUniqueOrThrow({ where: { id: input.networkId } });

    if (input.walletType === "BITEX") {
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
      if (user.bitexPrincipal.gt(0) && user.bitexIncomeEarned.lt(user.bitexPrincipal.mul(2))) {
        throw new Error("AI withdrawal will unlock after completing 2x copy trade income.");
      }
      if (user.bitexBalance.lt(input.amount)) throw new Error("Insufficient AI Wallet balance");
      return tx.withdrawal.create({
        data: {
          userId: input.userId,
          assetId: asset.id,
          networkId: input.networkId,
          walletType: "BITEX",
          address: input.address,
          amount: input.amount,
          feeAmount,
          receivableAmount,
          idempotencyKey: input.idempotencyKey,
          status: "PENDING",
        },
      });
    }

    const debit = await tx.user.updateMany({ where: { id: input.userId, spotBalance: { gte: input.amount } }, data: { spotBalance: { decrement: input.amount } } });
    if (debit.count !== 1) throw new Error("Insufficient Spot wallet balance");

    const [spotAccount, externalPayable, feeAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: input.userId, assetId: asset.id, type: "SPOT" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "SPOT" } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
    ]);
    const withdrawal = await tx.withdrawal.create({
      data: {
        userId: input.userId,
        assetId: asset.id,
        networkId: input.networkId,
        walletType: "SPOT",
        address: input.address,
        amount: input.amount,
        feeAmount,
        receivableAmount,
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
      },
    });
    const journal = await postBalancedJournal(tx, { referenceType: "SPOT_WITHDRAWAL", referenceId: withdrawal.id, idempotencyKey: `spot-withdrawal:${input.idempotencyKey}`, memo: "Spot withdrawal with fixed and percentage fee", lines: [{ accountId: spotAccount.id, direction: "DEBIT", amount: input.amount }, { accountId: externalPayable.id, direction: "CREDIT", amount: receivableAmount }, { accountId: feeAccount.id, direction: "CREDIT", amount: feeAmount }] });
    return tx.withdrawal.update({ where: { id: withdrawal.id }, data: { ledgerJournalId: journal.id, status: "COMPLETED" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export const createSpotWithdrawal = (input: { userId: string; networkId: string; toAddress: string; amount: Prisma.Decimal; idempotencyKey: string }) =>
  createWithdrawal({ ...input, walletType: "SPOT", address: input.toAddress });

export async function approveBitexWithdrawal(input: { withdrawalId: string; adminUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: input.withdrawalId } });
    if (withdrawal.walletType !== "BITEX") throw new Error("Only AI withdrawals require approval");
    if (withdrawal.status !== "PENDING") throw new Error("Withdrawal has already been actioned");
    const user = await tx.user.findUniqueOrThrow({ where: { id: withdrawal.userId } });
    if (user.bitexPrincipal.gt(0) && user.bitexIncomeEarned.lt(user.bitexPrincipal.mul(2))) throw new Error("AI 2x target is not complete");
    const debit = await tx.user.updateMany({ where: { id: withdrawal.userId, bitexBalance: { gte: withdrawal.amount } }, data: { bitexBalance: { decrement: withdrawal.amount } } });
    if (debit.count !== 1) throw new Error("Insufficient AI Wallet balance");
    const [bitexAccount, externalPayable] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: withdrawal.userId, assetId: withdrawal.assetId, type: "BITEX" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: withdrawal.assetId, type: "SPOT" } }),
    ]);
    const journal = await postBalancedJournal(tx, { referenceType: "BITEX_WITHDRAWAL", referenceId: withdrawal.id, idempotencyKey: `bitex-withdrawal:${withdrawal.id}`, memo: "Approved AI withdrawal", lines: [{ accountId: bitexAccount.id, direction: "DEBIT", amount: withdrawal.amount }, { accountId: externalPayable.id, direction: "CREDIT", amount: withdrawal.receivableAmount }] });
    return tx.withdrawal.update({ where: { id: withdrawal.id }, data: { status: "APPROVED", adminActionBy: input.adminUserId, adminActionAt: new Date(), ledgerJournalId: journal.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectBitexWithdrawal(input: { withdrawalId: string; adminUserId: string; rejectionReason?: string }) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: input.withdrawalId } });
    if (withdrawal.walletType !== "BITEX") throw new Error("Only AI withdrawals require approval");
    if (withdrawal.status !== "PENDING") throw new Error("Withdrawal has already been actioned");
    return tx.withdrawal.update({ where: { id: withdrawal.id }, data: { status: "REJECTED", adminActionBy: input.adminUserId, adminActionAt: new Date(), rejectionReason: input.rejectionReason?.trim() || null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function balanceField(wallet: UserWallet): "spotBalance" | "futuresBalance" | "bitexBalance" {
  if (wallet === "SPOT") return "spotBalance";
  if (wallet === "FUTURES") return "futuresBalance";
  return "bitexBalance";
}
