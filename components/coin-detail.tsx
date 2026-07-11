"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { BuySellPressurePanel, OrderBookPanel } from "./order-book";
import { TradingViewChart } from "./trading-view-chart";
import { ShineConverter } from "./shine-converter";
import { useLiveTickers } from "@/lib/use-market-data";
import { SHINE_PAIR, SHINE_PRICE_USD } from "@/lib/shine-token";

const TIMEFRAMES = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "30m", value: "30" },
  { label: "More", value: "60" },
] as const;

export function CoinDetail({ symbol }: { symbol: string }) {
  const [interval, setInterval] = useState("1");
  const tickers = useLiveTickers();
  const ticker = tickers.find(item => item.symbol === symbol);
  const base = symbol.replace("USDT", "");
  const pair = symbol.replace("USDT", "/USDT");
  const isShine = symbol === SHINE_PAIR;
  const price = ticker?.price ?? (isShine ? SHINE_PRICE_USD : 0);
  const changePercent = ticker?.changePercent ?? 0;
  const positive = changePercent >= 0;
  const priceLabel = price ? formatPrice(price) : "--";
  const changeLabel = ticker ? `${positive ? "+" : ""}${changePercent.toFixed(2)}%` : "--";
  const highLabel = ticker?.high ? formatPrice(ticker.high) : "--";
  const lowLabel = ticker?.low ? formatPrice(ticker.low) : "--";
  const volumeLabel = ticker?.volume ? formatVolume(ticker.volume) : "--";

  return (
    <main className="coin-detail-page market-terminal-page">
      <div className="coin-detail-atmosphere" aria-hidden="true"><span /><span /><i /><i /></div>
      <section className="market-terminal-shell">
        <header className="market-terminal-header">
          <div className="market-terminal-pair-row">
            <Link href="/dashboard?view=markets" aria-label="Back to Markets" className="market-terminal-back"><ArrowLeft size={20} /></Link>
            <h1>{pair}</h1>
            <button type="button" aria-label="Add to watchlist" className="market-terminal-watch"><Star size={18} /></button>
          </div>
          <div className="market-terminal-stats">
            <div className="market-terminal-price">
              <p>{priceLabel}</p>
              <div><span>≈ ${priceLabel}</span><b className={positive ? "is-up" : "is-down"}>{changeLabel}</b></div>
            </div>
            <dl className="market-terminal-stat-list">
              <div><dt>High</dt><dd>{highLabel}</dd></div>
              <div><dt>Low</dt><dd>{lowLabel}</dd></div>
              <div><dt>24H Vol</dt><dd>{volumeLabel}</dd></div>
            </dl>
          </div>
        </header>

        <nav className="market-timeframe-tabs" aria-label="Chart timeframe">
          {TIMEFRAMES.map(item => (
            <button key={item.label} type="button" onClick={() => setInterval(item.value)} className={interval === item.value ? "active" : ""}>
              {item.label}
            </button>
          ))}
          <button type="button" className="market-indicator-tab" disabled>Indicators</button>
        </nav>

        {isShine ? <ShineConverter /> : <TradingViewChart baseSymbol={base} interval={interval} />}
        <BuySellPressurePanel symbol={symbol} />
        <OrderBookPanel symbol={symbol} />
        <div className="market-terminal-bottom-space" aria-hidden="true" />
      </section>
      <FixedTradeActions />
    </main>
  );
}

function FixedTradeActions() {
  return (
    <div className="market-fixed-actions">
      <div>
        <button disabled className="coin-action-buy opacity-60">Buy Coming Soon</button>
        <button disabled className="coin-action-sell opacity-60">Sell Coming Soon</button>
      </div>
    </div>
  );
}

function formatPrice(value: number) {
  return value < 1 ? value.toFixed(6) : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatVolume(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}
