import type { Prisma, PrismaClient } from "@prisma/client";

export const ACCOUNT_VERIFICATION_REQUIRED = "ACCOUNT_VERIFICATION_REQUIRED";
export const ACCOUNT_VERIFICATION_MESSAGE = "Please complete your account verification before making a withdrawal.";

type VerificationClient = Pick<PrismaClient, "kycRequest"> | Prisma.TransactionClient;

export class AccountVerificationRequiredError extends Error {
  code = ACCOUNT_VERIFICATION_REQUIRED;
  constructor() { super(ACCOUNT_VERIFICATION_MESSAGE); }
}

export async function requireVerifiedAccount(client: VerificationClient, userId: string) {
  const latest = await client.kycRequest.findFirst({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    select: { status: true },
  });
  if (latest?.status !== "APPROVED") throw new AccountVerificationRequiredError();
}
