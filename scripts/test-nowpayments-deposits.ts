import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { classifyNowPaymentsAmount, normalizeNowPaymentsPayment } from "../lib/domain/payment-service";

const withHash = normalizeNowPaymentsPayment({ payment_id: 101, payment_status: "finished", actually_paid: "10", payin_hash: "0xpayin", payout_hash: "0xpayout" });
assert.equal(withHash.paymentId, "101");
assert.equal(withHash.actuallyPaid?.toString(), "10");
assert.equal(withHash.payinHash, "0xpayin");
assert.equal(withHash.payoutHash, "0xpayout");

const withoutHash = normalizeNowPaymentsPayment({ payment_id: 102, payment_status: "finished", actually_paid: 10 });
assert.equal(withoutHash.actuallyPaid?.toString(), "10");
assert.equal(withoutHash.payinHash, null);

const payAmountFallback = normalizeNowPaymentsPayment({ payment_id: 103, payment_status: "finished", pay_amount: "10.05" });
assert.equal(payAmountFallback.actuallyPaid, undefined);
assert.equal(payAmountFallback.payAmount?.toString(), "10.05");

const confirming = normalizeNowPaymentsPayment({ payment_id: 104, payment_status: "confirming", pay_amount: "10" });
assert.equal(confirming.paymentStatus, "confirming");
assert.equal(confirming.actuallyPaid, undefined);

assert.equal(normalizeNowPaymentsPayment({ payment_id: 999, payment_status: "finished" }).paymentId, "999");
assert.equal(classifyNowPaymentsAmount(new Prisma.Decimal(10), new Prisma.Decimal("9.90"), new Prisma.Decimal("0.10")), null);
assert.equal(classifyNowPaymentsAmount(new Prisma.Decimal(10), new Prisma.Decimal("10.10"), new Prisma.Decimal("0.10")), null);
assert.equal(classifyNowPaymentsAmount(new Prisma.Decimal(10), new Prisma.Decimal("9.899"), new Prisma.Decimal("0.10")), "UNDERPAID");
assert.equal(classifyNowPaymentsAmount(new Prisma.Decimal(10), new Prisma.Decimal("10.101"), new Prisma.Decimal("0.10")), "OVERPAID");

console.info("NOWPayments response-shape and tolerance fixtures passed");
