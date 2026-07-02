import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function validateManualTradeFunds(userId: string, amount: Prisma.Decimal) {
  if (amount.lte(0)) throw new Error("Manual trade amount must be positive");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { futuresBalance: true } });
  if (user.futuresBalance.lt(amount)) throw new Error("Please transfer funds to Futures wallet before starting manual trade.");
  return true;
}
