import { Prisma } from "@prisma/client";

export const AI_ACTIVE_PRINCIPAL_THRESHOLD = new Prisma.Decimal(100);

export function isAiWalletActive(input: { bitexPrincipal: Prisma.Decimal }) {
  return input.bitexPrincipal.gte(AI_ACTIVE_PRINCIPAL_THRESHOLD);
}
