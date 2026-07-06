"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Star } from "lucide-react";
import { CandlestickChart } from "./candlestick-chart";
import { OrderBookPanel } from "./order-book";
import { useLiveTickers } from "@/lib/use-market-data";

export function CoinDetail({symbol}:{symbol:string}){
  const tickers=useLiveTickers();
  const ticker=tickers.find(item=>item.symbol===symbol);
  const base=symbol.replace("USDT","");
  const pair=symbol.replace("USDT"," / USDT");
  const positive=(ticker?.changePercent??0)>=0;
  return <main className="coin-detail-page mx-auto min-h-screen max-w-[430px] overflow-x-hidden px-4 pb-[120px] pt-4 lg:max-w-6xl">
    <div className="coin-detail-atmosphere" aria-hidden="true"><span/><span/><i/><i/></div>
    <Link href="/?view=markets" className="coin-back-link"><span><ArrowLeft size={18}/></span>Back to Markets</Link>
    <section className="coin-hero-card">
      <div className="relative z-10 min-w-0">
        <p className="coin-kicker">Live Market</p>
        <h1>{pair}</h1>
        <p className="coin-name">{base} live trading pair</p>
      </div>
      <div className="coin-hero-price">
        <div className="coin-logo-stage">
          <CoinPlatformSvg/>
          <img src={`/coin-logos/${base.toLowerCase()}.png`} alt={`${base} logo`} />
        </div>
        <p>{ticker?.price?formatPrice(ticker.price):"--"}</p>
        <span className={positive?"coin-change-up":"coin-change-down"}>{ticker?.price?`${positive?"+":""}${(ticker?.changePercent??0).toFixed(2)}%`:"--"}</span>
      </div>
    </section>
    {ticker&&<div className="coin-stats-grid">
      <MiniStat label="24h High" value={ticker.high?formatPrice(ticker.high):"--"}/>
      <MiniStat label="24h Low" value={ticker.low?formatPrice(ticker.low):"--"}/>
      <MiniStat label="24h Volume" value={ticker.volume?formatQty(ticker.volume):"--"}/>
      <MiniStat label="Quote Volume" value={ticker.quoteVolume?formatQty(ticker.quoteVolume):"--"}/>
    </div>}
    <div className="coin-detail-stack"><CandlestickChart symbol={symbol}/><OrderBookPanel symbol={symbol}/><TradeActions/></div>
  </main>;
}

function CoinPlatformSvg(){return <svg viewBox="0 0 92 76" aria-hidden="true">
  <defs><radialGradient id="coinPlatformGlow" cx="50%" cy="62%" r="56%"><stop stopColor="#18ff8a" stopOpacity=".5"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient></defs>
  <ellipse cx="46" cy="58" rx="38" ry="13" fill="url(#coinPlatformGlow)"/>
  <ellipse cx="46" cy="54" rx="32" ry="9" fill="#06110d" stroke="#18ff8a" strokeOpacity=".45" strokeDasharray="18 9"/>
  <path d="M16 58h60M25 46h42M34 35h24" stroke="#18ff8a" strokeOpacity=".16"/>
</svg>;}

function TradeActions(){return <section className="coin-action-card">
  <button disabled className="coin-action-buy opacity-60">Buy Coming Soon</button>
  <button disabled className="coin-action-sell opacity-60">Sell Coming Soon</button>
  <button type="button" className="coin-action-watch"><Star size={15}/> Watchlist</button>
  <Link href="/?view=wallet&action=deposit" className="coin-action-deposit">Deposit <ArrowUpRight size={14}/></Link>
</section>;}

function MiniStat({label,value}:{label:string;value:string}){return <div className="coin-stat-card"><p>{label}</p><strong>{value}</strong></div>;}
function formatQty(value:number){return new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(value);}
function formatPrice(value:number){return value<1?value.toFixed(6):value.toLocaleString("en-US",{maximumFractionDigits:2});}
