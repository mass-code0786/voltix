import { Prisma } from "@prisma/client";

export const ACTIVE_AI_WALLET_MIN_USD = 100;
export const AI_ACTIVE_PRINCIPAL_THRESHOLD = new Prisma.Decimal(ACTIVE_AI_WALLET_MIN_USD);

export function isAiWalletActive(input: { bitexPrincipal: Prisma.Decimal }) {
  return input.bitexPrincipal.gte(AI_ACTIVE_PRINCIPAL_THRESHOLD);
}

export function aiWalletBusinessAmount(input: { bitexPrincipal: Prisma.Decimal }) {
  return isAiWalletActive(input) ? input.bitexPrincipal : new Prisma.Decimal(0);
}
