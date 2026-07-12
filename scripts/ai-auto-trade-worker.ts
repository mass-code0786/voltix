import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const intervalMs = Number(process.env.AI_AUTO_TRADE_INTERVAL_MS ?? 30_000);
const configuredSettlementIntervalMs = Number(process.env.TRADE_SETTLEMENT_INTERVAL_MS ?? 2_000);
const settlementIntervalMs = Number.isFinite(configuredSettlementIntervalMs) && configuredSettlementIntervalMs >= 1_000
  ? Math.min(configuredSettlementIntervalMs, 5_000)
  : 2_000;

let running = false;
let settlementRunning = false;
let stopped = false;

function log(message: string, metadata: Record<string, unknown> = {}) {
  console.info("[AI_AUTO_TRADE_WORKER]", {
    message,
    loggedAt: new Date().toISOString(),
    ...metadata,
  });
}

async function tick() {
  if (running) {
    log("previous scheduler run still active");
    return;
  }
  running = true;
  try {
    const { runAiAutoTradeScheduler } = await import("../lib/domain/trade-service");
    log("scheduler started");
    const result = await runAiAutoTradeScheduler(new Date());
    log("scheduler completed", {
      currentUtc: result.currentUtc,
      currentIst: result.currentIst,
      liveWindow: result.liveWindow,
      windowStart: result.windowStart,
      windowClose: result.windowClose,
      settlementTime: result.settlementTime,
      settlement: result.settlement,
      usersScanned: result.usersScanned,
      tradesPlacedThisCycle: result.tradesPlacedThisCycle,
      aiTradesAlreadyExecutedThisWindow: result.aiTradesAlreadyExecutedThisWindow,
      manualTradesAlreadyPlacedThisWindow: result.manualTradesAlreadyPlacedThisWindow,
      totalTradesForWindow: result.totalTradesForWindow,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (error) {
    log("scheduler failed", {
      error: error instanceof Error ? error.message : "Unknown scheduler failure",
      stack: error instanceof Error ? error.stack : null,
    });
  } finally {
    running = false;
  }
}

async function settlementTick() {
  if (settlementRunning) return;
  settlementRunning = true;
  try {
    const { settleDueCopyTrades } = await import("../lib/domain/trade-service");
    const currentUtc = new Date();
    const result = await settleDueCopyTrades(undefined, currentUtc);
    if (result.windowsFound || result.totalFailed) log("settlement cycle completed", { currentUtc: currentUtc.toISOString(), ...result });
  } catch (error) {
    log("settlement cycle failed", { error: error instanceof Error ? error.message : "Unknown settlement failure" });
  } finally {
    settlementRunning = false;
  }
}

async function main() {
  log("worker started", { intervalMs, settlementIntervalMs });
  await settlementTick();
  await tick();
  const timer = setInterval(() => {
    if (!stopped) void tick();
  }, intervalMs);
  const settlementTimer = setInterval(() => {
    if (!stopped) void settlementTick();
  }, settlementIntervalMs);

  const stop = async (signal: string) => {
    stopped = true;
    clearInterval(timer);
    clearInterval(settlementTimer);
    log("worker stopping", { signal });
    while (running || settlementRunning) await new Promise(resolve => setTimeout(resolve, 250));
    process.exit(0);
  };

  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

void main();
