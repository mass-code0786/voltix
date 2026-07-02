"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CandlestickChart } from "./candlestick-chart";
import { OrderBookPanel } from "./order-book";
import { useLiveTickers } from "@/lib/use-market-data";

export function CoinDetail({symbol}:{symbol:string}){const tickers=useLiveTickers();const ticker=tickers.find(item=>item.symbol===symbol);return <main className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6 lg:py-8"><Link href="/?view=markets" className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-lime"><ArrowLeft size={15}/>Back to Markets</Link><div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs text-slate-500">Live market</p><h1 className="mt-1 text-2xl font-black">{symbol.replace("USDT"," / USDT")}</h1></div>{ticker?.price&&<div className="text-right"><p className="text-xl font-black">{ticker.price.toLocaleString("en-US",{maximumFractionDigits:8})}</p><p className={`mt-1 text-xs font-bold ${ticker.changePercent>=0?"text-mint":"text-danger"}`}>{ticker.changePercent>=0?"+":""}{ticker.changePercent.toFixed(2)}%</p></div>}</div>{ticker&&<div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><MiniStat label="Best Bid" value={ticker.bestBidPrice?`${formatPrice(ticker.bestBidPrice)} · ${formatQty(ticker.bestBidQty)}`:"Waiting"}/><MiniStat label="Best Ask" value={ticker.bestAskPrice?`${formatPrice(ticker.bestAskPrice)} · ${formatQty(ticker.bestAskQty)}`:"Waiting"}/><MiniStat label="Volume" value={ticker.price?formatQty(ticker.volume):"Waiting"}/><MiniStat label="Last Price" value={ticker.price?formatPrice(ticker.price):"Waiting"}/></div>}<div className="grid gap-5 xl:grid-cols-[1.45fr_.55fr]"><CandlestickChart symbol={symbol}/><OrderBookPanel symbol={symbol}/></div></main>}

function MiniStat({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-line bg-panel/80 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 truncate text-xs font-black text-white">{value}</p></div>}
function formatQty(value:number){return new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(value);}
function formatPrice(value:number){return value<1?value.toFixed(6):value.toLocaleString("en-US",{maximumFractionDigits:2});}
