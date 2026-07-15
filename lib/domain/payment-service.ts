import { DepositStatus, Prisma, WalletType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserWalletAccounts } from "./user-wallets";
import { requireVerifiedAccount } from "./account-verification";
import { postBalancedJournal } from "./ledger";
import { createNotification } from "./notification-service";
import { recalculateVipRanksForUserAndUplines } from "./vip-rank-service";
import { displayWalletName } from "@/lib/wallet-labels";
import {
  createNowPaymentsCustomer,
  createNowPaymentsCustomerPayment,
  createNowPaymentsPayout,
  NowPaymentsApiError,
  nowPaymentsCurrencyForNetwork,
  validateNowPaymentsPayoutAddress,
} from "./nowpayments-client";

const WITHDRAWAL_FIXED_FEE = new Prisma.Decimal(2);
const WITHDRAWAL_PERCENTAGE_RATE = new Prisma.Decimal("0.05");
const AI_WITHDRAWAL_ELIGIBILITY_RATE = new Prisma.Decimal("0.60");
const AI_EARLY_WITHDRAWAL_RATE = new Prisma.Decimal("0.20");
const networkNames: Record<string, string> = {
  bsc: "BNB Smart Chain",
  tron: "TRON",
  eth: "Ethereum",
};

type WithdrawalWallet = Extract<WalletType, "SPOT" | "AI">;
type NowPaymentsPayload = Record<string, unknown>;
type AiWithdrawalBreakdown = {
  requiresConfirmation: boolean;
  eligible: boolean;
  capitalAmount: number;
  earnedProfit: number;
  requiredProfit: number;
  completedPercentage: number;
  remainingPercentage: number;
  withdrawalAmount: number;
  earlyWithdrawalCharge: number;
  percentageFee: number;
  fixedFee: number;
  totalFees: number;
  netAmount: number;
};
type WithdrawalFeeBreakdown = {
  eligible: boolean;
  capitalAmount: Prisma.Decimal;
  earnedProfit: Prisma.Decimal;
  requiredProfit: Prisma.Decimal;
  completedPercentage: Prisma.Decimal;
  remainingPercentage: Prisma.Decimal;
  earlyWithdrawalCharge: Prisma.Decimal;
  percentageFee: Prisma.Decimal;
  fixedFee: Prisma.Decimal;
  totalFees: Prisma.Decimal;
  receivableAmount: Prisma.Decimal;
  withdrawalAmount: Prisma.Decimal;
};

export class AiWithdrawalConfirmationRequiredError extends Error {
  breakdown: AiWithdrawalBreakdown;

  constructor(breakdown: AiWithdrawalBreakdown) {
    super("Early AI withdrawal confirmation is required");
    this.name = "AiWithdrawalConfirmationRequiredError";
    this.breakdown = breakdown;
  }
}

export async function getUserDeposits(userId: string) {
  const deposits = await prisma.deposit.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { asset: true, network: true },
  });
  return { deposits: deposits.map(formatDeposit) };
}

