import { IncomeType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { postBalancedJournal } from "./ledger";
import { settleDueCopyTrades } from "./trade-service";
import { createNotification } from "./notification-service";

const REFERRAL_LEVEL_1 = new Prisma.Decimal("0.05");
const REFERRAL_LEVEL_2 = new Prisma.Decimal("0.01");
const BOT_DIRECT_RATE = new Prisma.Decimal("0.10");
const vipSalaryByRank: Record<string, Prisma.Decimal> = {
  VIP: new Prisma.Decimal(process.env.VOLTIX_VIP_SALARY_VIP ?? 0),
  PRO: new Prisma.Decimal(process.env.VOLTIX_VIP_SALARY_PRO ?? 0),
};

export async function getUserIncomeHistory(userId: string) {
  const incomes = await prisma.income.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, uid: true } } },
  });
  return { incomes: incomes.map(formatIncome) };
}

export async function getAdminIncomeHistory() {
  const incomes = await prisma.income.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { name: true, uid: true } } },
  });
  return { incomes: incomes.map(formatIncome) };
}

export async function runIncomeScheduler(now = new Date()) {
  const copyTrades = await settleDueCopyTrades(undefined, now);
  const { runAiAutoCopyTradeJob } = await import("./ai-subscription-service");
  const ai = await runAiAutoCopyTradeJob(now);
  const vip = await runVipSalaryJob(now);
  return { copyTradesSettled: copyTrades, aiAutoCopy: ai, vipSalary: vip };
}

