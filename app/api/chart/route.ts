import { NextRequest,NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{const symbol=request.nextUrl.searchParams.get("symbol")??"BTCUSDT";const interval=request.nextUrl.searchParams.get("interval")??"1m";const candles=await marketData.getCandles(symbol,interval);return NextResponse.json({source:"binance",symbol:symbol.toUpperCase(),interval,candles});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Chart unavailable"},{status:502});}}