export async function getOrCreateDepositAddresses(userId: string) {
  const existing = await prisma.depositAddress.findMany({
    where: { userId, active: true },
    include: { asset: true, network: true },
    orderBy: { network: { key: "asc" } },
  });
  const existingNetworks = new Set(existing.map(row => row.network.key.toUpperCase()));
  const missing = ["BSC", "TRON"].filter(network => !existingNetworks.has(network));
  if (!missing.length) return { addresses: existing.map(formatDepositAddress) };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { uid: true } });
  let customer = await prisma.paymentProviderCustomer.findUnique({ where: { userId } });
  if (!customer) {
    const name = `voltix-${user.uid}`.slice(0, 30);
    const remote = await createNowPaymentsCustomer(name);
    const providerCustomerId = valueAsString(remote.id ?? remote.sub_partner_id ?? remote.user_id);
    if (!providerCustomerId) throw new Error("NOWPayments customer response did not include an ID");
    customer = await prisma.paymentProviderCustomer.create({
      data: { userId, providerCustomerId, name, rawJson: remote as Prisma.InputJsonValue },
    });
  }

  for (const networkKey of missing) {
    const currency = nowPaymentsCurrencyForNetwork(networkKey);
    const remote = await createNowPaymentsCustomerPayment({
      customerId: customer.providerCustomerId,
      currency,
      amount: Number(process.env.MIN_DEPOSIT_AMOUNT_USDT || 10),
    });
    const providerPaymentId = valueAsString(remote.payment_id ?? remote.id);
    const address = valueAsString(remote.pay_address ?? remote.address);
    if (!providerPaymentId || !address) throw new Error(`NOWPayments did not return a ${networkKey} deposit address`);

    await prisma.$transaction(async tx => {
      const asset = await ensureUserWalletAccounts(tx, userId);
      const network = await ensureNetwork(tx, networkKey);
      const depositAddress = await tx.depositAddress.create({
        data: {
          userId,
          assetId: asset.id,
          networkId: network.id,
          providerCustomerId: customer!.providerCustomerId,
          providerPaymentId,
          payCurrency: currency,
          address,
          rawJson: remote as Prisma.InputJsonValue,
        },
      });
      await tx.deposit.create({
        data: {
          userId,
          assetId: asset.id,
          networkId: network.id,
          depositAddressId: depositAddress.id,
          providerPaymentId,
          payCurrency: currency,
          payAddress: address,
          paymentStatus: valueAsString(remote.payment_status) ?? "waiting",
          amount: decimalOrUndefined(remote.pay_amount ?? remote.amount) ?? new Prisma.Decimal(process.env.MIN_DEPOSIT_AMOUNT_USDT || 10),
          status: "PENDING",
          rawWebhookJson: remote as Prisma.InputJsonValue,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  const addresses = await prisma.depositAddress.findMany({
    where: { userId, active: true },
    include: { asset: true, network: true },
    orderBy: { network: { key: "asc" } },
  });
  return { addresses: addresses.map(formatDepositAddress) };
}

export async function createNowPaymentsDeposit(input: { userId: string; amount: Prisma.Decimal; network: string; payCurrency: string }) {
  if (input.amount.lte(0)) throw new Error("Deposit amount must be positive");
  const expectedCurrency = nowPaymentsCurrencyForNetwork(input.network);
  if (input.payCurrency.trim().toLowerCase() !== expectedCurrency) throw new Error("Payment currency does not match the selected network");
  const { addresses } = await getOrCreateDepositAddresses(input.userId);
  const address = addresses.find(row => row.network === input.network.trim().toUpperCase());
  if (!address) throw new Error("Permanent deposit address is unavailable");
  return {
    id: address.id,
    amount: Number(input.amount.toString()),
    asset: address.asset,
    network: address.network,
    networkName: address.networkName,
    provider: "NOWPAYMENTS",
    providerPaymentId: address.providerPaymentId,
    providerInvoiceId: null,
    providerPaymentUrl: null,
    payCurrency: address.payCurrency,
    payAddress: address.address,
    paymentStatus: "waiting",
    actuallyPaid: null,
    outcomeAmount: null,
    txHash: null,
    status: "PENDING",
    displayStatus: "Pending",
    confirmations: 0,
    requiredConfirmations: address.requiredConfirmations,
    creditedAt: null,
    webhookReceivedAt: null,
    createdAt: address.createdAt,
  };
}

export async function getUserDepositStatus(input: { userId: string; depositId: string }) {
  const deposit = await prisma.deposit.findFirstOrThrow({
    where: { id: input.depositId, userId: input.userId },
    include: { asset: true, network: true },
  });
  return formatDeposit(deposit);
}

export async function processNowPaymentsIpn(payload: NowPaymentsPayload) {
  const paymentId = valueAsString(payload.payment_id);
  if (!paymentId) throw new Error("NOWPayments callback is missing a provider payment identity");
  const orderId = valueAsString(payload.order_id);
  const parentPaymentId = valueAsString(payload.parent_payment_id);
  const paymentStatus = valueAsString(payload.payment_status) ?? "unknown";
  const providerInvoiceId = valueAsString(payload.invoice_id ?? payload.purchase_id);
  const payCurrency = valueAsString(payload.pay_currency)?.toLowerCase();
  const txHash = valueAsString(payload.payin_hash ?? payload.outcome_hash);
  const paidAmount = decimalOrUndefined(payload.actually_paid ?? payload.amount_received ?? payload.pay_amount);
  const payloadConfirmations = Number(payload.confirmations ?? 0);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    let target = paymentId
      ? await tx.deposit.findUnique({ where: { providerPaymentId: paymentId }, include: { asset: true, network: true } })
      : null;
    target ??= orderId ? await tx.deposit.findUnique({ where: { id: orderId }, include: { asset: true, network: true } }) : null;
    if (!target && parentPaymentId && paymentId) {
      const address = await tx.depositAddress.findUnique({ where: { providerPaymentId: parentPaymentId }, include: { asset: true, network: true } });
      if (address) {
        if (payCurrency && payCurrency !== address.payCurrency.toLowerCase()) throw new Error("Deposit currency does not match the permanent address");
        target = await tx.deposit.create({
          data: {
            userId: address.userId,
            assetId: address.assetId,
            networkId: address.networkId,
            depositAddressId: address.id,
            providerPaymentId: paymentId,
            parentPaymentId,
            payCurrency: payCurrency ?? address.payCurrency,
            payAddress: valueAsString(payload.pay_address) ?? address.address,
            paymentStatus,
            actuallyPaid: paidAmount,
            outcomeAmount: decimalOrUndefined(payload.outcome_amount),
            txHash,
            amount: paidAmount ?? new Prisma.Decimal(0),
            status: mapNowPaymentsStatus(paymentStatus),
            rawWebhookJson: payload as Prisma.InputJsonValue,
            webhookReceivedAt: now,
          },
          include: { asset: true, network: true },
        });
      }
    }
    if (!target) throw new Error("NOWPayments deposit was not found");
    if (payCurrency && target.payCurrency && payCurrency !== target.payCurrency.toLowerCase()) throw new Error("Deposit currency does not match the selected network");
    if (txHash) {
      const duplicateHash = await tx.deposit.findFirst({ where: { networkId: target.networkId, txHash, eventIndex: target.eventIndex, id: { not: target.id } }, select: { id: true } });
      if (duplicateHash) throw new Error("Deposit transaction hash has already been processed");
    }

    const status = mapNowPaymentsStatus(paymentStatus);
    const confirmations = Number.isFinite(payloadConfirmations) && payloadConfirmations > 0
      ? Math.floor(payloadConfirmations)
      : paymentStatus.toLowerCase() === "finished" ? target.network.requiredConfirmations : target.confirmations;
    const creditAmount = paidAmount ?? target.actuallyPaid;
    const updated = await tx.deposit.update({
      where: { id: target.id },
      data: {
        providerPaymentId: paymentId ?? target.providerPaymentId,
        providerInvoiceId: providerInvoiceId ?? target.providerInvoiceId,
        providerPaymentUrl: valueAsString(payload.payment_url ?? payload.invoice_url) ?? target.providerPaymentUrl,
        parentPaymentId: parentPaymentId ?? target.parentPaymentId,
        payCurrency: payCurrency ?? target.payCurrency,
        payAddress: valueAsString(payload.pay_address) ?? target.payAddress,
        paymentStatus,
        actuallyPaid: paidAmount,
        outcomeAmount: decimalOrUndefined(payload.outcome_amount),
        txHash: txHash ?? target.txHash,
        amount: creditAmount ?? target.amount,
        confirmations,
        status,
        rawWebhookJson: payload as Prisma.InputJsonValue,
        webhookReceivedAt: now,
      },
      include: { asset: true, network: true },
    });

    if (!isCreditableNowPaymentsStatus(paymentStatus) || updated.creditedAt) return formatDeposit(updated);
    if (!updated.txHash) throw new Error("Confirmed deposit is missing a blockchain transaction hash");
    if (updated.confirmations < updated.network.requiredConfirmations) return formatDeposit(updated);
    if (!creditAmount || creditAmount.lte(0)) throw new Error("Confirmed deposit is missing a verified paid amount");

    const [spotAccount, treasuryAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: updated.userId, assetId: updated.assetId, type: "SPOT" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: updated.assetId, type: "FEE" } }),
    ]);
    const journal = await postBalancedJournal(tx, {
      referenceType: "NOWPAYMENTS_DEPOSIT",
      referenceId: updated.id,
      idempotencyKey: `nowpayments-deposit:${updated.id}`,
      memo: "NOWPayments confirmed Spot wallet deposit",
      lines: [
        { accountId: treasuryAccount.id, direction: "DEBIT", amount: creditAmount },
        { accountId: spotAccount.id, direction: "CREDIT", amount: creditAmount },
      ],
    });
    await tx.user.update({ where: { id: updated.userId }, data: { spotBalance: { increment: creditAmount } } });
    const credited = await tx.deposit.update({
      where: { id: updated.id },
      data: { status: "CREDITED", creditedAt: now },
      include: { asset: true, network: true },
    });
    await recalculateVipRanksForUserAndUplines(updated.userId, tx);
    await createNotification(tx, {
      userId: updated.userId,
      type: "DEPOSIT_STATUS",
      title: "Deposit credited",
      message: `${creditAmount.toString()} ${updated.asset.symbol} has been credited to your Spot wallet.`,
      metadata: { depositId: updated.id, provider: "NOWPAYMENTS", paymentId, status: "CREDITED", ledgerJournalId: journal.id },
    });
    await tx.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "NOWPAYMENTS_DEPOSIT_CREDITED",
        role: "SYSTEM",
        module: "DEPOSIT",
        description: "NOWPayments deposit credited to Spot wallet",
        status: "SUCCESS",
        userId: updated.userId,
        entityType: "Deposit",
        entityId: updated.id,
        metadata: { userId: updated.userId, amount: creditAmount.toString(), asset: updated.asset.symbol, paymentId, paymentStatus, txHash: updated.txHash, ledgerJournalId: journal.id },
      },
    });
    return formatDeposit(credited);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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