export async function postFirstDepositReferralIncome(depositId: string, adminUserId?: string) {
  return prisma.$transaction(async (tx) => {
    const deposit = await tx.deposit.findUniqueOrThrow({
      where: { id: depositId },
      include: { user: { include: { referredBy: { include: { referredBy: true } } } }, asset: true },
    });
    if (deposit.status !== "APPROVED" && deposit.status !== "CREDITED") return { posted: 0 };
    const otherApproved = await tx.deposit.count({
      where: { userId: deposit.userId, id: { not: deposit.id }, status: { in: ["APPROVED", "CREDITED"] } },
    });
    if (otherApproved > 0) return { posted: 0 };

    let posted = 0;
    if (deposit.user.referredById) {
      await postIncome(tx, {
        userId: deposit.user.referredById,
        type: "DIRECT",
        sourceType: "FIRST_DEPOSIT_REFERRAL_L1",
        sourceId: deposit.id,
        amount: deposit.amount.mul(REFERRAL_LEVEL_1),
        memo: "First deposit direct referral commission",
        auditAction: "REFERRAL_COMMISSION_PAID",
        actorId: adminUserId,
        metadata: { level: 1, depositUserId: deposit.userId, depositId: deposit.id },
      });
      posted += 1;
    }
    const level2Sponsor = deposit.user.referredBy?.referredBy;
    if (level2Sponsor) {
      await postIncome(tx, {
        userId: level2Sponsor.id,
        type: "LEVEL",
        sourceType: "FIRST_DEPOSIT_REFERRAL_L2",
        sourceId: deposit.id,
        amount: deposit.amount.mul(REFERRAL_LEVEL_2),
        memo: "First deposit level 2 referral commission",
        auditAction: "REFERRAL_COMMISSION_PAID",
        actorId: adminUserId,
        metadata: { level: 2, depositUserId: deposit.userId, depositId: deposit.id },
      });
      posted += 1;
    }
    return { posted };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function postBotSubscriptionCommission(input: { buyerUserId: string; purchaseId: string; amount: Prisma.Decimal }) {
  if (input.amount.lte(0)) throw new Error("AI purchase amount must be positive");
  return prisma.$transaction(async (tx) => {
    const buyer = await tx.user.findUniqueOrThrow({ where: { id: input.buyerUserId }, select: { referredById: true } });
    if (!buyer.referredById) return { posted: false };
    await postIncome(tx, {
      userId: buyer.referredById,
      type: "BOT_COMMISSION",
      sourceType: "AI_SUBSCRIPTION",
      sourceId: input.purchaseId,
      amount: input.amount.mul(BOT_DIRECT_RATE),
      memo: "Direct referral AI subscription commission",
      auditAction: "AI_COMMISSION_PAID",
      metadata: { buyerUserId: input.buyerUserId, purchaseId: input.purchaseId },
    });
    return { posted: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function runVipSalaryJob(now = new Date()) {
  if (!isVipSalaryDay(now)) return { due: false, paid: 0 };
  const period = vipSalaryPeriod(now);
  const users = await prisma.user.findMany({ where: { status: "ACTIVE", vipRank: { not: "NONE" } }, select: { id: true, vipRank: true } });
  let paid = 0;
  for (const user of users) {
    const amount = vipSalaryByRank[user.vipRank.toUpperCase()] ?? new Prisma.Decimal(0);
    if (amount.lte(0)) continue;
    const qualified = await verifyVipQualification(user.id, user.vipRank);
    if (!qualified) continue;
    await prisma.$transaction(async (tx) => {
      await postIncome(tx, {
        userId: user.id,
        type: "VIP_SALARY",
        sourceType: "VIP_SALARY",
        sourceId: period,
        amount,
        memo: `VIP salary ${period}`,
        auditAction: "VIP_SALARY_PAID",
        metadata: { vipRank: user.vipRank, period },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).then(() => { paid += 1; }).catch(() => null);
  }
  return { due: true, period, paid };
}

async function verifyVipQualification(userId: string, vipRank: string) {
  if (!vipRank || vipRank === "NONE") return false;
  const activePackage = await prisma.userPackage.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
  return Boolean(activePackage);
}

async function postIncome(tx: Prisma.TransactionClient, input: { userId: string; type: IncomeType; sourceType: string; sourceId: string; amount: Prisma.Decimal; memo: string; auditAction: string; actorId?: string; metadata?: Prisma.InputJsonValue }) {
  if (input.amount.lte(0)) return null;
  const existing = await tx.income.findUnique({
    where: { userId_type_sourceType_sourceId: { userId: input.userId, type: input.type, sourceType: input.sourceType, sourceId: input.sourceId } },
    select: { id: true },
  });
  if (existing) return null;
  const asset = await tx.asset.findUniqueOrThrow({ where: { symbol: "USDT" } });
  const [recipient, revenue] = await Promise.all([
    tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: input.userId, assetId: asset.id, type: "SPOT" } } }),
    tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
  ]);
  const journal = await postBalancedJournal(tx, {
    referenceType: input.sourceType,
    referenceId: `${input.userId}:${input.sourceId}`,
    idempotencyKey: `income:${input.userId}:${input.type}:${input.sourceType}:${input.sourceId}`,
    memo: input.memo,
    lines: [
      { accountId: revenue.id, direction: "DEBIT", amount: input.amount },
      { accountId: recipient.id, direction: "CREDIT", amount: input.amount },
    ],
  });
  const income = await tx.income.create({
    data: { userId: input.userId, type: input.type, sourceType: input.sourceType, sourceId: input.sourceId, amount: input.amount, ledgerJournalId: journal.id },
  });
  await tx.user.update({ where: { id: input.userId }, data: { spotBalance: { increment: input.amount } } });
  if (input.type === "DIRECT" || input.type === "LEVEL" || input.type === "BOT_COMMISSION") {
    await createNotification(tx, {
      userId: input.userId,
      type: "REFERRAL_INCOME",
      title: "Referral income credited",
      message: `${input.amount.toString()} USDT referral income has been credited to your Spot wallet.`,
      metadata: { incomeId: income.id, incomeType: input.type, sourceType: input.sourceType, sourceId: input.sourceId },
    });
  }
  await tx.auditLog.create({
    data: { actorId: input.actorId ?? input.userId, actorType: input.actorId ? "ADMIN" : "SYSTEM", action: input.auditAction, entityType: "Income", entityId: income.id, metadata: input.metadata ?? {} },
  });
  return income;
}

function isVipSalaryDay(now: Date) {
  const day = now.getUTCDate();
  return day === 1 || day === 16;
}

function vipSalaryPeriod(now: Date) {
  const half = now.getUTCDate() < 16 ? "01" : "16";
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${half}`;
}

function formatIncome(income: { id: string; type: IncomeType; sourceType: string; sourceId: string; amount: Prisma.Decimal; createdAt: Date; user: { name: string; uid: string } }) {
  return {
    id: income.id,
    type: income.type,
    sourceType: income.sourceType,
    sourceId: income.sourceId,
    amount: Number(income.amount.toString()),
    user: income.user,
    createdAt: income.createdAt.toISOString(),
  };
}
