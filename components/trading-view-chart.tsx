"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { browserTimeZone } from "@/lib/local-time";
import { useTheme } from "@/components/theme-provider";

const TRADING_VIEW_SCRIPT_ID = "tradingview-widget-script";
const TRADING_VIEW_SCRIPT_SRC = "https://s3.tradingview.com/tv.js";
let tradingViewScriptPromise: Promise<void> | null = null;

export const TRADING_VIEW_SYMBOLS: Record<string, string | null> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  BNB: "BINANCE:BNBUSDT",
  SOL: "BINANCE:SOLUSDT",
  XRP: "BINANCE:XRPUSDT",
  DOGE: "BINANCE:DOGEUSDT",
  ADA: "BINANCE:ADAUSDT",
  TRX: "BINANCE:TRXUSDT",
  SHINE: null,
};

type TradingViewWidgetConstructor = new (options: Record<string, unknown>) => { remove?: () => void };
type TradingViewDiagnostics = {
  scriptLoaded: boolean;
  widgetCreated: boolean;
  symbol: string | null;
  exception: string | null;
};

declare global {
  interface Window {
    TradingView?: {
      widget?: TradingViewWidgetConstructor;
    };
  }
}

type TradingViewChartProps = {
  baseSymbol: string;
  interval?: string;
};

export function resolveTradingViewSymbol(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/USDT$/, "");
  if (Object.prototype.hasOwnProperty.call(TRADING_VIEW_SYMBOLS, normalized)) return TRADING_VIEW_SYMBOLS[normalized];
  return `BINANCE:${normalized}USDT`;
}

export function TradingViewChart({ baseSymbol, interval = "1" }: TradingViewChartProps) {
  const { resolvedTheme } = useTheme();
  const reactId = useId().replace(/:/g, "");
  const containerId = useMemo(() => `tradingview_${baseSymbol.toLowerCase()}_${reactId}`, [baseSymbol, reactId]);
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [diagnostics, setDiagnostics] = useState<TradingViewDiagnostics>({ scriptLoaded: false, widgetCreated: false, symbol: null, exception: null });
  const tradingViewSymbol = useMemo(() => resolveTradingViewSymbol(baseSymbol), [baseSymbol]);

  useEffect(() => {
    widgetRef.current?.remove?.();
    widgetRef.current = null;
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = "";

    if (!tradingViewSymbol) {
      setDiagnostics({ scriptLoaded: false, widgetCreated: false, symbol: null, exception: null });
      setState("unavailable");
      return;
    }

    let cancelled = false;
    setState("loading");
    setDiagnostics({ scriptLoaded: false, widgetCreated: false, symbol: tradingViewSymbol, exception: null });

    loadTradingViewScript()
      .then(() => {
        if (cancelled) return;
        setDiagnostics({ scriptLoaded: true, widgetCreated: false, symbol: tradingViewSymbol, exception: null });
        const widget = window.TradingView?.widget;
        if (!widget) throw new Error("TradingView widget unavailable");
        const target = document.getElementById(containerId);
        if (!target) throw new Error(`TradingView container not found: ${containerId}`);
        target.innerHTML = "";
        // The bootstrap script sets data-theme before hydration, so read it as
        // well as context to avoid briefly creating a dark widget on Aqua load.
        const isAqua = document.documentElement.dataset.theme === "aqua" || resolvedTheme === "aqua";
        widgetRef.current = new widget({
          autosize: true,
          width: "100%",
          height: "100%",
          symbol: tradingViewSymbol,
          interval,
          timezone: browserTimeZone(),
          theme: isAqua ? "light" : "dark",
          style: "1",
          locale: "en",
          enable_publishing: false,
          allow_symbol_change: false,
          hide_side_toolbar: true,
          withdateranges: true,
          save_image: false,
          calendar: false,
          container_id: containerId,
          backgroundColor: isAqua ? "#ffffff" : "#050b08",
          gridColor: isAqua ? "rgba(53,128,174,0.16)" : "rgba(24,255,138,0.08)",
          support_host: "https://www.tradingview.com",
        });
        setDiagnostics({ scriptLoaded: true, widgetCreated: true, symbol: tradingViewSymbol, exception: null });
        setState("ready");
      })
      .catch((error: unknown) => {
        const exception = error instanceof Error ? error.message : String(error);
        console.error("[TradingViewChart] widget failed", {
          scriptLoaded: Boolean(window.TradingView?.widget),
          widgetCreated: false,
          symbol: tradingViewSymbol,
          exception,
        });
        if (!cancelled) {
          setDiagnostics({ scriptLoaded: Boolean(window.TradingView?.widget), widgetCreated: false, symbol: tradingViewSymbol, exception });
          setState("error");
        }
      });

    return () => {
      cancelled = true;
      widgetRef.current?.remove?.();
      widgetRef.current = null;
      const target = document.getElementById(containerId);
      if (target) target.innerHTML = "";
    };
  }, [containerId, interval, resolvedTheme, tradingViewSymbol]);

  return (
    <section className="trade-chart-card tradingview-chart-card">
      <div className="tradingview-chart-shell">
        <div id={containerId} className="tradingview-chart-container" />
        {state === "loading" && <div className="tradingview-chart-state">Loading TradingView chart...</div>}
        {(state === "unavailable" || state === "error") && (
          <div className="tradingview-chart-state">
            <span>{state === "unavailable" ? "TradingView chart is not available for this market." : "TradingView chart failed to load."}</span>
            {state === "error" && (
              <code>
                scriptLoaded: {String(diagnostics.scriptLoaded)}
                {"\n"}widgetCreated: {String(diagnostics.widgetCreated)}
                {"\n"}symbol: {diagnostics.symbol ?? "null"}
                {"\n"}exception: {diagnostics.exception ?? "unknown"}
              </code>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function loadTradingViewScript() {
  if (window.TradingView?.widget) return Promise.resolve();
  if (tradingViewScriptPromise) return tradingViewScriptPromise;
  const existing = document.getElementById(TRADING_VIEW_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    tradingViewScriptPromise = new Promise<void>((resolve, reject) => {
      if (window.TradingView?.widget) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => {
        tradingViewScriptPromise = null;
        reject(new Error(`TradingView script failed to load: ${TRADING_VIEW_SCRIPT_SRC}`));
      }, { once: true });
    });
    return tradingViewScriptPromise;
  }
  tradingViewScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = TRADING_VIEW_SCRIPT_ID;
    script.src = TRADING_VIEW_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      tradingViewScriptPromise = null;
      script.remove();
      reject(new Error(`TradingView script failed to load: ${TRADING_VIEW_SCRIPT_SRC}`));
    };
    document.head.appendChild(script);
  });
  return tradingViewScriptPromise;
}
