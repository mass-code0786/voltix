import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const configuredIntervalMs = Number(process.env.TRADE_SETTLEMENT_INTERVAL_MS ?? 2_000);
const intervalMs = Number.isFinite(configuredIntervalMs) && configuredIntervalMs >= 1_000
  ? Math.min(configuredIntervalMs, 5_000)
  : 2_000;

let running = false;
let stopped = false;

function log(message: string, metadata: Record<string, unknown> = {}) {
  console.info("[TRADE_SETTLEMENT_WORKER]", { message, loggedAt: new Date().toISOString(), ...metadata });
}

async function tick() {
  if (running || stopped) return;
  running = true;
  try {
    const { settleDueTradeWindows } = await import("../lib/domain/bulk-trade-settlement");
    const currentUtc = new Date();
    const result = await settleDueTradeWindows(currentUtc);
    if (result.windowsFound || result.totalFailed) log("settlement cycle completed", { currentUtc: currentUtc.toISOString(), ...result });
  } catch (error) {
    log("settlement cycle failed", { error: error instanceof Error ? error.message : "Unknown settlement failure" });
  } finally {
    running = false;
  }
}

async function main() {
  log("worker started", { intervalMs });
  await tick();
  const timer = setInterval(() => void tick(), intervalMs);
  const stop = async (signal: string) => {
    if (stopped) return;
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
