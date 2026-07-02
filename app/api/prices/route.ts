import { NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";
import { prisma } from "@/lib/prisma";
import { enabledTradingPairs } from "@/lib/coin-list";

export async function GET() {
  await configureEnabledPairs();
  await marketData.refreshNow("api-request");
  return NextResponse.json({source:"binance",updatedAt:new Date().toISOString(),tickers:marketData.getTickers()});
}

async function configureEnabledPairs(){
  try{
    const coins=await prisma.coinMetadata.findMany({where:{isActive:true},select:{symbol:true,pair:true}});
    marketData.configureTickerPairs(coins.length?coins.map(coin=>coin.pair??coin.symbol):enabledTradingPairs);
  }catch(error){
    console.error("[market-data] coin metadata unavailable, using catalog pairs",error);
    marketData.configureTickerPairs(enabledTradingPairs);
  }
}
