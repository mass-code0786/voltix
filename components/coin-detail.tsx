"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Star } from "lucide-react";
import { CandlestickChart } from "./candlestick-chart";
import { OrderBookPanel } from "./order-book";
import { useLiveTickers } from "@/lib/use-market-data";
import { SHINE_LOGO_PATH, SHINE_NAME, SHINE_PAIR, SHINE_PRICE_USD, SHINE_SYMBOL } from "@/lib/shine-token";

export function CoinDetail({symbol}:{symbol:string}){
  const tickers=useLiveTickers();
  const ticker=tickers.find(item=>item.symbol===symbol);
  const base=symbol.replace("USDT","");
  const pair=symbol.replace("USDT"," / USDT");
  const positive=(ticker?.changePercent??0)>=0;
  const isShine=symbol===SHINE_PAIR;
  const price=ticker?.price??(isShine?SHINE_PRICE_USD:0);
  return <main className="coin-detail-page mx-auto min-h-screen max-w-[430px] overflow-x-hidden px-4 pb-[120px] pt-4 lg:max-w-6xl">
    <div className="coin-detail-atmosphere" aria-hidden="true"><span/><span/><i/><i/></div>
    <Link href="/dashboard?view=markets" className="coin-back-link"><span><ArrowLeft size={18}/></span>Back to Markets</Link>
    <section className="coin-hero-card">
      <div className="relative z-10 min-w-0">
        <p className="coin-kicker">Live Market</p>
        <h1>{pair}</h1>
        <p className="coin-name">{isShine?`${SHINE_NAME} - Voltix token on Solana`:`${base} live trading pair`}</p>
      </div>
      <div className="coin-hero-price">
        <div className="coin-logo-stage">
          <CoinPlatformSvg/>
          <img src={isShine?SHINE_LOGO_PATH:`/coin-logos/${base.toLowerCase()}.png`} alt={`${base} logo`} />
        </div>
        <p>{price?formatPrice(price):"--"}</p>
        <span className={positive?"coin-change-up":"coin-change-down"}>{price?`${positive?"+":""}${(ticker?.changePercent??0).toFixed(2)}%`:"--"}</span>
      </div>
    </section>
    {(ticker||isShine)&&<div className="coin-stats-grid">
      <MiniStat label="24h High" value={ticker?.high?formatPrice(ticker.high):isShine?formatPrice(SHINE_PRICE_USD):"--"}/>
      <MiniStat label="24h Low" value={ticker?.low?formatPrice(ticker.low):isShine?formatPrice(SHINE_PRICE_USD):"--"}/>
      <MiniStat label="24h Volume" value={ticker?.volume?formatQty(ticker.volume):"--"}/>
      <MiniStat label="Quote Volume" value={ticker?.quoteVolume?formatQty(ticker.quoteVolume):"--"}/>
    </div>}
    <div className="coin-detail-stack"><CandlestickChart symbol={symbol}/><OrderBookPanel symbol={symbol}/>{isShine?<ShineConvertCard/>:<TradeActions/>}</div>
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
  <Link href="/dashboard?view=wallet&action=deposit" className="coin-action-deposit">Deposit <ArrowUpRight size={14}/></Link>
</section>;}

type ConversionRow={id:string;fromAmount:number;toAmount:number;price:number;status:string;createdAt:string};

