import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getAdminOverview() {
  const [
    totalUsers,
    activeUsers,
    totalDeposits,
    totalWithdrawals,
    depositSum,
    withdrawalSum,
    incomeSum,
    pendingWithdrawals,
    pendingKyc,
    pendingSupport,
    activeTrades,
    queuedIncomeCredits,
    recentAudit,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.deposit.count(),
    prisma.withdrawal.count(),
    prisma.deposit.aggregate({ _sum: { amount: true } }),
    prisma.withdrawal.aggregate({ _sum: { amount: true } }),
    prisma.income.aggregate({ _sum: { amount: true } }),
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    prisma.kycRequest.count({ where: { status: "PENDING" } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
    prisma.copyTrade.count({ where: { status: "ACTIVE" } }),
    prisma.copyTrade.count({ where: { status: "COMPLETED" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { name: true, uid: true } } } }),
  ]);

  return {
    stats: {
      totalUsers,
      activeUsers,
      totalDeposits,
      totalWithdrawals,
      pendingKyc,
      pendingSupport,
      totalDepositAmount: decimalToNumber(depositSum._sum.amount ?? 0),
      totalWithdrawalAmount: decimalToNumber(withdrawalSum._sum.amount ?? 0),
      incomePaid: decimalToNumber(incomeSum._sum.amount ?? 0),
      pendingWithdrawals,
      activeTrades,
      queuedIncomeCredits,
    },
    recentActivity: recentAudit.map(log => [
      log.action,
      log.actor ? `${log.actor.name} / ${log.actor.uid}` : log.actorType,
      `${log.entityType} ${log.entityId}`,
      "Posted",
      formatDate(log.createdAt),
    ]),
  };
}

export async function getAdminUsers() {
  const users = await prisma.user.findMany({ orderBy: { joinedAt: "desc" }, take: 100 });
  return {
    rows: users.map(user => [
      `${user.name} / ${user.email}`,
      user.uid,
      money(user.spotBalance),
      money(user.futuresBalance),
      money(user.bitexBalance),
      `${money(user.bitexIncomeEarned)} / ${money(user.bitexTargetAmount)}`,
      user.status,
    ]),
  };
}

export async function getAdminWallets() {
  const users = await prisma.user.findMany({ orderBy: { updatedAt: "desc" }, take: 100 });
  return {
    rows: users.map(user => [
      `${user.name} / ${user.uid}`,
      money(user.spotBalance),
      money(user.futuresBalance),
      money(user.bitexBalance),
      money(user.bitexPrincipal),
      `${money(user.bitexIncomeEarned)} / ${money(user.bitexTargetAmount)}`,
      user.bitexUnlocked ? "Unlocked" : "Locked",
    ]),
  };
}

export async function getAdminDeposits() {
  const deposits = await prisma.deposit.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, uid: true } }, network: true },
  });
  return {
    rows: deposits.map(deposit => [
      deposit.network.name,
      `${deposit.user.name} / ${deposit.user.uid}`,
      money(deposit.amount),
      "$0.00",
      money(deposit.amount),
      deposit.txHash ?? "",
      deposit.status,
      deposit.id,
    ]),
  };
}

export async function getAdminWithdrawals() {
  const withdrawals = await prisma.withdrawal.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, uid: true } }, network: true },
  });
  const rows = withdrawals.map(withdrawal => [
    `${withdrawal.user.name} / ${withdrawal.user.uid}`,
    withdrawal.walletType,
    money(withdrawal.amount),
    withdrawal.address,
    withdrawal.network.name,
    money(withdrawal.feeAmount),
    withdrawal.status,
    withdrawal.rejectionReason ?? "",
    withdrawal.id,
  ]);
  return {
    spotRows: rows.filter(row => row[1] === "SPOT"),
    bitexRows: rows.filter(row => row[1] === "BITEX"),
  };
}

export async function getAdminAuditLogs() {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { name: true, uid: true } } } });
  return {
    rows: logs.map(log => [
      log.actor ? `${log.actor.name} / ${log.actor.uid}` : log.actorType,
      log.action,
      `${log.entityType} ${log.entityId}`,
      log.ipAddress ?? "",
      JSON.stringify(log.metadata),
      formatDate(log.createdAt),
    ]),
  };
}

export async function getAdminLedger() {
  const journals = await prisma.ledgerJournal.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { entries: { include: { account: { include: { user: { select: { name: true, uid: true } }, asset: true } } } } },
  });
  return {
    rows: journals.map(journal => {
      const debit = journal.entries.find(entry => entry.direction === "DEBIT");
      const credit = journal.entries.find(entry => entry.direction === "CREDIT");
      return [
        journal.id,
        credit?.account.user ? `${credit.account.user.name} / ${credit.account.user.uid}` : "",
        journal.referenceType,
        accountLabel(debit),
        accountLabel(credit),
        money(credit?.amount ?? 0),
        journal.status,
      ];
    }),
  };
}

export async function getAdminFeeLedger() {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { feeAmount: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, uid: true } } },
  });
  return {
    rows: withdrawals.map(withdrawal => [
      withdrawal.id,
      `${withdrawal.user.name} / ${withdrawal.user.uid}`,
      money(withdrawal.amount),
      "$2.00",
      money(withdrawal.feeAmount.sub(2)),
      money(withdrawal.feeAmount),
      money(withdrawal.receivableAmount),
    ]),
  };
}

export async function getAdminPlans() {
  const plans = await prisma.mlmPlan.findMany({ orderBy: [{ active: "desc" }, { packageAmountUsd: "asc" }], include: { packages: true } });
  return {
    plans: plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      amount: decimalToNumber(plan.packageAmountUsd),
      direct: decimalToNumber(plan.directPercent),
      matching: decimalToNumber(plan.matchingPercent),
      levels: Array.isArray(plan.levelPercents) ? plan.levelPercents.join("%, ") + "%" : JSON.stringify(plan.levelPercents),
      active: plan.packages.filter(pkg => pkg.status === "ACTIVE").length,
      activeFlag: plan.active,
    })),
  };
}

export async function getAdminSlots() {
  const slots = await prisma.tradeSlot.findMany({ orderBy: { utcTime: "asc" }, include: { trades: true } });
  return {
    slots: slots.map(slot => ({
      id: slot.id,
      time: slot.utcTime,
      name: slot.label,
      status: slot.enabled ? "Available" : "Disabled",
      count: slot.trades.length,
      duration: slot.durationMinutes,
      creditDelay: slot.creditDelayMins,
    })),
  };
}

export const emptyRows = { rows: [] as string[][] };

function accountLabel(entry: { account: { type: string; asset: { symbol: string } } } | undefined) {
  return entry ? `${entry.account.type} ${entry.account.asset.symbol}` : "";
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return Number(value.toString());
}

function money(value: Prisma.Decimal | number) {
  return `$${decimalToNumber(value).toFixed(2)}`;
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
