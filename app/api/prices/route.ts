import { NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await configureEnabledPairs();
  await marketData.refreshNow("api-request");
  return NextResponse.json({source:"binance",updatedAt:new Date().toISOString(),tickers:marketData.getTickers()});
}

async function configureEnabledPairs(){
  try{
    const coins=await prisma.coinMetadata.findMany({where:{isActive:true},select:{symbol:true,pair:true}});
    if(coins.length)marketData.configureTickerPairs(coins.map(coin=>coin.pair??coin.symbol));
  }catch{}
}
