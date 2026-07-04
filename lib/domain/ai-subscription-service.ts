import { CodeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { postBalancedJournal } from "./ledger";
import { postBotSubscriptionCommission } from "./income-service";
import { redeemTradeCode } from "./trade-service";
import { createNotification } from "./notification-service";

const AI_PRICE = new Prisma.Decimal(15);
const AI_VALIDITY_DAYS = 30;

export async function getAiSubscriptionStatus(userId: string, now = new Date()) {
  await expireOldSubscriptions(now);
  const subscription = await prisma.aiSubscription.findFirst({
    where: { userId, active: true, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
  });
  return {
    price: Number(AI_PRICE.toString()),
    validityDays: AI_VALIDITY_DAYS,
    subscription: subscription ? serializeSubscription(subscription, now) : null,
  };
}

export async function purchaseAiSubscription(userId: string, now = new Date()) {
  const subscription = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: "USDT" } });
    const debit = await tx.user.updateMany({
      where: { id: userId, spotBalance: { gte: AI_PRICE } },
      data: { spotBalance: { decrement: AI_PRICE } },
    });
    if (debit.count !== 1) throw new Error("Insufficient Spot wallet balance");

    const [spotAccount, revenueAccount] = await Promise.all([
      tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId, assetId: asset.id, type: "SPOT" } } }),
      tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
    ]);
    const journal = await postBalancedJournal(tx, {
      referenceType: "AI_SUBSCRIPTION_PURCHASE",
      referenceId: `${userId}:${now.toISOString()}`,
      idempotencyKey: `ai-subscription:${userId}:${now.getTime()}`,
      memo: "AI subscription purchase",
      lines: [
        { accountId: spotAccount.id, direction: "DEBIT", amount: AI_PRICE },
        { accountId: revenueAccount.id, direction: "CREDIT", amount: AI_PRICE },
      ],
    });
    await tx.aiSubscription.updateMany({ where: { userId, active: true, expiresAt: { gt: now } }, data: { active: false } });
    const created = await tx.aiSubscription.create({
      data: {
        userId,
        amountUsd: AI_PRICE,
        startsAt: now,
        expiresAt: new Date(now.getTime() + AI_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
        ledgerJournalId: journal.id,
      },
    });
    await tx.auditLog.create({
      data: { actorId: userId, actorType: "USER", action: "AI_SUBSCRIPTION_PURCHASED", entityType: "AiSubscription", entityId: created.id, metadata: { amount: AI_PRICE.toString(), expiresAt: created.expiresAt.toISOString(), ledgerJournalId: journal.id } },
    });
    await createNotification(tx, {
      userId,
      type: "AI_SUBSCRIPTION_PURCHASE",
      title: "AI subscription active",
      message: `AI subscription purchased for ${AI_PRICE.toString()} USDT.`,
      metadata: { subscriptionId: created.id, amount: AI_PRICE.toString(), expiresAt: created.expiresAt.toISOString() },
    });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const commission = await postBotSubscriptionCommission({ buyerUserId: userId, purchaseId: subscription.id, amount: AI_PRICE }).catch(() => ({ posted: false }));
  const autoTrade = await autoExecuteAiCopyTrade(userId).catch(error => ({ executed: false, reason: error instanceof Error ? error.message : "Auto copy trade failed" }));
  return { subscription: serializeSubscription(subscription, now), commission, autoTrade };
}

export async function runAiAutoCopyTradeJob(now = new Date()) {
  await expireOldSubscriptions(now);
  const subscriptions = await prisma.aiSubscription.findMany({
    where: { active: true, expiresAt: { gt: now } },
    select: { userId: true },
    take: 100,
  });
  let executed = 0;
  for (const subscription of subscriptions) {
    const result = await autoExecuteAiCopyTrade(subscription.userId, now).catch(() => ({ executed: false }));
    if (result.executed) executed += 1;
  }
  return { checked: subscriptions.length, executed };
}

async function autoExecuteAiCopyTrade(userId: string, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { vipRank: true } });
  const codes = await prisma.tradeCode.findMany({
    where: {
      status: CodeStatus.ACTIVE,
      vipRank: user.vipRank,
      expiresAt: { gt: now },
      assignedUserId: null,
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  const code = codes.find(item => item.usedCount < item.maxUsage);
  if (!code) return { executed: false, reason: "No eligible AI strategy code" };
  const trade = await redeemTradeCode({ userId, code: code.code, now });
  return { executed: true, tradeId: trade.id, code: code.code };
}

async function expireOldSubscriptions(now: Date) {
  await prisma.aiSubscription.updateMany({ where: { active: true, expiresAt: { lte: now } }, data: { active: false } });
}

function serializeSubscription(subscription: { id: string; amountUsd: Prisma.Decimal; startsAt: Date; expiresAt: Date; active: boolean }, now: Date) {
  return {
    id: subscription.id,
    amount: Number(subscription.amountUsd.toString()),
    startsAt: subscription.startsAt.toISOString(),
    expiresAt: subscription.expiresAt.toISOString(),
    active: subscription.active && subscription.expiresAt > now,
    remainingDays: Math.max(0, Math.ceil((subscription.expiresAt.getTime() - now.getTime()) / 86_400_000)),
  };
}
