import WebSocket from "ws";
import { enabledTradingPairs } from "./coin-list";
import { SHINE_PAIR, SHINE_PRICE_USD } from "./shine-token";

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
export type RecentTrade = { id:number;symbol:string;price:number;qty:number;quoteQty:number;side:"BUY"|"SELL";time:number };

const WS_COMBINED_BASE="wss://stream.binance.com:9443/stream";
const REST_BASE="https://api.binance.com/api/v3";
const CHART_INTERVALS=["1m","3m","5m","15m","30m","1h"] as const;
const VALID_INTERVALS=new Set<string>(CHART_INTERVALS);

class BinanceMarketData {
  private tickers=new Map<string,MarketTicker>();
  private candles=new Map<string,Candle[]>();
  private books=new Map<string,OrderBook>();
  private trades=new Map<string,RecentTrade[]>();
  private sockets=new Map<string,WebSocket>();
  private reconnects=new Map<string,NodeJS.Timeout>();
  private reconnectAttempts=new Map<string,number>();
  private listeners=new Set<(event:string,data:unknown)=>void>();
  private tickerPairs=new Set<string>(enabledTradingPairs);
  private tickerKey="";
  private activeDepthSymbol="";
  private activeTradeSymbol="";
  private activeKlineSymbol="";
  private tickerEmitTimer:NodeJS.Timeout|null=null;
  private started=false;

  ensureStarted(){
    if(this.started)return;
    this.started=true;
    this.refreshTickers("startup").catch(error=>this.logError("ticker-rest-startup",error));
    this.connectMarketStreams();
  }

  async refreshNow(reason:string){
    this.ensureStarted();
    try{await this.refreshTickers(reason);}catch(error){this.logError(`ticker-rest-${reason}`,error);}
  }

