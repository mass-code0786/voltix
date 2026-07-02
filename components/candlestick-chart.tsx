"use client";

import { useEffect,useMemo,useState } from "react";
import type { Candle,MarketTicker } from "@/lib/market-data";

const intervals=["1m","3m","5m","15m","30m","1h"] as const;

export function CandlestickChart({symbol="BTCUSDT"}:{symbol?:string}){
  const [interval,setInterval]=useState<(typeof intervals)[number]>("1m");
  const [candles,setCandles]=useState<Candle[]>([]);
  const [ticker,setTicker]=useState<MarketTicker|null>(null);
  useEffect(()=>{
    let active=true;
    let source:EventSource|null=null;
    let reconnectTimer:ReturnType<typeof setTimeout>|null=null;
    let attempt=0;
    const load=()=>fetch(`/api/chart?symbol=${symbol}&interval=${interval}`).then(r=>r.json()).then(data=>{if(active&&Array.isArray(data.candles))setCandles(data.candles);}).catch(error=>console.error("[market-data] chart fetch failed",error));
    const connect=()=>{
      source?.close();
      source=new EventSource("/api/prices/stream");
      source.addEventListener("open",()=>{attempt=0;void load();});
      source.addEventListener("kline",event=>{const data=JSON.parse((event as MessageEvent).data) as {symbol:string;interval:string;candle:Candle};if(!active||data.symbol!==symbol||data.interval!==interval)return;setCandles(current=>{const next=[...current];const index=next.findIndex(item=>item.openTime===data.candle.openTime);if(index>=0)next[index]=data.candle;else next.push(data.candle);return next.slice(-120);});});
      source.addEventListener("tickers",event=>{const rows=JSON.parse((event as MessageEvent).data) as MarketTicker[];const found=rows.find(row=>row.symbol===symbol);if(active&&found)setTicker(found);});
      source.addEventListener("error",event=>{
        console.error("[market-data] chart stream disconnected",event);
        source?.close();
        attempt+=1;
        const delay=Math.min(30000,1000*2**Math.min(attempt-1,5));
        if(reconnectTimer)clearTimeout(reconnectTimer);
        void load();
        reconnectTimer=setTimeout(()=>{if(active)connect();},delay);
      });
    };
    void load();
    connect();
    return()=>{active=false;if(reconnectTimer)clearTimeout(reconnectTimer);source?.close();};
  },[symbol,interval]);
  const shown=useMemo(()=>candles.slice(-36),[candles]);
  const bounds=useMemo(()=>{const lows=shown.map(c=>c.low),highs=shown.map(c=>c.high);const min=Math.min(...lows),max=Math.max(...highs);return {min:Number.isFinite(min)?min:0,max:Number.isFinite(max)?max:1};},[shown]);
  const scale=(value:number)=>190-((value-bounds.min)/Math.max(bounds.max-bounds.min,.00000001))*180;
  const price=ticker?.price?ticker.price:shown.at(-1)?.close??0;
  return <section className="overflow-hidden rounded-2xl border border-line bg-[#0c1512] shadow-2xl"><div className="flex items-start justify-between border-b border-line/70 px-4 py-4 sm:px-5"><div><h2 className="font-black">{symbol.replace("USDT","/USDT")}</h2><div className="mt-2 flex items-end gap-3"><p className="text-2xl font-black">{formatPrice(price)}</p><p className={`pb-1 text-xs font-bold ${(ticker?.changePercent??0)>=0?"text-mint":"text-danger"}`}>{(ticker?.changePercent??0)>=0?"+":""}{(ticker?.changePercent??0).toFixed(2)}%</p></div></div><div className="text-right text-[10px] text-slate-500"><p>24h High <span className="ml-2 text-slate-300">{formatPrice(ticker?.high??0)}</span></p><p className="mt-2">24h Vol <span className="ml-2 text-slate-300">{compact(ticker?.volume??0)}</span></p></div></div><div className="flex gap-1 border-b border-line/60 px-3 py-2 sm:px-5">{intervals.map(item=><button key={item} onClick={()=>setInterval(item)} className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${interval===item?"bg-lime text-ink":"text-slate-500"}`}>{item}</button>)}</div><div className="relative h-[230px] px-3 py-4 sm:px-5 grid-fade">{shown.length===0?<div className="grid h-full place-items-center text-xs text-slate-500">Loading market data...</div>:<svg viewBox="0 0 600 205" className="h-full w-full" preserveAspectRatio="none" aria-label={`${symbol} ${interval} candlestick chart`}>{shown.map((c,i)=>{const slot=580/Math.max(shown.length,1);const x=10+i*slot;const rising=c.close>=c.open;const color=rising?"#1fd58a":"#ff5c72";const bodyY=Math.min(scale(c.open),scale(c.close));const bodyHeight=Math.max(Math.abs(scale(c.open)-scale(c.close)),2);return <g key={c.openTime}><line x1={x+slot*.35} x2={x+slot*.35} y1={scale(c.high)} y2={scale(c.low)} stroke={color}/><rect x={x} y={bodyY} width={Math.max(slot*.7,2)} height={bodyHeight} fill={rising?color:"transparent"} stroke={color}/></g>;})}</svg>}</div></section>;
}

const compact=(value:number)=>new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(value);
const formatPrice=(value:number)=>value<1?value.toFixed(6):value.toLocaleString("en-US",{maximumFractionDigits:2});
