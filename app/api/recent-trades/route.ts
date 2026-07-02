import { NextRequest,NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{const symbol=request.nextUrl.searchParams.get("symbol")??"BTCUSDT";const trades=await marketData.getTrades(symbol);return NextResponse.json({source:"binance",symbol:symbol.toUpperCase(),trades});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Recent trades unavailable"},{status:502});}}
