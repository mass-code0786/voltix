import { NextResponse } from "next/server";
import { marketData } from "@/lib/market-data";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await configureEnabledPairs();
  return NextResponse.json({source:"binance",updatedAt:new Date().toISOString(),tickers:marketData.getTickers()});
}

async function configureEnabledPairs(){
  try{
    const coins=await prisma.coinMetadata.findMany({where:{isActive:true},select:{pair:true}});
    if(coins.length)marketData.configureTickerPairs(coins.map(coin=>coin.pair));
  }catch{}
}
