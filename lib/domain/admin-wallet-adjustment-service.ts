import { Prisma, type WalletType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "./notification-service";
import { postBalancedJournal } from "./ledger";
import { ensureUserWalletAccounts } from "./user-wallets";
import { displayWalletName } from "@/lib/wallet-labels";
import { refreshUserVipRank } from "./vip-rank-service";

type UserWallet = Extract<WalletType, "SPOT" | "FUTURES" | "BITEX">;
type AdjustmentAction = "CREDIT" | "DEBIT";

export async function adjustAdminWallet(input: {
  adminUserId: string;
  userId: string;
  walletType: UserWallet;
  action: AdjustmentAction;
  amount: Prisma.Decimal;
  asset: "USDT";
  reason: string;
  idempotencyKey: string;
}) {
  if (!input.idempotencyKey.trim()) throw new Error("Idempotency key is required");
  if (!input.reason.trim()) throw new Error("Reason is required");
  if (input.amount.lte(0)) throw new Error("Amount must be positive");
  if (input.asset !== "USDT") throw new Error("Only USDT adjustments are supported");
  if (!["SPOT", "FUTURES", "BITEX"].includes(input.walletType)) throw new Error("Wallet type is not supported");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.adminWalletAdjustment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { user: true, admin: true, asset: true },
    });
    if (existing) return formatAdjustment(existing);

    const asset = await ensureUserWalletAccounts(tx, input.userId);
    const [user, admin, userAccount, treasuryAccount] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: input.userId } }),
      tx.user.findUniqueOrThrow({ where: { id: input.adminUserId } }),
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: input.userId, assetId: asset.id, type: input.walletType } } }),
      ensureSystemAccount(tx, asset.id, "FEE"),
    ]);

    const adjustment = await tx.adminWalletAdjustment.create({
      data: {
        userId: user.id,
        adminId: admin.id,
        assetId: asset.id,
        walletType: input.walletType,
        action: input.action,
        amount: input.amount,
        reason: input.reason.trim(),
        idempotencyKey: input.idempotencyKey,
      },
      include: { user: true, admin: true, asset: true },
    });

    const depositId = input.action === "CREDIT" && input.walletType === "SPOT"
      ? await createAdminSpotDeposit(tx, {
          userId: user.id,
          assetId: asset.id,
          amount: input.amount,
          adjustmentId: adjustment.id,
          reason: input.reason,
        })
      : null;

    if (input.action === "CREDIT") {
      await creditWalletBalance(tx, user.id, input.walletType, input.amount);
      if ((input.walletType === "SPOT" && depositId) || input.walletType === "BITEX") await refreshUserVipRank(user.id, tx);
    } else {
      await debitWalletBalance(tx, user.id, input.walletType, input.amount);
    }

    const journal = await postBalancedJournal(tx, {
      referenceType: "ADMIN_WALLET_ADJUSTMENT",
      referenceId: adjustment.id,
      idempotencyKey: `admin-wallet-adjustment:${input.idempotencyKey}`,
      memo: `Admin ${input.action === "CREDIT" ? "Credit" : "Deduct"} ${displayWalletName(input.walletType)}: ${input.reason.trim()}`,
      lines: input.action === "CREDIT"
        ? [
            { accountId: treasuryAccount.id, direction: "DEBIT", amount: input.amount },
            { accountId: userAccount.id, direction: "CREDIT", amount: input.amount },
          ]
        : [
            { accountId: userAccount.id, direction: "DEBIT", amount: input.amount },
            { accountId: treasuryAccount.id, direction: "CREDIT", amount: input.amount },
          ],
    });

    const completed = await tx.adminWalletAdjustment.update({
      where: { id: adjustment.id },
      data: { ledgerJournalId: journal.id, depositId },
      include: { user: true, admin: true, asset: true },
    });

    await createNotification(tx, {
      userId: user.id,
      type: "ADMIN_WALLET_ADJUSTMENT",
      title: input.action === "CREDIT" ? "Wallet credited" : "Wallet deducted",
      message: `${input.amount.toString()} ${asset.symbol} ${input.action === "CREDIT" ? "was credited to" : "was deducted from"} your ${displayWalletName(input.walletType)}. Reason: ${input.reason.trim()}`,
      metadata: {
        adjustmentId: completed.id,
        action: input.action,
        walletType: input.walletType,
        amount: input.amount.toString(),
        asset: asset.symbol,
        reason: input.reason.trim(),
        adminId: admin.id,
        ledgerJournalId: journal.id,
        depositId,
      },
    });

    return formatAdjustment(completed);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function createAdminSpotDeposit(tx: Prisma.TransactionClient, input: {
  userId: string;
  assetId: string;
  amount: Prisma.Decimal;
  adjustmentId: string;
  reason: string;
}) {
  const network = await ensureAdminNetwork(tx);
  const deposit = await tx.deposit.create({
    data: {
      userId: input.userId,
      assetId: input.assetId,
      networkId: network.id,
      provider: "NOWPAYMENTS",
      providerPaymentId: `admin-credit:${input.adjustmentId}`,
      payCurrency: "USDT",
      paymentStatus: "admin_credit",
      amount: input.amount,
      status: "CREDITED",
      creditedAt: new Date(),
      rawWebhookJson: { source: "ADMIN_WALLET_ADJUSTMENT", adjustmentId: input.adjustmentId, reason: input.reason },
    },
  });
  return deposit.id;
}

