import assert from "node:assert/strict";
import { matchesTradeWindowSignalOccurrence, tradeWindowSignalOccurrenceKey } from "../lib/domain/trade-window-signal";

const window = {
  slotId: "window-3",
  windowStartAt: new Date("2026-07-14T14:30:00.000Z"),
  windowCloseAt: new Date("2026-07-14T14:45:00.000Z"),
};
const signal = {
  occurrenceKey: tradeWindowSignalOccurrenceKey(window.slotId, window.windowStartAt),
  slotId: window.slotId,
  windowStartAt: window.windowStartAt,
  windowCloseAt: window.windowCloseAt,
  recommendedPair: "FONKUSDT",
};

assert.equal(matchesTradeWindowSignalOccurrence(signal, window), true);
assert.equal(matchesTradeWindowSignalOccurrence({ ...signal, recommendedPair: "" }, window), false);
assert.equal(matchesTradeWindowSignalOccurrence({ ...signal, slotId: "window-2" }, window), false);
assert.equal(matchesTradeWindowSignalOccurrence({ ...signal, occurrenceKey: "manual-signal:other" }, window), false);
assert.equal(matchesTradeWindowSignalOccurrence({ ...signal, windowStartAt: new Date("2026-07-15T14:30:00.000Z") }, window), false);
assert.equal(matchesTradeWindowSignalOccurrence({ ...signal, windowCloseAt: new Date("2026-07-14T15:00:00.000Z") }, window), false);

const nextWindow = {
  ...window,
  windowStartAt: new Date("2026-07-15T14:30:00.000Z"),
  windowCloseAt: new Date("2026-07-15T14:45:00.000Z"),
};
const nextSignal = {
  ...signal,
  occurrenceKey: tradeWindowSignalOccurrenceKey(nextWindow.slotId, nextWindow.windowStartAt),
  windowStartAt: nextWindow.windowStartAt,
  windowCloseAt: nextWindow.windowCloseAt,
  recommendedPair: "UNIUSDT",
};

assert.equal(matchesTradeWindowSignalOccurrence(signal, nextWindow), false);
assert.equal(matchesTradeWindowSignalOccurrence(nextSignal, nextWindow), true);
assert.equal(signal.recommendedPair, "FONKUSDT");
assert.equal(nextSignal.recommendedPair, "UNIUSDT");

console.info("AI trade pair occurrence tests passed");
