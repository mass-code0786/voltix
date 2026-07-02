import { NextRequest,NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";

export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{const symbol=request.nextUrl.searchParams.get("symbol")??"BTCUSDT";const orderBook=await marketData.getOrderBook(symbol);return NextResponse.json({source:"binance",orderBook});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Order book unavailable"},{status:502});}}