async function creditWalletBalance(tx: Prisma.TransactionClient, userId: string, walletType: UserWallet, amount: Prisma.Decimal) {
  if (walletType === "SPOT") {
    await tx.user.update({ where: { id: userId }, data: { spotBalance: { increment: amount } } });
    return;
  }
  if (walletType === "FUTURES") {
    await tx.user.update({ where: { id: userId }, data: { futuresBalance: { increment: amount } } });
    return;
  }
  await tx.user.update({
    where: { id: userId },
    data: {
      bitexBalance: { increment: amount },
      bitexPrincipal: { increment: amount },
      bitexTargetAmount: { increment: amount.mul("0.60") },
      bitexUnlocked: false,
    },
  });
}

async function debitWalletBalance(tx: Prisma.TransactionClient, userId: string, walletType: UserWallet, amount: Prisma.Decimal) {
  const field = balanceField(walletType);
  const result = await tx.user.updateMany({
    where: { id: userId, [field]: { gte: amount } },
    data: { [field]: { decrement: amount } },
  });
  if (result.count !== 1) throw new Error(`Insufficient ${displayWalletName(walletType)} balance`);
}

async function ensureSystemAccount(tx: Prisma.TransactionClient, assetId: string, type: WalletType) {
  const existing = await tx.walletAccount.findFirst({ where: { userId: null, assetId, type } });
  if (existing) return existing;
  return tx.walletAccount.create({ data: { userId: null, assetId, type } });
}

async function ensureAdminNetwork(tx: Prisma.TransactionClient) {
  return tx.chainNetwork.upsert({
    where: { key: "admin" },
    update: {},
    create: { key: "admin", name: "Admin Adjustment", requiredConfirmations: 0 },
  });
}

function balanceField(walletType: UserWallet) {
  if (walletType === "SPOT") return "spotBalance";
  if (walletType === "FUTURES") return "futuresBalance";
  return "bitexBalance";
}

function formatAdjustment(adjustment: {
  id: string;
  userId: string;
  adminId: string;
  walletType: WalletType;
  action: string;
  amount: Prisma.Decimal;
  reason: string;
  status: string;
  idempotencyKey: string;
  ledgerJournalId: string | null;
  depositId: string | null;
  createdAt: Date;
  user: { name: string; uid: string; email: string };
  admin: { name: string; uid: string; email: string };
  asset: { symbol: string };
}) {
  return {
    id: adjustment.id,
    userId: adjustment.userId,
    adminId: adjustment.adminId,
    user: `${adjustment.user.name} / ${adjustment.user.uid}`,
    userEmail: adjustment.user.email,
    admin: `${adjustment.admin.name} / ${adjustment.admin.uid}`,
    adminEmail: adjustment.admin.email,
    walletType: adjustment.walletType,
    action: adjustment.action,
    amount: Number(adjustment.amount.toString()),
    asset: adjustment.asset.symbol,
    reason: adjustment.reason,
    status: adjustment.status,
    idempotencyKey: adjustment.idempotencyKey,
    ledgerJournalId: adjustment.ledgerJournalId,
    depositId: adjustment.depositId,
    createdAt: adjustment.createdAt.toISOString(),
  };
}
