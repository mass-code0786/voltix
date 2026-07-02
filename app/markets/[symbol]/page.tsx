import { notFound } from "next/navigation";
import { CoinDetail } from "@/components/coin-detail";

export default async function MarketDetailPage({params}:{params:Promise<{symbol:string}>}){const {symbol:raw}=await params;const symbol=raw.toUpperCase();if(!/^[A-Z0-9]{3,20}USDT$/.test(symbol))notFound();return <CoinDetail symbol={symbol}/>;}
