import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { postBalancedJournal } from "./ledger";
import { ensureUserWalletAccounts } from "./user-wallets";
import { calculateHighestVipRank, vipSalaryForRank } from "./vip-rank-service";

export const VIP_BUSINESS_TIMEZONE = "Asia/Kolkata";

export async function runVipSalaryJob(now = new Date()) {
  const payoutDay = businessDate(now);
  const day = Number(payoutDay.slice(-2));
  if (day !== 1 && day !== 16) return { due: false, payoutDate: payoutDay, timezone: VIP_BUSINESS_TIMEZONE, paid: 0, skipped: 0, failed: 0 };

  const users = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let paid = 0;
  let skipped = 0;
  let failed = 0;
  for (const user of users) {
    const vip = await calculateHighestVipRank(user.id);
    if (!vip || vip.vipSalary <= 0) { skipped += 1; continue; }
    const result = await payVipSalary({ userId: user.id, vipRank: vip.vipRank, payoutDate: payoutDay });
    if (result === "CREDITED") paid += 1;
    else if (result === "FAILED") failed += 1;
    else skipped += 1;
  }
  return { due: true, payoutDate: payoutDay, timezone: VIP_BUSINESS_TIMEZONE, paid, skipped, failed };
}

export async function payVipSalary(input: { userId: string; vipRank: string; payoutDate: string }) {
  const amount = new Prisma.Decimal(vipSalaryForRank(input.vipRank));
  if (amount.lte(0)) return "SKIPPED" as const;
  const payoutDate = new Date(`${input.payoutDate}T00:00:00.000Z`);
  const reference = `VIP_SALARY:${input.userId}:${input.vipRank.replace(/\s+/g, "")}:${input.payoutDate}`;
  const payout = await prisma.vipSalaryPayout.upsert({
    where: { userId_payoutDate: { userId: input.userId, payoutDate } },
    update: {},
    create: { userId: input.userId, vipRank: input.vipRank, grossSalary: amount, payoutDate, transactionReference: reference },
  });
  if (payout.status === "CREDITED") return "SKIPPED" as const;
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const claimed = await prisma.vipSalaryPayout.updateMany({
    where: { id: payout.id, OR: [{ status: { in: ["PENDING", "FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: staleBefore } }] },
    data: { status: "PROCESSING", failureReason: null },
  });
  if (claimed.count !== 1) return "SKIPPED" as const;

  try {
    await prisma.$transaction(async tx => {
      const asset = await ensureUserWalletAccounts(tx, input.userId);
      const [spot, treasury] = await Promise.all([
        tx.walletAccount.findUniqueOrThrow({ where: { userId_assetId_type: { userId: input.userId, assetId: asset.id, type: "SPOT" } } }),
        tx.walletAccount.findFirstOrThrow({ where: { userId: null, assetId: asset.id, type: "FEE" } }),
      ]);
      const journal = await postBalancedJournal(tx, {
        referenceType: "VIP_SALARY",
        referenceId: payout.id,
        idempotencyKey: reference,
        memo: `${input.vipRank} fixed salary for ${input.payoutDate}`,
        lines: [{ accountId: treasury.id, direction: "DEBIT", amount }, { accountId: spot.id, direction: "CREDIT", amount }],
      });
      await tx.user.update({ where: { id: input.userId }, data: { spotBalance: { increment: amount } } });
      await tx.income.create({ data: { userId: input.userId, type: "VIP_SALARY", sourceType: "VIP_SALARY", sourceId: input.payoutDate, amount, ledgerJournalId: journal.id } });
      await tx.vipSalaryPayout.update({
        where: { id: payout.id },
        data: { status: "CREDITED", vipRank: input.vipRank, grossSalary: amount, transactionReference: reference, ledgerJournalId: journal.id, creditedAt: new Date() },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return "CREDITED" as const;
  } catch (error) {
    await prisma.vipSalaryPayout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 500) : "Salary credit failed" } }).catch(() => null);
    return "FAILED" as const;
  }
}

export function businessDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: VIP_BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