export async function createWithdrawalRequest(input: { userId: string; walletType: WithdrawalWallet; amount: Prisma.Decimal; address: string; network: string; idempotencyKey: string; acceptEarlyWithdrawalCharge?: boolean }) {
  if (input.walletType === "AI") throw new Error("Direct withdrawal from AI Wallet is no longer available. Please transfer funds to your Spot Wallet first.");
  if (!input.idempotencyKey.trim()) throw new Error("Idempotency key is required");
  if (!input.address.trim()) throw new Error("External wallet address is required");
  if (input.amount.lte(0)) throw new Error("Withdrawal amount must be positive");
  if (input.amount.lt(new Prisma.Decimal(process.env.MIN_WITHDRAWAL_AMOUNT_USDT || 10))) throw new Error(`Minimum withdrawal is ${process.env.MIN_WITHDRAWAL_AMOUNT_USDT || 10} USDT`);
  if (input.walletType !== "SPOT" && input.walletType !== "AI") throw new Error("Only Spot and AI withdrawals are supported");
  const existing = await prisma.withdrawal.findFirst({
    where: { idempotencyKey: input.idempotencyKey, userId: input.userId },
    include: { asset: true, network: true },
  });
  if (existing) return formatWithdrawal(existing);
  const currency = nowPaymentsCurrencyForNetwork(input.network);
  validateLocalAddress(input.address, input.network);
  await validateNowPaymentsPayoutAddress(input.address.trim(), currency);

  const reserved = await prisma.$transaction(async (tx) => {
    await requireVerifiedAccount(tx, input.userId);
    const duplicate = await tx.withdrawal.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { asset: true, network: true },
    });
    if (duplicate) return { withdrawal: duplicate, created: false };

    const asset = await ensureUserWalletAccounts(tx, input.userId);
    const network = await ensureNetwork(tx, input.network);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: input.userId },
      select: { spotBalance: true, aiWalletBalance: true, aiTradePrincipal: true },
    });
    const earnedProfit = input.walletType === "AI" ? await calculateAiEarnedProfit(tx, input.userId) : new Prisma.Decimal(0);
    const feeBreakdown = input.walletType === "AI"
      ? calculateAiWithdrawalBreakdown({ capitalAmount: user.aiTradePrincipal, earnedProfit, withdrawalAmount: input.amount })
      : calculateSpotWithdrawalBreakdown(input.amount);
    if (feeBreakdown.receivableAmount.lte(0)) throw new Error("Withdrawal amount must exceed the total fee");

    if (input.walletType === "SPOT" && user.spotBalance.lt(input.amount)) throw new Error("Insufficient Spot wallet balance");
    if (input.walletType === "AI") {
      if (user.aiWalletBalance.lt(input.amount)) throw new Error("Insufficient AI Wallet balance");
      if (!feeBreakdown.eligible && !input.acceptEarlyWithdrawalCharge) {
        throw new AiWithdrawalConfirmationRequiredError(formatAiWithdrawalBreakdown(feeBreakdown, true));
      }
    }

    const withdrawal = await tx.withdrawal.create({
      data: {
        userId: input.userId,
        assetId: asset.id,
        networkId: network.id,
        walletType: input.walletType,
        address: input.address.trim(),
        amount: input.amount,
        feeAmount: feeBreakdown.totalFees,
        receivableAmount: feeBreakdown.receivableAmount,
        eligibilityStatus: input.walletType === "AI" ? feeBreakdown.eligible ? "ELIGIBLE_WITHDRAWAL" : "EARLY_WITHDRAWAL" : "SPOT_WITHDRAWAL",
        capitalAmount: feeBreakdown.capitalAmount,
        earnedProfit: feeBreakdown.earnedProfit,
        requiredProfit: feeBreakdown.requiredProfit,
        completedPercentage: feeBreakdown.completedPercentage,
        earlyWithdrawal: input.walletType === "AI" && !feeBreakdown.eligible,
        earlyWithdrawalCharge: feeBreakdown.earlyWithdrawalCharge,
        percentageFee: feeBreakdown.percentageFee,
        fixedFee: feeBreakdown.fixedFee,
        totalCharges: feeBreakdown.totalFees,
        netWithdrawalAmount: feeBreakdown.receivableAmount,
        earlyWithdrawalConfirmedAt: input.walletType === "AI" && !feeBreakdown.eligible ? new Date() : null,
        idempotencyKey: input.idempotencyKey,
        status: input.walletType === "SPOT" ? "PROCESSING" : "PENDING",
        processingAt: input.walletType === "SPOT" ? new Date() : null,
      },
      include: { asset: true, network: true },
    });
    if (input.walletType === "AI") {
      const journal = await postMemoJournal(tx, {
        referenceType: "AI_WITHDRAWAL_REQUEST",
        referenceId: withdrawal.id,
        idempotencyKey: `ai-withdrawal-request:${withdrawal.id}`,
        memo: "AI withdrawal request submitted",
      });
      const updated = await tx.withdrawal.update({ where: { id: withdrawal.id }, data: { requestJournalId: journal.id }, include: { asset: true, network: true } });
      await createNotification(tx, {
        userId: input.userId,
        type: "WITHDRAWAL_STATUS",
        title: "AI withdrawal submitted",
        message: `${input.amount.toString()} ${asset.symbol} AI withdrawal is pending admin review.`,
        metadata: { withdrawalId: withdrawal.id, status: "PENDING", walletType: "AI", requestJournalId: journal.id },
      });
      return { withdrawal: updated, created: true };
    }

    const debit = await tx.user.updateMany({
      where: { id: input.userId, spotBalance: { gte: input.amount } },
      data: { spotBalance: { decrement: input.amount } },
    });
    if (debit.count !== 1) throw new Error("Insufficient Spot wallet balance");
    const [spotAccount, externalPayable, feeAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: input.userId, assetId: asset.id, type: "SPOT" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "SPOT" } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
    ]);
    const journal = await postBalancedJournal(tx, {
      referenceType: "SPOT_WITHDRAWAL",
      referenceId: withdrawal.id,
      idempotencyKey: `spot-withdrawal:${withdrawal.id}`,
      memo: "Spot withdrawal processing",
      lines: [
        { accountId: spotAccount.id, direction: "DEBIT", amount: input.amount },
        { accountId: externalPayable.id, direction: "CREDIT", amount: feeBreakdown.receivableAmount },
        { accountId: feeAccount.id, direction: "CREDIT", amount: feeBreakdown.totalFees },
      ],
    });
    const updated = await tx.withdrawal.update({ where: { id: withdrawal.id }, data: { ledgerJournalId: journal.id }, include: { asset: true, network: true } });
    return { withdrawal: updated, created: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!reserved.created || reserved.withdrawal.walletType === "AI") return formatWithdrawal(reserved.withdrawal);
  try {
    return await submitWithdrawalPayout(reserved.withdrawal.id);
  } catch (error) {
    if (error instanceof NowPaymentsApiError && error.definitiveRejection) return failWithdrawalAndRefund(reserved.withdrawal.id, error.message);
    await prisma.withdrawal.update({ where: { id: reserved.withdrawal.id }, data: { failureReason: error instanceof Error ? error.message : "Payout submission response is unknown" } }).catch(() => null);
    const pending = await prisma.withdrawal.findUniqueOrThrow({ where: { id: reserved.withdrawal.id }, include: { asset: true, network: true } });
    return formatWithdrawal(pending);
  }
}

