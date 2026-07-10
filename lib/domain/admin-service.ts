import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AI_ACTIVE_PRINCIPAL_THRESHOLD, isAiWalletActive } from "@/lib/domain/user-activation";
import { displayWalletName } from "@/lib/wallet-labels";
import { displayVipRank } from "@/lib/domain/vip-rank-service";

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
    prisma.user.count({ where: { aiTradePrincipal: { gte: AI_ACTIVE_PRINCIPAL_THRESHOLD } } }),
    prisma.deposit.count(),
    prisma.withdrawal.count(),
    prisma.deposit.aggregate({ _sum: { amount: true } }),
    prisma.withdrawal.aggregate({ _sum: { amount: true } }),
    prisma.income.aggregate({ _sum: { amount: true } }),
    prisma.withdrawal.count({ where: { status: "PENDING" } }),
    prisma.kycRequest.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
    prisma.copyTrade.count({ where: { status: { in: ["PENDING", "ACTIVE"] } } }),
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
  const depositedUserIds = await creditedDepositUserIds(users.map(user => user.id));
  return {
    rows: users.map(user => [
      `${user.name} / ${user.email}`,
      user.uid,
      displayVipRank(user, depositedUserIds.has(user.id)),
      money(user.spotBalance),
      money(user.futuresBalance),
      money(user.aiWalletBalance),
      `${money(user.aiTradeProfitEarned)} / ${money(user.aiTradePrincipal.mul("0.60"))}`,
      isAiWalletActive(user) ? "AI Active" : "Inactive",
    ]),
  };
}

export async function getAdminWallets() {
  const [users, adjustments] = await Promise.all([
    prisma.user.findMany({ orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.adminWalletAdjustment.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        user: { select: { name: true, uid: true, email: true } },
        admin: { select: { name: true, uid: true, email: true } },
        asset: true,
      },
    }),
  ]);
  const depositedUserIds = await creditedDepositUserIds(users.map(user => user.id));
  return {
    rows: users.map(user => [
      `${user.name} / ${user.uid}`,
      displayVipRank(user, depositedUserIds.has(user.id)),
      money(user.spotBalance),
      money(user.futuresBalance),
      money(user.aiWalletBalance),
      money(user.aiTradePrincipal),
      `${money(user.aiTradeProfitEarned)} / ${money(user.aiTradePrincipal.mul("0.60"))}`,
      user.aiTradePrincipal.eq(0) || user.aiTradeProfitEarned.gte(user.aiTradePrincipal.mul("0.60")) ? "Eligible" : "Early fee applies",
    ]),
    users: users.map(user => ({
      id: user.id,
      name: user.name,
      uid: user.uid,
      email: user.email,
      vipRank: displayVipRank(user, depositedUserIds.has(user.id)),
      spot: decimalToNumber(user.spotBalance),
      futures: decimalToNumber(user.futuresBalance),
      aiWallet: decimalToNumber(user.aiWalletBalance),
      aiTradePrincipal: decimalToNumber(user.aiTradePrincipal),
      aiTradeProfitEarned: decimalToNumber(user.aiTradeProfitEarned),
      aiTradeTargetAmount: decimalToNumber(user.aiTradeTargetAmount),
      aiTradeWithdrawalUnlocked: user.aiTradeWithdrawalUnlocked,
    })),
    adjustments: adjustments.map(adjustment => ({
      id: adjustment.id,
      user: `${adjustment.user.name} / ${adjustment.user.uid}`,
      userEmail: adjustment.user.email,
      admin: `${adjustment.admin.name} / ${adjustment.admin.uid}`,
      walletType: displayWalletName(adjustment.walletType),
      action: adjustment.action,
      amount: decimalToNumber(adjustment.amount),
      asset: adjustment.asset.symbol,
      reason: adjustment.reason,
      status: adjustment.status,
      ledgerJournalId: adjustment.ledgerJournalId,
      depositId: adjustment.depositId,
      createdAt: adjustment.createdAt.toISOString(),
    })),
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
      deposit.providerPaymentId ?? deposit.id,
      deposit.paymentStatus ?? deposit.status,
      `${deposit.user.name} / ${deposit.user.uid}`,
      money(deposit.amount),
      deposit.payCurrency?.toUpperCase() ?? deposit.network.name,
      deposit.actuallyPaid ? money(deposit.actuallyPaid) : "$0.00",
      deposit.status,
      deposit.creditedAt ? "Credited" : "Not credited",
      deposit.webhookReceivedAt ? formatDate(deposit.webhookReceivedAt) : "",
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
    displayWalletName(withdrawal.walletType),
    money(withdrawal.amount),
    withdrawal.address,
    withdrawal.network.name,
    withdrawal.earlyWithdrawal ? "Early Withdrawal" : withdrawal.walletType === "AI" ? "Eligible Withdrawal" : "Spot Withdrawal",
    `${money(withdrawal.totalCharges)} (${money(withdrawal.earlyWithdrawalCharge)} early, ${money(withdrawal.percentageFee)} 5%, ${money(withdrawal.fixedFee)} fixed)`,
    money(withdrawal.netWithdrawalAmount.gt(0) ? withdrawal.netWithdrawalAmount : withdrawal.receivableAmount),
    withdrawal.status,
    withdrawal.rejectionReason ?? "",
    withdrawal.id,
  ]);
  return {
    spotRows: rows.filter(row => row[1] === "Spot Wallet"),
    aiWalletRows: rows.filter(row => row[1] === "AI Wallet"),
  };
}

