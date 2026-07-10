import { Prisma } from "@prisma/client";

export const ACTIVE_AI_WALLET_MIN_USD = 100;
export const AI_ACTIVE_PRINCIPAL_THRESHOLD = new Prisma.Decimal(ACTIVE_AI_WALLET_MIN_USD);

export function isAiWalletActive(input: { aiTradePrincipal: Prisma.Decimal }) {
  return input.aiTradePrincipal.gte(AI_ACTIVE_PRINCIPAL_THRESHOLD);
}

export function aiWalletBusinessAmount(input: { aiTradePrincipal: Prisma.Decimal }) {
  return isAiWalletActive(input) ? input.aiTradePrincipal : new Prisma.Decimal(0);
}
