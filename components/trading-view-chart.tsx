"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

const TRADING_VIEW_SCRIPT_ID = "tradingview-widget-script";
const TRADING_VIEW_SCRIPT_SRC = "https://s3.tradingview.com/tv.js";

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

declare global {
  interface Window {
    TradingView?: {
      widget?: TradingViewWidgetConstructor;
    };
  }
}

type TradingViewChartProps = {
  baseSymbol: string;
  pairLabel: string;
  price: string;
  changeLabel: string;
  positive: boolean;
};

export function resolveTradingViewSymbol(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/USDT$/, "");
  if (Object.prototype.hasOwnProperty.call(TRADING_VIEW_SYMBOLS, normalized)) return TRADING_VIEW_SYMBOLS[normalized];
  return `BINANCE:${normalized}USDT`;
}

export function TradingViewChart({ baseSymbol, pairLabel, price, changeLabel, positive }: TradingViewChartProps) {
  const reactId = useId().replace(/:/g, "");
  const containerId = useMemo(() => `tradingview_${baseSymbol.toLowerCase()}_${reactId}`, [baseSymbol, reactId]);
  const widgetRef = useRef<{ remove?: () => void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const tradingViewSymbol = useMemo(() => resolveTradingViewSymbol(baseSymbol), [baseSymbol]);

  useEffect(() => {
    widgetRef.current?.remove?.();
    widgetRef.current = null;
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = "";

    if (!tradingViewSymbol) {
      setState("unavailable");
      return;
    }

    let cancelled = false;
    setState("loading");

    loadTradingViewScript()
      .then(() => {
        if (cancelled) return;
        const widget = window.TradingView?.widget;
        if (!widget) throw new Error("TradingView widget unavailable");
        const target = document.getElementById(containerId);
        if (!target) return;
        target.innerHTML = "";
        widgetRef.current = new widget({
          autosize: true,
          symbol: tradingViewSymbol,
          interval: "1",
          timezone: "Asia/Kolkata",
          theme: "dark",
          style: "1",
          locale: "en",
          enable_publishing: false,
          allow_symbol_change: false,
          hide_side_toolbar: true,
          withdateranges: true,
          save_image: false,
          calendar: false,
          container_id: containerId,
          backgroundColor: "#050b08",
          gridColor: "rgba(24,255,138,0.08)",
          support_host: "https://www.tradingview.com",
        });
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
      widgetRef.current?.remove?.();
      widgetRef.current = null;
      const target = document.getElementById(containerId);
      if (target) target.innerHTML = "";
    };
  }, [containerId, tradingViewSymbol]);

  return (
    <section className="trade-chart-card tradingview-chart-card">
      <div className="trade-chart-head">
        <div className="min-w-0">
          <h2>{pairLabel}</h2>
          <div className="mt-2 flex items-end gap-2"><p>{price}</p><span className={positive ? "text-[#18ff8a]" : "text-[#ff4f6d]"}>{changeLabel}</span></div>
        </div>
      </div>
      <div className="tradingview-chart-shell">
        <div id={containerId} className="tradingview-chart-container" />
        {state === "loading" && <div className="tradingview-chart-state">Loading TradingView chart...</div>}
        {(state === "unavailable" || state === "error") && (
          <div className="tradingview-chart-state">{state === "unavailable" ? "TradingView chart is not available for this market." : "TradingView chart failed to load."}</div>
        )}
      </div>
    </section>
  );
}

function loadTradingViewScript() {
  if (window.TradingView?.widget) return Promise.resolve();
  const existing = document.getElementById(TRADING_VIEW_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise<void>((resolve, reject) => {
      if (window.TradingView?.widget) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("TradingView script failed")), { once: true });
    });
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = TRADING_VIEW_SCRIPT_ID;
    script.src = TRADING_VIEW_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView script failed"));
    document.head.appendChild(script);
  });
}