export function calculateWithdrawalFee(walletType: WithdrawalWallet, amount: Prisma.Decimal) {
  return walletType === "SPOT" ? calculateSpotWithdrawalBreakdown(amount).totalFees : WITHDRAWAL_FIXED_FEE.add(amount.mul(WITHDRAWAL_PERCENTAGE_RATE));
}

export function calculateAiWithdrawalBreakdown(input: { capitalAmount: Prisma.Decimal; earnedProfit: Prisma.Decimal; withdrawalAmount: Prisma.Decimal }): WithdrawalFeeBreakdown {
  const zero = new Prisma.Decimal(0);
  const hundred = new Prisma.Decimal(100);
  const capitalAmount = input.capitalAmount.gt(0) ? input.capitalAmount : zero;
  const earnedProfit = input.earnedProfit.gt(0) ? input.earnedProfit : zero;
  const requiredProfit = capitalAmount.mul(AI_WITHDRAWAL_ELIGIBILITY_RATE);
  const completedRaw = requiredProfit.gt(0) ? earnedProfit.div(requiredProfit).mul(100) : hundred;
  const completedPercentage = completedRaw.gt(100) ? hundred : completedRaw;
  const remainingPercentage = hundred.sub(completedPercentage).gt(0) ? hundred.sub(completedPercentage) : zero;
  const eligible = requiredProfit.eq(0) || earnedProfit.gte(requiredProfit);
  const earlyWithdrawalCharge = eligible ? zero : input.withdrawalAmount.mul(AI_EARLY_WITHDRAWAL_RATE);
  const percentageFee = input.withdrawalAmount.mul(WITHDRAWAL_PERCENTAGE_RATE);
  const fixedFee = WITHDRAWAL_FIXED_FEE;
  const totalFees = earlyWithdrawalCharge.add(percentageFee).add(fixedFee);
  return {
    eligible,
    capitalAmount,
    earnedProfit,
    requiredProfit,
    completedPercentage,
    remainingPercentage,
    earlyWithdrawalCharge,
    percentageFee,
    fixedFee,
    totalFees,
    receivableAmount: input.withdrawalAmount.sub(totalFees),
    withdrawalAmount: input.withdrawalAmount,
  };
}

