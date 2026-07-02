"use client";

import { useEffect,useMemo,useState } from "react";
import type { MarketTicker,OrderBook } from "@/lib/market-data";

export function OrderBookPanel({symbol="BTCUSDT"}:{symbol?:string}){
  const [book,setBook]=useState<OrderBook|null>(null);
  const [ticker,setTicker]=useState<MarketTicker|null>(null);
  useEffect(()=>{
    let active=true;
    const load=()=>fetch(`/api/order-book?symbol=${symbol}`).then(r=>r.json()).then(data=>{if(active&&data.orderBook)setBook(data.orderBook);}).catch(()=>{});
    const loadTicker=()=>fetch("/api/prices").then(r=>r.json()).then(data=>{const rows=data.tickers as MarketTicker[]|undefined;const found=rows?.find(row=>row.symbol===symbol);if(active&&found)setTicker(found);}).catch(()=>{});
    load();
    loadTicker();
    const poll=window.setInterval(()=>{load();loadTicker();},2000);
    const source=new EventSource("/api/prices/stream");
    source.addEventListener("depth",event=>{const data=JSON.parse((event as MessageEvent).data) as OrderBook;if(active&&data.symbol===symbol)setBook(data);});
    source.addEventListener("tickers",event=>{const rows=JSON.parse((event as MessageEvent).data) as MarketTicker[];const found=rows.find(row=>row.symbol===symbol);if(active&&found)setTicker(found);});
    return()=>{active=false;window.clearInterval(poll);source.close();};
  },[symbol]);
  const asks=useMemo(()=>(book?.asks??[]).slice(0,10).sort((a,b)=>b[0]-a[0]),[book]);
  const bids=useMemo(()=>(book?.bids??[]).slice(0,10),[book]);
  const lastPrice=ticker?.price?ticker.price:(book&&book.bids[0]&&book.asks[0]?(book.bids[0][0]+book.asks[0][0])/2:null);
  const waiting=!book||(!asks.length&&!bids.length);
  return <section className="overflow-hidden rounded-2xl border border-line bg-panel/80 shadow-2xl"><div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5"><div><h3 className="font-bold">Order Book</h3><p className="mt-1 text-[10px] text-slate-500">{symbol.replace("USDT","/USDT")} live depth</p></div><span className="rounded-full bg-lime/10 px-3 py-1 text-[10px] font-bold text-lime">Live</span></div><div className="px-4 py-3 sm:px-5"><div className="grid grid-cols-[70px_1fr_1fr] pb-2 text-[9px] font-bold uppercase tracking-wider text-slate-600"><span>Side</span><span>Price (USDT)</span><span className="text-right">Amount</span></div>{waiting?<div className="grid h-36 place-items-center rounded-xl border border-line/70 bg-ink/50 text-xs text-slate-500">Waiting for market data</div>:<><OrderRows label="Sell" rows={asks} color="text-danger" bg="bg-danger/5"/><div className="my-2 rounded-xl border border-lime/20 bg-lime/[.08] px-3 py-2 text-center"><p className="text-[9px] uppercase tracking-wider text-slate-500">Last Price</p><p className="mt-0.5 text-lg font-black text-lime">{lastPrice!==null?formatPrice(lastPrice):"Waiting"}</p></div><OrderRows label="Buy" rows={bids} color="text-mint" bg="bg-mint/5"/></>}</div></section>;
}

function OrderRows({label,rows,color,bg}:{label:"Buy"|"Sell";rows:[number,number][];color:string;bg:string}){return <div className="space-y-1">{rows.map(([price,amount],index)=><div key={`${label}-${price}-${amount}`} className={`grid grid-cols-[70px_1fr_1fr] rounded-lg px-3 py-1.5 text-[11px] ${index===0?bg:""}`}><span className={color}>{index===0?label:""}</span><span className={`font-bold ${color}`}>{formatPrice(price)}</span><span className="text-right text-slate-300">{amount.toFixed(3)}</span></div>)}</div>}
const formatPrice=(value:number)=>value<1?value.toFixed(6):value.toLocaleString("en-US",{maximumFractionDigits:2});
