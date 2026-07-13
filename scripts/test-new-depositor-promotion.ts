import assert from "node:assert/strict";
import {
  calculateNewDepositorProfit,
  firstPromotionOccurrence,
  isNewDepositorProfitPercent,
  occurrenceForBusinessDay,
  promotionDayForOccurrence,
  promotionalOccurrenceForInstant,
} from "../lib/domain/new-depositor-promotion";

const regularDeposit = new Date("2026-07-13T04:30:00.000Z");
const first = firstPromotionOccurrence(regularDeposit);
assert.equal(first.windowStartAt.toISOString(), "2026-07-13T15:30:00.000Z");
assert.equal(first.windowCloseAt.toISOString(), "2026-07-13T15:45:00.000Z");
assert.equal(first.settlementDueAt.toISOString(), "2026-07-13T16:00:00.000Z");

for (let day = 1; day <= 10; day += 1) {
  const occurrence = occurrenceForBusinessDay(first.businessDay + day - 1);
  assert.equal(promotionDayForOccurrence(regularDeposit, occurrence.windowStartAt), day);
}
assert.equal(promotionDayForOccurrence(regularDeposit, occurrenceForBusinessDay(first.businessDay + 10).windowStartAt), 11);

const duringWindowDeposit = new Date("2026-07-13T15:40:00.000Z");
assert.equal(firstPromotionOccurrence(duringWindowDeposit).windowStartAt.toISOString(), "2026-07-13T15:30:00.000Z");
const atWindowCloseDeposit = new Date("2026-07-13T15:45:00.000Z");
assert.equal(firstPromotionOccurrence(atWindowCloseDeposit).windowStartAt.toISOString(), "2026-07-14T15:30:00.000Z");
const afterWindowDeposit = new Date("2026-07-13T16:15:00.000Z");
assert.equal(firstPromotionOccurrence(afterWindowDeposit).windowStartAt.toISOString(), "2026-07-14T15:30:00.000Z");

assert.equal(promotionalOccurrenceForInstant(new Date("2026-07-13T15:29:59.000Z")).live, false);
assert.equal(promotionalOccurrenceForInstant(new Date("2026-07-13T15:30:00.000Z")).live, true);
assert.equal(promotionalOccurrenceForInstant(new Date("2026-07-13T15:44:59.999Z")).live, true);
assert.equal(promotionalOccurrenceForInstant(new Date("2026-07-13T15:45:00.000Z")).live, false);

assert.equal(isNewDepositorProfitPercent(0.32), true);
assert.equal(isNewDepositorProfitPercent(0.36), true);
assert.equal(isNewDepositorProfitPercent(0.319999), false);
assert.equal(isNewDepositorProfitPercent(0.360001), false);
assert.equal(calculateNewDepositorProfit(100, 0.34), 0.34);

console.info("New depositor promotion calendar and rate tests passed.");