function calculateSpotWithdrawalBreakdown(amount: Prisma.Decimal): WithdrawalFeeBreakdown {
  const zero = new Prisma.Decimal(0);
  const percentageFee = amount.mul(WITHDRAWAL_PERCENTAGE_RATE);
  const totalFees = WITHDRAWAL_FIXED_FEE.add(percentageFee);
  return {
    eligible: true,
    capitalAmount: zero,
    earnedProfit: zero,
    requiredProfit: zero,
    completedPercentage: new Prisma.Decimal(100),
    remainingPercentage: zero,
    earlyWithdrawalCharge: zero,
    percentageFee,
    fixedFee: WITHDRAWAL_FIXED_FEE,
    totalFees,
    receivableAmount: amount.sub(totalFees),
    withdrawalAmount: amount,
  };
}

async function calculateAiEarnedProfit(tx: Prisma.TransactionClient, userId: string) {
  const result = await tx.income.aggregate({
    where: { userId, type: "COPY_TRADE" },
    _sum: { amount: true },
  });
  return result._sum.amount ?? new Prisma.Decimal(0);
}

function formatAiWithdrawalBreakdown(breakdown: WithdrawalFeeBreakdown, requiresConfirmation: boolean): AiWithdrawalBreakdown {
  return {
    requiresConfirmation,
    eligible: breakdown.eligible,
    capitalAmount: decimalToNumber(breakdown.capitalAmount),
    earnedProfit: decimalToNumber(breakdown.earnedProfit),
    requiredProfit: decimalToNumber(breakdown.requiredProfit),
    completedPercentage: decimalToNumber(breakdown.completedPercentage),
    remainingPercentage: decimalToNumber(breakdown.remainingPercentage),
    withdrawalAmount: decimalToNumber(breakdown.withdrawalAmount),
    earlyWithdrawalCharge: decimalToNumber(breakdown.earlyWithdrawalCharge),
    percentageFee: decimalToNumber(breakdown.percentageFee),
    fixedFee: decimalToNumber(breakdown.fixedFee),
    totalFees: decimalToNumber(breakdown.totalFees),
    netAmount: decimalToNumber(breakdown.receivableAmount),
  };
}

