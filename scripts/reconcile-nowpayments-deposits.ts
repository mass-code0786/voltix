import { prisma } from "../lib/prisma";
import { reconcileNowPaymentsDeposit } from "../lib/domain/payment-service";

async function main() {
  const requestedId = process.argv[2];
  const deposits = await prisma.deposit.findMany({
    where: requestedId
      ? { id: requestedId, provider: "NOWPAYMENTS", creditedAt: null }
      : { provider: "NOWPAYMENTS", paymentStatus: { equals: "finished", mode: "insensitive" }, status: "REVIEW_REQUIRED", creditedAt: null },
    select: { id: true, providerPaymentId: true },
    orderBy: { createdAt: "asc" },
  });
  for (const deposit of deposits) {
    try {
      const result = await reconcileNowPaymentsDeposit(deposit.id);
      console.info("NOWPayments reconciliation result", { localDepositId: deposit.id, providerPaymentId: deposit.providerPaymentId, status: result.status, creditedAt: result.creditedAt, reviewReason: result.failureReason });
    } catch (error) {
      console.error("NOWPayments reconciliation failed", { localDepositId: deposit.id, providerPaymentId: deposit.providerPaymentId, reason: error instanceof Error ? error.message : "unknown" });
    }
  }
  console.info("NOWPayments reconciliation complete", { processed: deposits.length });
}

main().finally(() => prisma.$disconnect());
