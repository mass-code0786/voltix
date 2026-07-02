"use client";

import { useEffect,useState } from "react";
import type { MarketTicker } from "./market-data";

export function useLiveTickers(){
  const [tickers,setTickers]=useState<MarketTicker[]>([]);
  useEffect(()=>{
    let active=true;
    let source:EventSource|null=null;
    let reconnectTimer:ReturnType<typeof setTimeout>|null=null;
    let reconnectAttempt=0;
    const load=()=>fetch("/api/prices").then(r=>r.json()).then(data=>{if(active&&Array.isArray(data.tickers))setTickers(data.tickers);}).catch(error=>console.error("[market-data] price fetch failed",error));
    const connect=()=>{
      source?.close();
      source=new EventSource("/api/prices/stream");
      source.addEventListener("open",()=>{reconnectAttempt=0;void load();});
      source.addEventListener("tickers",event=>{const data=JSON.parse((event as MessageEvent).data) as MarketTicker[];if(active)setTickers(data);});
      source.addEventListener("error",event=>{
        console.error("[market-data] price stream disconnected",event);
        source?.close();
        reconnectAttempt+=1;
        const delay=Math.min(30000,1000*2**Math.min(reconnectAttempt-1,5));
        if(reconnectTimer)clearTimeout(reconnectTimer);
        void load();
        reconnectTimer=setTimeout(()=>{if(active)connect();},delay);
      });
    };
    void load();
    connect();
    return()=>{active=false;if(reconnectTimer)clearTimeout(reconnectTimer);source?.close();};
  },[]);
  return tickers;
}