export async function approveDepositRequest(input: { depositId: string; adminUserId: string }) {
  return prisma.$transaction(async (tx) => {
    const deposit = await tx.deposit.findUniqueOrThrow({ where: { id: input.depositId }, include: { asset: true, user: true } });
    if (deposit.provider === "NOWPAYMENTS") throw new Error("NOWPayments deposits are credited only by verified IPN");
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
    await recalculateVipRanksForUserAndUplines(deposit.userId, tx);
    await createNotification(tx, {
      userId: deposit.userId,
      type: "DEPOSIT_STATUS",
      title: "Deposit approved",
      message: `${deposit.amount.toString()} ${deposit.asset.symbol} has been credited to your Spot wallet.`,
      metadata: { depositId: deposit.id, status: "APPROVED", amount: deposit.amount.toString(), asset: deposit.asset.symbol },
    });
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
    if (deposit.provider === "NOWPAYMENTS") throw new Error("NOWPayments deposits are controlled by payment status");
    if (deposit.status !== "PENDING") throw new Error("Deposit has already been actioned");
    const journal = await postMemoJournal(tx, {
      referenceType: "DEPOSIT_REJECTION",
      referenceId: deposit.id,
      idempotencyKey: `deposit-rejection:${deposit.id}`,
      memo: "Admin rejected user deposit request",
    });
    const updated = await tx.deposit.update({ where: { id: deposit.id }, data: { status: "REJECTED" }, include: { asset: true, network: true } });
    await createNotification(tx, {
      userId: deposit.userId,
      type: "DEPOSIT_STATUS",
      title: "Deposit rejected",
      message: `${deposit.amount.toString()} ${deposit.asset.symbol} deposit request was rejected.`,
      metadata: { depositId: deposit.id, status: "REJECTED", amount: deposit.amount.toString(), asset: deposit.asset.symbol, reason: input.reason ?? null },
    });
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
  throw new Error("Legacy AI withdrawals are read-only and can no longer be approved.");
  /* Legacy implementation retained below for historical data compatibility.
  const approved = await prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: input.withdrawalId }, include: { asset: true, network: true } });
    if (withdrawal.status !== "PENDING") throw new Error("Withdrawal has already been actioned");
    if (withdrawal.walletType !== "AI") throw new Error("Only AI Wallet withdrawals require admin approval");
    const feeAmount = withdrawal.feeAmount;
    const receivableAmount = withdrawal.receivableAmount;
    if (receivableAmount.lte(0)) throw new Error("Withdrawal amount must exceed the total fee");

    const debit = await tx.user.updateMany({ where: { id: withdrawal.userId, aiWalletBalance: { gte: withdrawal.amount } }, data: { aiWalletBalance: { decrement: withdrawal.amount } } });
    if (debit.count !== 1) throw new Error(`Insufficient ${displayWalletName(withdrawal.walletType)} balance`);

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
      data: { status: "PROCESSING", feeAmount, receivableAmount, totalCharges: feeAmount, netWithdrawalAmount: receivableAmount, adminActionBy: input.adminUserId, adminActionAt: new Date(), processingAt: new Date(), ledgerJournalId: journal.id, decisionJournalId: journal.id },
      include: { asset: true, network: true },
    });
    await createNotification(tx, {
      userId: withdrawal.userId,
      type: "WITHDRAWAL_STATUS",
      title: "Withdrawal approved",
      message: `${receivableAmount.toString()} ${withdrawal.asset.symbol} withdrawal has been approved.`,
      metadata: { withdrawalId: withdrawal.id, status: "APPROVED", walletType: withdrawal.walletType, amount: withdrawal.amount.toString(), receivableAmount: receivableAmount.toString(), asset: withdrawal.asset.symbol, ledgerJournalId: journal.id },
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
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  try {
    return await submitWithdrawalPayout(approved.id);
  } catch (error) {
    if (error instanceof NowPaymentsApiError && error.definitiveRejection) return failWithdrawalAndRefund(approved.id, error.message);
    await prisma.withdrawal.update({ where: { id: approved.id }, data: { failureReason: error instanceof Error ? error.message : "Payout submission response is unknown" } }).catch(() => null);
    const pending = await prisma.withdrawal.findUniqueOrThrow({ where: { id: approved.id }, include: { asset: true, network: true } });
    return formatWithdrawal(pending);
  }
  */
}

export async function rejectWithdrawalRequest(input: { withdrawalId: string; adminUserId: string; reason?: string }) {
  throw new Error("Legacy AI withdrawals are read-only and can no longer be rejected.");
  /* Legacy implementation retained below for historical data compatibility.
  return prisma.$transaction(async (tx) => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: input.withdrawalId }, include: { asset: true, network: true } });
    if (withdrawal.status !== "PENDING") throw new Error("Withdrawal has already been actioned");
    if (withdrawal.walletType !== "AI") throw new Error("Only AI Wallet withdrawals require admin rejection");
    const journal = await postMemoJournal(tx, {
      referenceType: "WITHDRAWAL_REJECTION",
      referenceId: withdrawal.id,
      idempotencyKey: `withdrawal-rejection:${withdrawal.id}`,
      memo: "Admin rejected withdrawal request",
    });
    const updated = await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: "REJECTED", adminActionBy: input.adminUserId, adminActionAt: new Date(), rejectionReason: input.reason?.trim() || null, decisionJournalId: journal.id },
      include: { asset: true, network: true },
    });
    await createNotification(tx, {
      userId: withdrawal.userId,
      type: "WITHDRAWAL_STATUS",
      title: "AI withdrawal rejected",
      message: `${withdrawal.amount.toString()} ${withdrawal.asset.symbol} withdrawal request was rejected.`,
      metadata: { withdrawalId: withdrawal.id, status: "REJECTED", walletType: withdrawal.walletType, amount: withdrawal.amount.toString(), asset: withdrawal.asset.symbol, reason: input.reason ?? null },
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
  */
}

export async function processNowPaymentsPayoutIpn(payload: NowPaymentsPayload) {
  const payoutId = valueAsString(payload.id ?? payload.payout_id);
  const withdrawalId = valueAsString(payload.unique_external_id ?? payload.order_id);
  const providerStatus = (valueAsString(payload.status) ?? "unknown").toLowerCase();
  const txHash = valueAsString(payload.hash ?? payload.tx_hash);
  const withdrawal = payoutId
    ? await prisma.withdrawal.findUnique({ where: { providerPayoutId: payoutId } })
    : withdrawalId ? await prisma.withdrawal.findUnique({ where: { id: withdrawalId } }) : null;
  if (!withdrawal) throw new Error("NOWPayments withdrawal was not found");

  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: { providerPayoutId: payoutId ?? withdrawal.providerPayoutId, providerStatus, txHash: txHash ?? withdrawal.txHash, providerResponse: payload as Prisma.InputJsonValue },
  });
  if (providerStatus === "finished") return completeWithdrawal(withdrawal.id, txHash);
  if (providerStatus === "failed" || providerStatus === "rejected") {
    return failWithdrawalAndRefund(withdrawal.id, valueAsString(payload.error) ?? `NOWPayments payout ${providerStatus}`);
  }
  const current = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id }, include: { asset: true, network: true } });
  return formatWithdrawal(current);
}

async function submitWithdrawalPayout(withdrawalId: string) {
  const withdrawal = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId }, include: { asset: true, network: true } });
  if (withdrawal.providerPayoutId) return formatWithdrawal(withdrawal);
  const payout = await createNowPaymentsPayout({
    withdrawalId,
    address: withdrawal.address,
    currency: nowPaymentsCurrencyForNetwork(withdrawal.network.key),
    amount: Number(withdrawal.receivableAmount.toString()),
  });
  const updated = await prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: {
      providerPayoutId: payout.payoutId,
      providerBatchId: payout.batchId,
      providerStatus: payout.status,
      providerResponse: payout.raw as Prisma.InputJsonValue,
      txHash: payout.txHash,
      failureReason: null,
    },
    include: { asset: true, network: true },
  });
  if (payout.status.toLowerCase() === "finished") return completeWithdrawal(withdrawalId, payout.txHash);
  return formatWithdrawal(updated);
}