function ShineConvertCard(){
  const [amount,setAmount]=useState("");
  const [usdtBalance,setUsdtBalance]=useState(0);
  const [shineBalance,setShineBalance]=useState(0);
  const [history,setHistory]=useState<ConversionRow[]>([]);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const value=Number(amount)||0;
  const receive=useMemo(()=>value>0?value/SHINE_PRICE_USD:0,[value]);
  const load=()=>Promise.all([
    fetch("/api/assets",{cache:"no-store",credentials:"include"}).then(r=>r.ok?r.json():null),
    fetch("/api/convert/shine",{cache:"no-store",credentials:"include"}).then(r=>r.ok?r.json():null),
  ]).then(([assetsData,historyData])=>{
    const assets=Array.isArray(assetsData?.assets)?assetsData.assets as {symbol:string;walletType:string;balance:number}[]:[];
    setUsdtBalance(Number(assetsData?.totals?.total?.spot??0));
    setShineBalance(Number(assets.find(asset=>asset.symbol===SHINE_SYMBOL&&asset.walletType==="SPOT")?.balance??0));
    setHistory(Array.isArray(historyData?.conversions)?historyData.conversions:[]);
  }).catch(()=>{});
  useEffect(()=>{void load();},[]);
  const convert=async()=>{
    setError("");
    setMessage("");
    if(value<=0){setError("Enter a valid USDT amount");return;}
    if(value>usdtBalance){setError("Insufficient Spot Wallet USDT balance");return;}
    setLoading(true);
    const response=await fetch("/api/convert/shine",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:value,idempotencyKey:crypto.randomUUID()})});
    const data=await response.json().catch(()=>({}));
    setLoading(false);
    if(!response.ok){setError(data.error||"SHINE conversion failed");return;}
    setAmount("");
    setMessage(`Converted ${Number(data.conversion?.fromAmount??value).toFixed(2)} USDT to ${Number(data.conversion?.toAmount??receive).toFixed(2)} SHINE`);
    await load();
  };
  return <section className="coin-action-card">
    <div className="col-span-full space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Convert USDT to SHINE</p>
        <h2 className="mt-1 text-lg font-black text-white">{SHINE_NAME}</h2>
        <p className="mt-1 text-xs text-slate-500">Network: Solana | Brand: Voltix token | Price: ${SHINE_PRICE_USD.toFixed(2)}</p>
      </div>
      <div className="rounded-xl border border-line bg-ink/60 p-3">
        <div className="flex justify-between text-xs"><span className="text-slate-500">USDT balance</span><strong>{usdtBalance.toFixed(2)} USDT</strong></div>
        <div className="mt-2 flex justify-between text-xs"><span className="text-slate-500">SHINE balance</span><strong>{shineBalance.toFixed(2)} SHINE</strong></div>
      </div>
      <label className="block text-xs font-bold text-slate-400">USDT Amount<input inputMode="decimal" value={amount} onChange={event=>{setAmount(event.target.value);setError("");setMessage("");}} placeholder="0.00" className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-lime/50"/></label>
      <div className="rounded-xl border border-line bg-ink/60 p-3 text-xs"><span className="text-slate-500">You receive</span><p className="mt-1 text-lg font-black text-lime">{receive.toFixed(2)} SHINE</p></div>
      {error&&<p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs font-bold text-danger">{error}</p>}
      {message&&<p className="rounded-xl border border-lime/30 bg-lime/10 p-3 text-xs font-bold text-lime">{message}</p>}
      <button onClick={convert} disabled={loading} className="w-full rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-60">{loading?"Converting...":"Convert USDT to SHINE"}</button>
      <div className="space-y-2">
        <p className="text-xs font-black text-white">Conversion history</p>
        {history.length?history.map(row=><div key={row.id} className="flex items-center justify-between rounded-xl border border-line bg-ink/50 p-3 text-xs"><span className="text-slate-400">{new Date(row.createdAt).toLocaleString()}</span><strong>{row.fromAmount.toFixed(2)} USDT {"->"} {row.toAmount.toFixed(2)} SHINE</strong></div>):<p className="rounded-xl border border-line bg-ink/50 p-3 text-center text-xs text-slate-500">No conversions yet</p>}
      </div>
    </div>
  </section>;
}

function MiniStat({label,value}:{label:string;value:string}){return <div className="coin-stat-card"><p>{label}</p><strong>{value}</strong></div>;}
function formatQty(value:number){return new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(value);}
function formatPrice(value:number){return value<1?value.toFixed(6):value.toLocaleString("en-US",{maximumFractionDigits:2});}
