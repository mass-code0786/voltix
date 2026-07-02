import WebSocket from "ws";
import { enabledTradingPairs } from "./coin-list";

export type MarketTicker = {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  quoteVolume: number;
  high: number;
  low: number;
  bestBidPrice: number;
  bestBidQty: number;
  bestAskPrice: number;
  bestAskQty: number;
  updatedAt: number;
};

export type Candle = { openTime:number;open:number;high:number;low:number;close:number;volume:number;closeTime:number };
export type OrderBook = { symbol:string;lastUpdateId:number;bids:[number,number][];asks:[number,number][];updatedAt:number };

const WS_COMBINED_BASE="wss://stream.binance.com:9443/stream";
const REST_BASE="https://api.binance.com/api/v3";
const CHART_INTERVALS=["1m","3m","5m","15m","30m","1h"] as const;
const VALID_INTERVALS=new Set<string>(CHART_INTERVALS);

class BinanceMarketData {
  private tickers=new Map<string,MarketTicker>();
  private candles=new Map<string,Candle[]>();
  private books=new Map<string,OrderBook>();
  private sockets=new Map<string,WebSocket>();
  private reconnects=new Map<string,NodeJS.Timeout>();
  private listeners=new Set<(event:string,data:unknown)=>void>();
  private tickerPairs=new Set<string>(enabledTradingPairs);
  private tickerKey="";
  private activeDepthSymbol="";
  private activeKlineSymbol="";
  private tickerEmitTimer:NodeJS.Timeout|null=null;

  constructor(){this.bootstrapTickers().catch(()=>{});this.connectMarketStreams();}

  subscribe(listener:(event:string,data:unknown)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  configureTickerPairs(pairs:string[]){
    const next=new Set(pairs.map(normalizeSymbol).filter(pair=>pair!=="USDTUSDT"));
    const nextKey=[...next].sort().join(",");
    if(nextKey===this.tickerKey)return;
    this.tickerPairs=next;
    this.tickerKey=nextKey;
    for(const symbol of [...this.tickers.keys()])if(!this.tickerPairs.has(symbol))this.tickers.delete(symbol);
    this.emitTickers();
  }
  getTickers(){return [...this.tickers.values()].filter(ticker=>this.tickerPairs.has(ticker.symbol)).sort((a,b)=>a.symbol.localeCompare(b.symbol));}
  getTicker(symbol:string){return this.tickers.get(normalizeSymbol(symbol));}

  async getCandles(symbol:string,interval:string){
    const normalized=normalizeSymbol(symbol); const safeInterval=VALID_INTERVALS.has(interval)?interval:"1m"; const key=`${normalized}:${safeInterval}`;
    if(!this.candles.has(key)) await this.bootstrapCandles(normalized,safeInterval);
    this.connectKlineStreams(normalized);
    return this.candles.get(key)??[];
  }

  async getOrderBook(symbol:string){
    const normalized=normalizeSymbol(symbol);
    if(!this.books.has(normalized)) await this.bootstrapOrderBook(normalized);
    this.connectDepthStream(normalized);
    return this.books.get(normalized);
  }

  private emit(event:string,data:unknown){for(const listener of this.listeners)listener(event,data);}
  private emitTickers(){this.emit("tickers",this.getTickers());}
  private emitTickersThrottled(){
    if(this.tickerEmitTimer)return;
    this.tickerEmitTimer=setTimeout(()=>{this.tickerEmitTimer=null;this.emitTickers();},250);
  }

  private connectMarketStreams(){
    this.connect("ticker-arr",`${WS_COMBINED_BASE}?streams=!ticker@arr`,raw=>{
      const payload=JSON.parse(raw.toString()) as {data?:Record<string,string>[]}|Record<string,string>[];
      const rows=Array.isArray(payload)?payload:payload.data;
      if(!Array.isArray(rows))return;
      for(const row of rows){
        if(!row.s||!this.tickerPairs.has(row.s))continue;
        const previous=this.tickers.get(row.s);
        this.tickers.set(row.s,{
          symbol:row.s,
          price:Number(row.c),
          changePercent:Number(row.P),
          volume:Number(row.v),
          quoteVolume:Number(row.q),
          high:Number(row.h),
          low:Number(row.l),
          bestBidPrice:previous?.bestBidPrice??0,
          bestBidQty:previous?.bestBidQty??0,
          bestAskPrice:previous?.bestAskPrice??0,
          bestAskQty:previous?.bestAskQty??0,
          updatedAt:Date.now(),
        });
      }
      this.emitTickersThrottled();
    });
    this.connect("book-ticker",`${WS_COMBINED_BASE}?streams=!bookTicker`,raw=>{
      const payload=JSON.parse(raw.toString()) as {data?:Record<string,string>}|Record<string,string>;
      const row=("data" in payload&&payload.data?payload.data:payload) as Record<string,string>;
      if(!row.s||!this.tickerPairs.has(row.s))return;
      const previous=this.tickers.get(row.s);
      this.tickers.set(row.s,{
        symbol:row.s,
        price:previous?.price??0,
        changePercent:previous?.changePercent??0,
        volume:previous?.volume??0,
        quoteVolume:previous?.quoteVolume??0,
        high:previous?.high??0,
        low:previous?.low??0,
        bestBidPrice:Number(row.b),
        bestBidQty:Number(row.B),
        bestAskPrice:Number(row.a),
        bestAskQty:Number(row.A),
        updatedAt:Date.now(),
      });
      this.emitTickersThrottled();
    });
  }

  private connectKlineStreams(symbol:string){
    if(this.activeKlineSymbol===symbol&&this.sockets.has("klines"))return;
    this.activeKlineSymbol=symbol;
    this.sockets.get("klines")?.close(1000,"active kline symbol changed");
    const streams=CHART_INTERVALS.map(interval=>`${symbol.toLowerCase()}@kline_${interval}`).join("/");
    this.connect("klines",`${WS_COMBINED_BASE}?streams=${streams}`,raw=>{
    const payload=JSON.parse(raw.toString()) as {data?:{s:string;k:{i:string;t:number;o:string;h:string;l:string;c:string;v:string;T:number}}};
    const data=payload.data;
    if(!data?.k||data.s!==symbol)return;
    const k=data.k;
    const candle:Candle={openTime:k.t,open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),closeTime:k.T};
    const cacheKey=`${symbol}:${k.i}`; const current=this.candles.get(cacheKey)??[]; const index=current.findIndex(item=>item.openTime===candle.openTime);
    if(index>=0)current[index]=candle;else current.push(candle);this.candles.set(cacheKey,current.slice(-120));this.emit("kline",{symbol,interval:k.i,candle});
  });}

