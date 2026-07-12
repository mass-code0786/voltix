import { Prisma, PrismaClient } from "@prisma/client";

type LedgerLine = { accountId: string; direction: "DEBIT" | "CREDIT"; amount: Prisma.Decimal };

export async function postBalancedJournal(
  tx: Prisma.TransactionClient | PrismaClient,
  input: { referenceType: string; referenceId: string; idempotencyKey: string; memo: string; lines: LedgerLine[]; occurredAt?: Date },
) {
  const debit = input.lines.filter(l => l.direction === "DEBIT").reduce((s,l) => s.add(l.amount), new Prisma.Decimal(0));
  const credit = input.lines.filter(l => l.direction === "CREDIT").reduce((s,l) => s.add(l.amount), new Prisma.Decimal(0));
  if (!debit.equals(credit) || debit.lte(0)) throw new Error("Ledger journal is not balanced");

  return tx.ledgerJournal.create({
    data: {
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      memo: input.memo,
      status: "POSTED",
      postedAt: input.occurredAt ?? new Date(),
      entries: { create: input.lines.map(line => ({ ...line, ...(input.occurredAt ? { createdAt: input.occurredAt } : {}) })) },
    },
    include: { entries: true },
  });
}