async function completeWithdrawal(withdrawalId: string, txHash?: string | null) {
  return prisma.$transaction(async tx => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId }, include: { asset: true, network: true } });
    if (withdrawal.status === "COMPLETED") return formatWithdrawal(withdrawal);
    if (withdrawal.status !== "PROCESSING") throw new Error("Withdrawal is not processing");
    const updated = await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: "COMPLETED", providerStatus: "finished", txHash: txHash ?? withdrawal.txHash, completedAt: new Date(), failureReason: null },
      include: { asset: true, network: true },
    });
    await createNotification(tx, {
      userId: withdrawal.userId,
      type: "WITHDRAWAL_STATUS",
      title: "Withdrawal completed",
      message: `${withdrawal.receivableAmount.toString()} ${withdrawal.asset.symbol} was sent successfully.`,
      metadata: { withdrawalId: withdrawal.id, status: "COMPLETED", walletType: withdrawal.walletType, txHash: updated.txHash, network: withdrawal.network.key.toUpperCase() },
    });
    return formatWithdrawal(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function failWithdrawalAndRefund(withdrawalId: string, reason: string) {
  return prisma.$transaction(async tx => {
    const withdrawal = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId }, include: { asset: true, network: true } });
    if (withdrawal.status === "FAILED") return formatWithdrawal(withdrawal);
    if (withdrawal.status !== "PROCESSING") throw new Error("Withdrawal is not processing");
    const [sourceAccount, externalPayable, feeAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: withdrawal.userId, assetId: withdrawal.assetId, type: withdrawal.walletType } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: withdrawal.assetId, type: "SPOT" } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: withdrawal.assetId, type: "FEE" } }),
    ]);
    const lines = [
      { accountId: externalPayable.id, direction: "DEBIT" as const, amount: withdrawal.receivableAmount },
      { accountId: sourceAccount.id, direction: "CREDIT" as const, amount: withdrawal.amount },
    ];
    if (withdrawal.feeAmount.gt(0)) lines.splice(1, 0, { accountId: feeAccount.id, direction: "DEBIT", amount: withdrawal.feeAmount });
    const refund = await postBalancedJournal(tx, {
      referenceType: "WITHDRAWAL_REFUND",
      referenceId: withdrawal.id,
      idempotencyKey: `withdrawal-refund:${withdrawal.id}`,
      memo: `${displayWalletName(withdrawal.walletType)} withdrawal failed and was refunded`,
      lines,
    });
    await tx.user.update({
      where: { id: withdrawal.userId },
      data: withdrawal.walletType === "AI" ? { aiWalletBalance: { increment: withdrawal.amount } } : { spotBalance: { increment: withdrawal.amount } },
    });
    const updated = await tx.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: "FAILED", providerStatus: "failed", failureReason: reason, completedAt: new Date(), decisionJournalId: withdrawal.decisionJournalId ?? refund.id },
      include: { asset: true, network: true },
    });
    await createNotification(tx, {
      userId: withdrawal.userId,
      type: "WITHDRAWAL_STATUS",
      title: "Withdrawal failed",
      message: `Your ${withdrawal.amount.toString()} ${withdrawal.asset.symbol} withdrawal failed and the balance was restored.`,
      metadata: { withdrawalId: withdrawal.id, status: "FAILED", walletType: withdrawal.walletType, reason, refundJournalId: refund.id },
    });
    return formatWithdrawal(updated);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function ensureNetwork(client: Prisma.TransactionClient, rawNetwork: string) {
  const key = (rawNetwork || "BSC").trim().toLowerCase();
  if (key !== "bsc" && key !== "tron") throw new Error("Only USDT BEP20 and USDT TRC20 are supported");
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

function validateLocalAddress(address: string, network: string) {
  const normalizedNetwork = network.trim().toUpperCase();
  const value = address.trim();
  if (normalizedNetwork === "BSC" && !/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error("Invalid BEP20 wallet address");
  if (normalizedNetwork === "TRON" && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) throw new Error("Invalid TRC20 wallet address");
}

function formatDepositAddress(address: { id: string; address: string; payCurrency: string; providerPaymentId: string; createdAt: Date; asset: { symbol: string }; network: { key: string; name: string; requiredConfirmations: number } }) {
  return {
    id: address.id,
    asset: address.asset.symbol,
    network: address.network.key.toUpperCase(),
    networkName: address.network.name,
    address: address.address,
    payCurrency: address.payCurrency.toUpperCase(),
    providerPaymentId: address.providerPaymentId,
    requiredConfirmations: address.network.requiredConfirmations,
    createdAt: address.createdAt.toISOString(),
  };
}

function formatDeposit(deposit: { id: string; amount: Prisma.Decimal; txHash: string | null; status: string; confirmations?: number; createdAt: Date; creditedAt?: Date | null; provider?: string; providerPaymentId?: string | null; providerInvoiceId?: string | null; providerPaymentUrl?: string | null; payCurrency?: string | null; payAddress?: string | null; paymentStatus?: string | null; actuallyPaid?: Prisma.Decimal | null; outcomeAmount?: Prisma.Decimal | null; webhookReceivedAt?: Date | null; asset: { symbol: string }; network: { key: string; name: string; requiredConfirmations?: number } }) {
  return {
    id: deposit.id,
    amount: Number(deposit.amount.toString()),
    asset: deposit.asset.symbol,
    network: deposit.network.key.toUpperCase(),
    networkName: deposit.network.name,
    provider: deposit.provider ?? "NOWPAYMENTS",
    providerPaymentId: deposit.providerPaymentId ?? null,
    providerInvoiceId: deposit.providerInvoiceId ?? null,
    providerPaymentUrl: deposit.providerPaymentUrl ?? null,
    payCurrency: deposit.payCurrency?.toUpperCase() ?? null,
    payAddress: deposit.payAddress ?? null,
    paymentStatus: deposit.paymentStatus ?? null,
    actuallyPaid: deposit.actuallyPaid ? Number(deposit.actuallyPaid.toString()) : null,
    outcomeAmount: deposit.outcomeAmount ? Number(deposit.outcomeAmount.toString()) : null,
    txHash: deposit.txHash,
    status: deposit.status,
    displayStatus: deposit.status === "CREDITED" || deposit.status === "APPROVED" ? "Completed" : deposit.status === "CONFIRMING" || deposit.status === "CONFIRMED" || deposit.status === "DETECTED" ? "Confirming" : deposit.status === "FAILED" || deposit.status === "REJECTED" || deposit.status === "EXPIRED" ? "Failed" : "Pending",
    confirmations: deposit.confirmations ?? 0,
    requiredConfirmations: deposit.network.requiredConfirmations ?? 0,
    creditedAt: deposit.creditedAt?.toISOString() ?? null,
    webhookReceivedAt: deposit.webhookReceivedAt?.toISOString() ?? null,
    createdAt: deposit.createdAt.toISOString(),
  };
}

function formatWithdrawal(withdrawal: { id: string; walletType: WalletType; amount: Prisma.Decimal; feeAmount: Prisma.Decimal; receivableAmount: Prisma.Decimal; address: string; txHash: string | null; status: string; rejectionReason: string | null; createdAt: Date; asset: { symbol: string }; network: { key: string; name: string }; eligibilityStatus?: string | null; capitalAmount?: Prisma.Decimal; earnedProfit?: Prisma.Decimal; requiredProfit?: Prisma.Decimal; completedPercentage?: Prisma.Decimal; earlyWithdrawal?: boolean; earlyWithdrawalCharge?: Prisma.Decimal; percentageFee?: Prisma.Decimal; fixedFee?: Prisma.Decimal; totalCharges?: Prisma.Decimal; netWithdrawalAmount?: Prisma.Decimal; earlyWithdrawalConfirmedAt?: Date | null; providerPayoutId?: string | null; providerStatus?: string | null; failureReason?: string | null; processingAt?: Date | null; completedAt?: Date | null; adminActionAt?: Date | null }) {
  return {
    id: withdrawal.id,
    walletType: displayWalletName(withdrawal.walletType),
    amount: decimalToNumber(withdrawal.amount),
    fee: decimalToNumber(withdrawal.feeAmount),
    receivable: decimalToNumber(withdrawal.receivableAmount),
    eligibilityStatus: withdrawal.eligibilityStatus ?? null,
    capitalAmount: withdrawal.capitalAmount ? decimalToNumber(withdrawal.capitalAmount) : 0,
    earnedProfit: withdrawal.earnedProfit ? decimalToNumber(withdrawal.earnedProfit) : 0,
    requiredProfit: withdrawal.requiredProfit ? decimalToNumber(withdrawal.requiredProfit) : 0,
    completedPercentage: withdrawal.completedPercentage ? decimalToNumber(withdrawal.completedPercentage) : 0,
    earlyWithdrawal: withdrawal.earlyWithdrawal ?? false,
    earlyWithdrawalCharge: withdrawal.earlyWithdrawalCharge ? decimalToNumber(withdrawal.earlyWithdrawalCharge) : 0,
    percentageFee: withdrawal.percentageFee ? decimalToNumber(withdrawal.percentageFee) : 0,
    fixedFee: withdrawal.fixedFee ? decimalToNumber(withdrawal.fixedFee) : 0,
    totalCharges: withdrawal.totalCharges ? decimalToNumber(withdrawal.totalCharges) : decimalToNumber(withdrawal.feeAmount),
    netWithdrawalAmount: withdrawal.netWithdrawalAmount ? decimalToNumber(withdrawal.netWithdrawalAmount) : decimalToNumber(withdrawal.receivableAmount),
    earlyWithdrawalConfirmedAt: withdrawal.earlyWithdrawalConfirmedAt?.toISOString() ?? null,
    asset: withdrawal.asset.symbol,
    address: withdrawal.address,
    network: withdrawal.network.key.toUpperCase(),
    networkName: withdrawal.network.name,
    txHash: withdrawal.txHash,
    status: withdrawal.status,
    providerPayoutId: withdrawal.providerPayoutId ?? null,
    providerStatus: withdrawal.providerStatus ?? null,
    rejectionReason: withdrawal.rejectionReason,
    failureReason: withdrawal.failureReason ?? null,
    processingAt: withdrawal.processingAt?.toISOString() ?? null,
    completedAt: withdrawal.completedAt?.toISOString() ?? null,
    adminApprovedAt: withdrawal.adminActionAt?.toISOString() ?? null,
    createdAt: withdrawal.createdAt.toISOString(),
  };
}

function decimalToNumber(value: Prisma.Decimal) {
  return Number(value.toString());
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

function nowPaymentsApiBase() {
  return (process.env.NOWPAYMENTS_API_BASE_URL || "https://api.nowpayments.io").replace(/\/$/, "");
}

function nowPaymentsCallbackUrl() {
  const configured = process.env.NOWPAYMENTS_IPN_CALLBACK_URL;
  if (configured) return configured;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!appUrl) throw new Error("NOWPayments IPN callback URL is not configured");
  return `${appUrl.replace(/\/$/, "")}/api/webhooks/nowpayments`;
}

function extractNowPaymentsError(data: NowPaymentsPayload) {
  return valueAsString(data.message) ?? valueAsString(data.error) ?? valueAsString(data.status);
}

function valueAsString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function decimalOrUndefined(value: unknown) {
  const stringValue = valueAsString(value);
  if (!stringValue) return undefined;
  try {
    return new Prisma.Decimal(stringValue);
  } catch {
    return undefined;
  }
}

function mapNowPaymentsStatus(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "finished") return DepositStatus.CONFIRMED;
  if (normalized === "confirmed") return DepositStatus.CONFIRMED;
  if (normalized === "confirming" || normalized === "sending" || normalized === "partially_paid") return DepositStatus.CONFIRMING;
  if (normalized === "failed" || normalized === "refunded") return DepositStatus.FAILED;
  if (normalized === "expired") return DepositStatus.EXPIRED;
  return DepositStatus.PENDING;
}

function isCreditableNowPaymentsStatus(status: string) {
  const normalized = status.toLowerCase();
  return normalized === "finished";
}