  private connectDepthStream(symbol:string){
    if(this.activeDepthSymbol===symbol&&this.sockets.has("depth"))return;
    this.activeDepthSymbol=symbol;
    this.sockets.get("depth")?.close(1000,"active depth symbol changed");
    this.connect("depth",`${WS_COMBINED_BASE}?streams=${symbol.toLowerCase()}@depth10@100ms`,raw=>{
    const wrapped=JSON.parse(raw.toString()) as {data?:{lastUpdateId:number;bids:[string,string][];asks:[string,string][]}};
    const payload=wrapped.data;
    if(!payload)return;
    const book:OrderBook={symbol,lastUpdateId:payload.lastUpdateId,bids:payload.bids.map(([p,q])=>[Number(p),Number(q)]),asks:payload.asks.map(([p,q])=>[Number(p),Number(q)]),updatedAt:Date.now()};this.books.set(symbol,book);this.emit("depth",book);
  });}

  private connect(key:string,url:string,onMessage:(data:WebSocket.RawData)=>void){
    const existing=this.sockets.get(key);if(existing&&(existing.readyState===WebSocket.OPEN||existing.readyState===WebSocket.CONNECTING))return;
    const socket=new WebSocket(url);this.sockets.set(key,socket);
    const rotate=setTimeout(()=>socket.close(1000,"scheduled reconnect"),23*60*60*1000+55*60*1000);
    socket.on("message",onMessage);socket.on("ping",data=>socket.pong(data));
    socket.on("close",()=>{clearTimeout(rotate);if(this.sockets.get(key)!==socket)return;this.sockets.delete(key);this.scheduleReconnect(key,()=>this.connect(key,url,onMessage));});
    socket.on("error",()=>socket.close());
  }

  private scheduleReconnect(key:string,reconnect:()=>void){if(this.reconnects.has(key))return;const timer=setTimeout(()=>{this.reconnects.delete(key);reconnect();},3000);this.reconnects.set(key,timer);}
  private async bootstrapTickers(){const response=await fetch(`${REST_BASE}/ticker/24hr`,{cache:"no-store"});if(!response.ok)return;const rows=await response.json() as Record<string,string>[];for(const row of rows){if(!row.s||!this.tickerPairs.has(row.s))continue;const previous=this.tickers.get(row.s);this.tickers.set(row.s,{symbol:row.s,price:Number(row.lastPrice),changePercent:Number(row.priceChangePercent),volume:Number(row.volume),quoteVolume:Number(row.quoteVolume),high:Number(row.highPrice),low:Number(row.lowPrice),bestBidPrice:previous?.bestBidPrice??0,bestBidQty:previous?.bestBidQty??0,bestAskPrice:previous?.bestAskPrice??0,bestAskQty:previous?.bestAskQty??0,updatedAt:Date.now()});}this.emitTickers();}
  private async bootstrapCandles(symbol:string,interval:string){const response=await fetch(`${REST_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=120`,{cache:"no-store"});if(!response.ok)throw new Error("Binance kline request failed");const rows=await response.json() as Array<[number,string,string,string,string,string,number]>;this.candles.set(`${symbol}:${interval}`,rows.map(row=>({openTime:row[0],open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[5]),closeTime:row[6]})));}
  private async bootstrapOrderBook(symbol:string){const response=await fetch(`${REST_BASE}/depth?symbol=${symbol}&limit=20`,{cache:"no-store"});if(!response.ok)throw new Error("Binance order book request failed");const data=await response.json() as {lastUpdateId:number;bids:[string,string][];asks:[string,string][]};this.books.set(symbol,{symbol,lastUpdateId:data.lastUpdateId,bids:data.bids.map(([p,q])=>[Number(p),Number(q)]),asks:data.asks.map(([p,q])=>[Number(p),Number(q)]),updatedAt:Date.now()});}
}

function normalizeSymbol(symbol:string){const value=symbol.toUpperCase().replace(/[^A-Z0-9]/g,"");return value.endsWith("USDT")?value:`${value}USDT`;}

const globalMarket=globalThis as typeof globalThis&{__voltixMarketData?:BinanceMarketData};
export const marketData=globalMarket.__voltixMarketData??new BinanceMarketData();
if(process.env.NODE_ENV!=="production")globalMarket.__voltixMarketData=marketData;