  subscribe(listener:(event:string,data:unknown)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  configureTickerPairs(pairs:Array<string|null|undefined>){
    const next=new Set(pairs.filter((pair):pair is string=>typeof pair==="string").map(normalizeSymbol).filter(pair=>pair!=="USDTUSDT"));
    if(next.size===0){this.logError("ticker-pairs-empty",new Error("Ignoring empty ticker pair configuration"));return;}
    const nextKey=[...next].sort().join(",");
    if(nextKey===this.tickerKey)return;
    this.tickerPairs=next;
    this.tickerKey=nextKey;
    for(const symbol of [...this.tickers.keys()])if(!this.tickerPairs.has(symbol))this.tickers.delete(symbol);
    this.emitTickers();
    if(this.started){
      this.closeSocket("ticker-symbols","ticker pairs changed");
      this.closeSocket("book-ticker-symbols","ticker pairs changed");
      this.connectMarketStreams();
      this.refreshTickers("pairs-configured").catch(error=>this.logError("ticker-rest-pairs-configured",error));
    }
  }
  getTickers(){
    const rows=[...this.tickers.values()].filter(ticker=>this.tickerPairs.has(ticker.symbol));
    if(this.tickerPairs.has(SHINE_PAIR))rows.push(shineTicker());
    return rows.sort((a,b)=>a.symbol.localeCompare(b.symbol));
  }
  getTicker(symbol:string){const normalized=normalizeSymbol(symbol);return normalized===SHINE_PAIR?shineTicker():this.tickers.get(normalized);}
  getRecentTrades(symbol:string){return this.trades.get(normalizeSymbol(symbol))??[];}

  async getCandles(symbol:string,interval:string){
    this.ensureStarted();
    const normalized=normalizeSymbol(symbol); const safeInterval=VALID_INTERVALS.has(interval)?interval:"1m"; const key=`${normalized}:${safeInterval}`;
    if(normalized===SHINE_PAIR)return syntheticCandles(safeInterval);
    if(!this.candles.has(key)) await this.bootstrapCandles(normalized,safeInterval);
    this.connectKlineStreams(normalized);
    return this.candles.get(key)??[];
  }

  async getOrderBook(symbol:string){
    this.ensureStarted();
    const normalized=normalizeSymbol(symbol);
    if(normalized===SHINE_PAIR)return syntheticOrderBook();
    if(!this.books.has(normalized)) await this.bootstrapOrderBook(normalized);
    this.connectDepthStream(normalized);
    this.connectTradeStream(normalized);
    return this.books.get(normalized);
  }

  async getTrades(symbol:string){
    this.ensureStarted();
    const normalized=normalizeSymbol(symbol);
    if(normalized===SHINE_PAIR)return [];
    if(!this.trades.has(normalized)) await this.bootstrapTrades(normalized);
    this.connectTradeStream(normalized);
    return this.trades.get(normalized)??[];
  }

  private emit(event:string,data:unknown){for(const listener of this.listeners)listener(event,data);}
  private emitTickers(){this.emit("tickers",this.getTickers());}
  private emitTickersThrottled(){
    if(this.tickerEmitTimer)return;
    this.tickerEmitTimer=setTimeout(()=>{this.tickerEmitTimer=null;this.emitTickers();},250);
  }

  private connectMarketStreams(){
    const realPairs=[...this.tickerPairs].filter(symbol=>symbol!==SHINE_PAIR);
    const streams=realPairs.map(symbol=>`${symbol.toLowerCase()}@ticker`).join("/");
    if(!streams)return;
    this.connect("ticker-symbols",`${WS_COMBINED_BASE}?streams=${streams}`,raw=>{
      const payload=JSON.parse(raw.toString()) as {data?:Record<string,string>}|Record<string,string>;
      const row=("data" in payload&&payload.data?payload.data:payload) as Record<string,string>;
      if(!row.s||!this.tickerPairs.has(row.s))return;
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
      this.emitTickersThrottled();
    });
    const bookStreams=realPairs.map(symbol=>`${symbol.toLowerCase()}@bookTicker`).join("/");
    if(!bookStreams)return;
    this.connect("book-ticker-symbols",`${WS_COMBINED_BASE}?streams=${bookStreams}`,raw=>{
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
    this.connect("depth",`${WS_COMBINED_BASE}?streams=${symbol.toLowerCase()}@depth20@100ms`,raw=>{
    const wrapped=JSON.parse(raw.toString()) as {data?:{lastUpdateId:number;bids:[string,string][];asks:[string,string][]}};
    const payload=wrapped.data;
    if(!payload)return;
    const book:OrderBook={symbol,lastUpdateId:payload.lastUpdateId,bids:payload.bids.map(([p,q])=>[Number(p),Number(q)]),asks:payload.asks.map(([p,q])=>[Number(p),Number(q)]),updatedAt:Date.now()};this.books.set(symbol,book);this.emit("depth",book);
  });}

  private connectTradeStream(symbol:string){
    if(this.activeTradeSymbol===symbol&&this.sockets.has("trades"))return;
    this.activeTradeSymbol=symbol;
    this.sockets.get("trades")?.close(1000,"active trade symbol changed");
    this.connect("trades",`${WS_COMBINED_BASE}?streams=${symbol.toLowerCase()}@trade`,raw=>{
      const wrapped=JSON.parse(raw.toString()) as {data?:{t:number;s:string;p:string;q:string;m:boolean;T:number}};
      const row=wrapped.data;
      if(!row||row.s!==symbol)return;
      const trade:RecentTrade={id:row.t,symbol:row.s,price:Number(row.p),qty:Number(row.q),quoteQty:Number(row.p)*Number(row.q),side:row.m?"SELL":"BUY",time:row.T};
      const rows=[trade,...(this.trades.get(symbol)??[])].slice(0,50);
      this.trades.set(symbol,rows);
      this.emit("trade",trade);
      this.emit("trades",{symbol,trades:rows});
    });
  }

  private connect(key:string,url:string,onMessage:(data:WebSocket.RawData)=>void){
    const existing=this.sockets.get(key);if(existing&&(existing.readyState===WebSocket.OPEN||existing.readyState===WebSocket.CONNECTING))return;
    this.logInfo(`${key} connecting`,{url});
    const socket=new WebSocket(url);this.sockets.set(key,socket);
    const rotate=setTimeout(()=>socket.close(1000,"scheduled reconnect"),23*60*60*1000+55*60*1000);
    socket.on("open",()=>{this.reconnectAttempts.delete(key);this.logInfo(`${key} connected`);if(key==="ticker-symbols"||key==="book-ticker-symbols")this.refreshTickers(`${key}-connected`).catch(error=>this.logError(`${key}-refresh`,error));});
    socket.on("message",data=>{try{onMessage(data);}catch(error){this.logError(`${key} message`,error);}});
    socket.on("ping",data=>socket.pong(data));
    socket.on("close",(code,reason)=>{clearTimeout(rotate);if(this.sockets.get(key)!==socket)return;this.sockets.delete(key);this.logError(`${key} closed`,new Error(`${code} ${reason.toString()||"no reason"}`));this.scheduleReconnect(key,()=>this.connect(key,url,onMessage));});
    socket.on("error",error=>{this.logError(`${key} error`,error);socket.close();});
  }

  private scheduleReconnect(key:string,reconnect:()=>void){
    if(this.reconnects.has(key))return;
    const attempt=(this.reconnectAttempts.get(key)??0)+1;
    this.reconnectAttempts.set(key,attempt);
    const delay=Math.min(30000,1000*2**Math.min(attempt-1,5));
    this.logInfo(`${key} reconnect scheduled`,{attempt,delay});
    const timer=setTimeout(()=>{this.reconnects.delete(key);reconnect();},delay);
    this.reconnects.set(key,timer);
  }
  private closeSocket(key:string,reason:string){
    const timer=this.reconnects.get(key);
    if(timer){clearTimeout(timer);this.reconnects.delete(key);}
    const socket=this.sockets.get(key);
    if(!socket)return;
    this.sockets.delete(key);
    socket.close(1000,reason);
  }
  private async refreshTickers(reason:string){const response=await fetch(`${REST_BASE}/ticker/24hr`,{cache:"no-store"});if(!response.ok)throw new Error(`Binance ticker request failed ${response.status}`);const rows=await response.json() as Record<string,string>[];let updated=0;for(const row of rows){const symbol=row.symbol??row.s;if(!symbol||!this.tickerPairs.has(symbol))continue;const previous=this.tickers.get(symbol);this.tickers.set(symbol,{symbol,price:Number(row.lastPrice),changePercent:Number(row.priceChangePercent),volume:Number(row.volume),quoteVolume:Number(row.quoteVolume),high:Number(row.highPrice),low:Number(row.lowPrice),bestBidPrice:previous?.bestBidPrice??0,bestBidQty:previous?.bestBidQty??0,bestAskPrice:previous?.bestAskPrice??0,bestAskQty:previous?.bestAskQty??0,updatedAt:Date.now()});updated++;}this.logInfo("tickers refreshed",{reason,updated});this.emitTickers();}
  private async bootstrapCandles(symbol:string,interval:string){const response=await fetch(`${REST_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=120`,{cache:"no-store"});if(!response.ok)throw new Error("Binance kline request failed");const rows=await response.json() as Array<[number,string,string,string,string,string,number]>;this.candles.set(`${symbol}:${interval}`,rows.map(row=>({openTime:row[0],open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),close:Number(row[4]),volume:Number(row[5]),closeTime:row[6]})));}
  private async bootstrapOrderBook(symbol:string){const response=await fetch(`${REST_BASE}/depth?symbol=${symbol}&limit=20`,{cache:"no-store"});if(!response.ok)throw new Error("Binance order book request failed");const data=await response.json() as {lastUpdateId:number;bids:[string,string][];asks:[string,string][]};this.books.set(symbol,{symbol,lastUpdateId:data.lastUpdateId,bids:data.bids.map(([p,q])=>[Number(p),Number(q)]),asks:data.asks.map(([p,q])=>[Number(p),Number(q)]),updatedAt:Date.now()});}
  private async bootstrapTrades(symbol:string){const response=await fetch(`${REST_BASE}/trades?symbol=${symbol}&limit=50`,{cache:"no-store"});if(!response.ok)throw new Error("Binance trades request failed");const rows=await response.json() as Array<{id:number;price:string;qty:string;quoteQty:string;time:number;isBuyerMaker:boolean}>;this.trades.set(symbol,rows.reverse().map(row=>({id:row.id,symbol,price:Number(row.price),qty:Number(row.qty),quoteQty:Number(row.quoteQty),side:row.isBuyerMaker?"SELL":"BUY",time:row.time})));}
  private logInfo(message:string,meta?:unknown){console.info(`[market-data] ${message}`,meta??"");}
  private logError(message:string,error:unknown){console.error(`[market-data] ${message}`,error instanceof Error?{message:error.message,stack:error.stack}:error);}
}

function normalizeSymbol(symbol:string){const value=symbol.toUpperCase().replace(/[^A-Z0-9]/g,"");return value.endsWith("USDT")?value:`${value}USDT`;}

function shineTicker(): MarketTicker {
  return { symbol: SHINE_PAIR, price: SHINE_PRICE_USD, changePercent: 0, volume: 0, quoteVolume: 0, high: SHINE_PRICE_USD, low: SHINE_PRICE_USD, bestBidPrice: SHINE_PRICE_USD, bestBidQty: 100000, bestAskPrice: SHINE_PRICE_USD, bestAskQty: 100000, updatedAt: Date.now() };
}

function syntheticCandles(interval:string): Candle[] {
  const now=Date.now();
  const minute=60_000;
  return Array.from({length:120},(_,index)=>({openTime:now-(119-index)*minute,open:SHINE_PRICE_USD,high:SHINE_PRICE_USD,low:SHINE_PRICE_USD,close:SHINE_PRICE_USD,volume:0,closeTime:now-(118-index)*minute}));
}

function syntheticOrderBook(): OrderBook {
  const steps=[1,2,3,4,5,6,7,8,9,10];
  return {symbol:SHINE_PAIR,lastUpdateId:Date.now(),bids:steps.map(step=>[Number((SHINE_PRICE_USD-step*.001).toFixed(6)),10000*step]),asks:steps.map(step=>[Number((SHINE_PRICE_USD+step*.001).toFixed(6)),10000*step]),updatedAt:Date.now()};
}

const globalMarket=globalThis as typeof globalThis&{__voltixMarketData?:BinanceMarketData};
export const marketData=globalMarket.__voltixMarketData??new BinanceMarketData();
globalMarket.__voltixMarketData=marketData;
