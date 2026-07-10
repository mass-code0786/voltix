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
  const asks=useMemo(()=>(book?.asks??[]).slice().sort((a,b)=>a[0]-b[0]).slice(0,10),[book]);
  const bids=useMemo(()=>(book?.bids??[]).slice().sort((a,b)=>b[0]-a[0]).slice(0,10),[book]);
  const lastPrice=ticker?.price?ticker.price:(book&&book.bids[0]&&book.asks[0]?(book.bids[0][0]+book.asks[0][0])/2:null);
  const hasBook=asks.length>0||bids.length>0;
  const pressure=useMemo(()=>{const recent=trades.slice(0,30);const buy=recent.filter(trade=>trade.side==="BUY").reduce((sum,trade)=>sum+trade.quoteQty,0);const sell=recent.filter(trade=>trade.side==="SELL").reduce((sum,trade)=>sum+trade.quoteQty,0);const total=Math.max(buy+sell,1);return {buy,sell,buyPct:(buy/total)*100,sellPct:(sell/total)*100};},[trades]);
  const maxBidTotal=Math.max(...bids.map(([price,amount])=>price*amount),1);
  const maxAskTotal=Math.max(...asks.map(([price,amount])=>price*amount),1);
  return <section className="orderbook-card">
    <div className="orderbook-head"><div><h3>Order Book</h3><p>{symbol.replace("USDT","/USDT")} live depth</p><p className="orderbook-last-inline">Last Price: <b>{lastPrice!==null?formatPrice(lastPrice):"--"}</b></p></div><span>Live</span></div>
    <div className="orderbook-body">
      {hasBook?<div className="orderbook-split"><OrderRows label="Buy" rows={bids} tone="buy" maxTotal={maxBidTotal}/><OrderRows label="Sell" rows={asks} tone="sell" maxTotal={maxAskTotal}/></div>:<div className="orderbook-empty">Connecting to Binance depth...</div>}
      <div className="orderbook-pressure"><div><span>Buy/Sell Pressure</span><b>{pressure.buyPct.toFixed(0)}% / {pressure.sellPct.toFixed(0)}%</b></div><div className="flex h-2 overflow-hidden rounded-full bg-[#ff4f6d]/20"><i className="bg-[#18ff8a]" style={{width:`${pressure.buyPct}%`}}/><i className="bg-[#ff4f6d]" style={{width:`${pressure.sellPct}%`}}/></div></div>
      <div className="recent-trades"><div className="orderbook-columns"><span>Price</span><span className="text-right">Amount</span><span className="text-right">Time</span></div><div>{trades.slice(0,12).map(trade=><div key={trade.id} className="recent-trade-row"><span className={trade.side==="BUY"?"text-[#18ff8a]":"text-[#ff4f6d]"}>{formatPrice(trade.price)}</span><span>{trade.qty.toFixed(5)}</span><span>{new Date(trade.time).toLocaleTimeString("en-US",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"})}</span></div>)}</div></div>
    </div>
  </section>;
}

function OrderRows({label,rows,tone,maxTotal}:{label:"Buy"|"Sell";rows:[number,number][];tone:"buy"|"sell";maxTotal:number}){const isBuy=tone==="buy";return <div className={`orderbook-side is-${tone}`}>
  <div className="orderbook-side-head"><span>{label} Orders</span></div>
  <div className="orderbook-side-columns">{isBuy?<><span>Total</span><span>Amount</span><span>Price</span></>:<><span>Price</span><span>Amount</span><span>Total</span></>}</div>
  <div className="orderbook-side-rows">{rows.map(([price,amount])=>{const total=price*amount;const depth=Math.min(100,(total/maxTotal)*100);return <div key={`${label}-${price}-${amount}`} className={`orderbook-row is-${tone}`}><i style={{width:`${depth}%`}}/>{isBuy?<><span>{formatQty(total)}</span><span>{amount.toFixed(3)}</span><span>{formatPrice(price)}</span></>:<><span>{formatPrice(price)}</span><span>{amount.toFixed(3)}</span><span>{formatQty(total)}</span></>}</div>;})}</div>
</div>}
const formatPrice=(value:number)=>value<1?value.toFixed(6):value.toLocaleString("en-US",{maximumFractionDigits:2});
const formatQty=(value:number)=>new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(value);
