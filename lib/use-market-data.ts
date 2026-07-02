"use client";

import { useEffect,useState } from "react";
import type { MarketTicker } from "./market-data";

export function useLiveTickers(){
  const [tickers,setTickers]=useState<MarketTicker[]>([]);
  useEffect(()=>{let active=true;fetch("/api/prices").then(r=>r.json()).then(data=>{if(active&&Array.isArray(data.tickers))setTickers(data.tickers);}).catch(()=>{});const source=new EventSource("/api/prices/stream");source.addEventListener("tickers",event=>{const data=JSON.parse((event as MessageEvent).data) as MarketTicker[];if(active)setTickers(data);});return()=>{active=false;source.close();};},[]);
  return tickers;
}
