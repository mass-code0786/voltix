"use client";

import { useEffect,useMemo,useState } from "react";
import type { MarketTicker,OrderBook,RecentTrade } from "@/lib/market-data";

export function OrderBookPanel({symbol="BTCUSDT"}:{symbol?:string}){
  const [book,setBook]=useState<OrderBook|null>(null);
  const [ticker,setTicker]=useState<MarketTicker|null>(null);
  const [trades,setTrades]=useState<RecentTrade[]>([]);
  useEffect(()=>{
    let active=true;
    let source:EventSource|null=null;
    let reconnectTimer:ReturnType<typeof setTimeout>|null=null;
    let attempt=0;
    const loadBook=()=>fetch(`/api/order-book?symbol=${symbol}`).then(r=>r.json()).then(data=>{if(active&&data.orderBook)setBook(data.orderBook);}).catch(error=>console.error("[market-data] order book fetch failed",error));
    const loadTrades=()=>fetch(`/api/recent-trades?symbol=${symbol}`).then(r=>r.json()).then(data=>{if(active&&Array.isArray(data.trades))setTrades(data.trades);}).catch(error=>console.error("[market-data] recent trades fetch failed",error));
    const loadTicker=()=>fetch("/api/prices").then(r=>r.json()).then(data=>{const rows=data.tickers as MarketTicker[]|undefined;const found=rows?.find(row=>row.symbol===symbol);if(active&&found)setTicker(found);}).catch(error=>console.error("[market-data] ticker fetch failed",error));
    const connect=()=>{
      source?.close();
      source=new EventSource("/api/prices/stream");
      source.addEventListener("open",()=>{attempt=0;void loadBook();void loadTrades();void loadTicker();});
      source.addEventListener("depth",event=>{const data=JSON.parse((event as MessageEvent).data) as OrderBook;if(active&&data.symbol===symbol)setBook(data);});
      source.addEventListener("trades",event=>{const data=JSON.parse((event as MessageEvent).data) as {symbol:string;trades:RecentTrade[]};if(active&&data.symbol===symbol)setTrades(data.trades);});
      source.addEventListener("trade",event=>{const data=JSON.parse((event as MessageEvent).data) as RecentTrade;if(active&&data.symbol===symbol)setTrades(current=>[data,...current.filter(item=>item.id!==data.id)].slice(0,50));});
      source.addEventListener("tickers",event=>{const rows=JSON.parse((event as MessageEvent).data) as MarketTicker[];const found=rows.find(row=>row.symbol===symbol);if(active&&found)setTicker(found);});
      source.addEventListener("error",event=>{
        console.error("[market-data] trading stream disconnected",event);
        source?.close();
        attempt+=1;
        const delay=Math.min(30000,1000*2**Math.min(attempt-1,5));
        if(reconnectTimer)clearTimeout(reconnectTimer);
        void loadBook();void loadTrades();void loadTicker();
        reconnectTimer=setTimeout(()=>{if(active)connect();},delay);
      });
    };
    void loadBook();void loadTrades();void loadTicker();connect();
    return()=>{active=false;if(reconnectTimer)clearTimeout(reconnectTimer);source?.close();};
  },[symbol]);
  const asks=useMemo(()=>(book?.asks??[]).slice(0,10).sort((a,b)=>b[0]-a[0]),[book]);
  const bids=useMemo(()=>(book?.bids??[]).slice(0,10),[book]);
  const lastPrice=ticker?.price?ticker.price:(book&&book.bids[0]&&book.asks[0]?(book.bids[0][0]+book.asks[0][0])/2:null);
  const hasBook=asks.length>0||bids.length>0;
  const pressure=useMemo(()=>{const recent=trades.slice(0,30);const buy=recent.filter(trade=>trade.side==="BUY").reduce((sum,trade)=>sum+trade.quoteQty,0);const sell=recent.filter(trade=>trade.side==="SELL").reduce((sum,trade)=>sum+trade.quoteQty,0);const total=Math.max(buy+sell,1);return {buy,sell,buyPct:(buy/total)*100,sellPct:(sell/total)*100};},[trades]);
  return <section className="overflow-hidden rounded-2xl border border-line bg-panel/80 shadow-2xl"><div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5"><div><h3 className="font-bold">Order Book</h3><p className="mt-1 text-[10px] text-slate-500">{symbol.replace("USDT","/USDT")} live depth</p></div><span className="rounded-full bg-lime/10 px-3 py-1 text-[10px] font-bold text-lime">Live</span></div><div className="px-4 py-3 sm:px-5"><div className="grid grid-cols-[70px_1fr_1fr] pb-2 text-[9px] font-bold uppercase tracking-wider text-slate-600"><span>Side</span><span>Price (USDT)</span><span className="text-right">Amount</span></div>{hasBook?<><OrderRows label="Sell" rows={asks} color="text-danger" bg="bg-danger/5"/><div className="my-2 rounded-xl border border-lime/20 bg-lime/[.08] px-3 py-2 text-center"><p className="text-[9px] uppercase tracking-wider text-slate-500">Last Price</p><p className="mt-0.5 text-lg font-black text-lime">{lastPrice!==null?formatPrice(lastPrice):"--"}</p></div><OrderRows label="Buy" rows={bids} color="text-mint" bg="bg-mint/5"/></>:<div className="grid h-36 place-items-center rounded-xl border border-line/70 bg-ink/50 text-xs text-slate-500">Connecting to Binance depth...</div>}<div className="mt-4 rounded-xl border border-line/70 bg-ink/50 p-3"><div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500"><span>Buy/Sell Pressure</span><span>{pressure.buyPct.toFixed(0)}% / {pressure.sellPct.toFixed(0)}%</span></div><div className="flex h-2 overflow-hidden rounded-full bg-danger/20"><div className="bg-mint" style={{width:`${pressure.buyPct}%`}}/><div className="bg-danger" style={{width:`${pressure.sellPct}%`}}/></div></div><div className="mt-4"><div className="grid grid-cols-[1fr_1fr_1fr] pb-2 text-[9px] font-bold uppercase tracking-wider text-slate-600"><span>Price</span><span className="text-right">Amount</span><span className="text-right">Time</span></div><div className="max-h-48 space-y-1 overflow-hidden">{trades.slice(0,18).map(trade=><div key={trade.id} className="grid grid-cols-[1fr_1fr_1fr] rounded-lg px-2 py-1 text-[11px]"><span className={trade.side==="BUY"?"font-bold text-mint":"font-bold text-danger"}>{formatPrice(trade.price)}</span><span className="text-right text-slate-300">{trade.qty.toFixed(5)}</span><span className="text-right text-slate-500">{new Date(trade.time).toLocaleTimeString("en-US",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span></div>)}</div></div></div></section>;
}

function OrderRows({label,rows,color,bg}:{label:"Buy"|"Sell";rows:[number,number][];color:string;bg:string}){return <div className="space-y-1">{rows.map(([price,amount],index)=><div key={`${label}-${price}-${amount}`} className={`grid grid-cols-[70px_1fr_1fr] rounded-lg px-3 py-1.5 text-[11px] ${index===0?bg:""}`}><span className={color}>{index===0?label:""}</span><span className={`font-bold ${color}`}>{formatPrice(price)}</span><span className="text-right text-slate-300">{amount.toFixed(3)}</span></div>)}</div>}
const formatPrice=(value:number)=>value<1?value.toFixed(6):value.toLocaleString("en-US",{maximumFractionDigits:2});
