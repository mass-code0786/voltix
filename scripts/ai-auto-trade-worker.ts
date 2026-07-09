import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const intervalMs = Number(process.env.AI_AUTO_TRADE_INTERVAL_MS ?? 30_000);

let running = false;
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
      liveWindow: result.liveWindow,
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

async function main() {
  log("worker started", { intervalMs });
  await tick();
  const timer = setInterval(() => {
    if (!stopped) void tick();
  }, intervalMs);

  const stop = async (signal: string) => {
    stopped = true;
    clearInterval(timer);
    log("worker stopping", { signal });
    while (running) await new Promise(resolve => setTimeout(resolve, 250));
    process.exit(0);
  };

  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

void main();