export async function getAdminP2PTransfers() {
  const transfers = await prisma.p2PTransfer.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      sender: { select: { name: true, uid: true, email: true } },
      receiver: { select: { name: true, uid: true, email: true } },
      asset: true,
    },
  });
  return {
    rows: transfers.map(transfer => [
      `${transfer.sender.name} / ${transfer.sender.uid}`,
      `${transfer.receiver.name} / ${transfer.receiver.uid}`,
      transfer.asset.symbol,
      money(transfer.amount),
      transfer.status,
      formatDate(transfer.createdAt),
      transfer.note ?? "",
    ]),
  };
}

type AuditFilters = {
  from?: string | null;
  to?: string | null;
  action?: string | null;
  module?: string | null;
  status?: string | null;
  user?: string | null;
  admin?: string | null;
  country?: string | null;
  ip?: string | null;
  search?: string | null;
};

export async function getAdminAuditLogs(filters: AuditFilters = {}) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.from || filters.to ? {
      createdAt: {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      },
    } : {}),
    ...(filters.action ? { action: { contains: filters.action, mode: "insensitive" } } : {}),
    ...(filters.module ? { module: { contains: filters.module, mode: "insensitive" } } : {}),
    ...(filters.status ? { status: filters.status as Prisma.EnumAuditStatusFilter<"AuditLog"> } : {}),
    ...(filters.country ? { country: { contains: filters.country, mode: "insensitive" } } : {}),
    ...(filters.ip ? { ipAddress: { contains: filters.ip, mode: "insensitive" } } : {}),
  };
  const search = filters.search?.trim();
  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { action: { contains: search, mode: "insensitive" } },
      { ipAddress: { contains: search, mode: "insensitive" } },
      { user: { is: { name: { contains: search, mode: "insensitive" } } } },
      { user: { is: { email: { contains: search, mode: "insensitive" } } } },
      { admin: { is: { name: { contains: search, mode: "insensitive" } } } },
      { admin: { is: { email: { contains: search, mode: "insensitive" } } } },
      { actor: { is: { name: { contains: search, mode: "insensitive" } } } },
      { actor: { is: { email: { contains: search, mode: "insensitive" } } } },
    ];
  }
  if (filters.user) {
    where.user = { is: { OR: [{ name: { contains: filters.user, mode: "insensitive" } }, { email: { contains: filters.user, mode: "insensitive" } }, { uid: { contains: filters.user, mode: "insensitive" } }] } };
  }
  if (filters.admin) {
    where.admin = { is: { OR: [{ name: { contains: filters.admin, mode: "insensitive" } }, { email: { contains: filters.admin, mode: "insensitive" } }, { uid: { contains: filters.admin, mode: "insensitive" } }] } };
  }
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 500, include: { user: { select: { name: true, uid: true, email: true } }, admin: { select: { name: true, uid: true, email: true } }, actor: { select: { name: true, uid: true, email: true } } } });
  const formatted = logs.map(log => {
    const userLabel = log.user ? `${log.user.name} / ${log.user.uid}` : log.actor && log.actorType === "USER" ? `${log.actor.name} / ${log.actor.uid}` : "";
    const adminLabel = log.admin ? `${log.admin.name} / ${log.admin.uid}` : log.actor && log.actorType === "ADMIN" ? `${log.actor.name} / ${log.actor.uid}` : "";
    return {
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      date: log.createdAt.toLocaleDateString(),
      time: log.createdAt.toLocaleTimeString(),
      userLabel,
      adminLabel,
      userEmail: log.user?.email ?? (log.actorType === "USER" ? log.actor?.email : null) ?? null,
      adminEmail: log.admin?.email ?? (log.actorType === "ADMIN" ? log.actor?.email : null) ?? null,
      role: log.role,
      action: log.action,
      module: log.module,
      description: log.description,
      status: log.status,
      ipAddress: log.ipAddress,
      country: log.country,
      city: log.city,
      userAgent: log.userAgent,
      device: log.device,
      browser: log.browser,
      os: log.os,
      requestMethod: log.requestMethod,
      requestPath: log.requestPath,
      requestId: log.requestId,
      oldValue: log.oldValue,
      newValue: log.newValue,
      metadata: log.metadata,
      errorMessage: log.errorMessage,
      durationMs: log.durationMs,
    };
  });
  return {
    rows: formatted.map(log => [
      log.date,
      log.time,
      log.userLabel || log.adminLabel || "System",
      log.role,
      log.action,
      log.module,
      log.status,
      log.ipAddress ?? "",
      log.country ?? "",
      log.id,
    ]),
    logs: formatted,
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
        journalTypeLabel(journal.referenceType),
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
      money(withdrawal.fixedFee.gt(0) ? withdrawal.fixedFee : 2),
      money(withdrawal.percentageFee.gt(0) ? withdrawal.percentageFee : withdrawal.feeAmount.sub(2)),
      money(withdrawal.earlyWithdrawalCharge),
      money(withdrawal.totalCharges.gt(0) ? withdrawal.totalCharges : withdrawal.feeAmount),
      money(withdrawal.netWithdrawalAmount.gt(0) ? withdrawal.netWithdrawalAmount : withdrawal.receivableAmount),
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
  return entry ? `${displayWalletName(entry.account.type as "SPOT" | "FUTURES" | "AI" | "FEE")} ${entry.account.asset.symbol}` : "";
}

function journalTypeLabel(referenceType: string) {
  if (referenceType === "AI_WALLET_WITHDRAWAL") return "AI Wallet Withdrawal";
  if (referenceType === "COPY_TRADE_PRINCIPAL_RETURN") return "AI Trade Principal Return";
  if (referenceType === "COPY_TRADE_INCOME") return "AI Trade Profit";
  return referenceType.replaceAll("_", " ");
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return Number(value.toString());
}

async function creditedDepositUserIds(userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const deposits = await prisma.deposit.groupBy({
    by: ["userId"],
    where: {
      userId: { in: userIds },
      OR: [
        { status: "CREDITED" },
        { status: "APPROVED", creditedAt: { not: null } },
      ],
    },
  });
  return new Set(deposits.map(deposit => deposit.userId));
}

function money(value: Prisma.Decimal | number) {
  return `$${decimalToNumber(value).toFixed(2)}`;
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
