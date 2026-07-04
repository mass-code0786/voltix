import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { catalogBySymbol, coinCatalog } from "@/lib/coin-list";
import { getCurrentAdmin } from "@/lib/auth";

export async function GET(){
  try{
    await ensureCatalogCoins();
    const coins=await prisma.coinMetadata.findMany({orderBy:[{displayOrder:"asc"},{symbol:"asc"}]});
    return NextResponse.json({coins});
  }catch(error){
    console.error("[coins] database unavailable, using catalog fallback",error);
    return NextResponse.json({coins:catalogFallbackCoins(),source:"catalog-fallback"});
  }
}

export async function POST(request:Request){
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const body=await request.json() as {symbol?:string;name?:string;pair?:string;isActive?:boolean;displayOrder?:number};
  const symbol=(body.symbol??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(!symbol||!body.name?.trim())return NextResponse.json({error:"Symbol and name are required"},{status:400});
  const pair=(body.pair??`${symbol}USDT`).toUpperCase().replace(/[^A-Z0-9]/g,"");
  const count=await prisma.coinMetadata.count();
  const coin=await prisma.coinMetadata.create({data:{symbol,name:body.name.trim(),pair,isActive:body.isActive??true,displayOrder:body.displayOrder??count+1,localLogoPath:`/coin-logos/${symbol.toLowerCase()}.png`}});
  return NextResponse.json({coin},{status:201});
}

async function ensureCatalogCoins(){
  const existing=await prisma.coinMetadata.findMany({select:{symbol:true}});
  const seen=new Set(existing.map(coin=>coin.symbol));
  const missing=coinCatalog.filter(coin=>!seen.has(coin.symbol));
  if(!missing.length)return;
  await prisma.coinMetadata.createMany({
    data:missing.map(coin=>{
      const catalog=catalogBySymbol.get(coin.symbol)!;
      return {symbol:coin.symbol,name:coin.name,pair:coin.pair??`${coin.symbol}USDT`,isActive:coin.enabled!==false,displayOrder:catalog.displayOrder,localLogoPath:`/coin-logos/${coin.symbol.toLowerCase()}.png`};
    }),
    skipDuplicates:true,
  });
}

function catalogFallbackCoins(){
  return coinCatalog.map(coin=>{
    const catalog=catalogBySymbol.get(coin.symbol)!;
    return {id:coin.symbol,symbol:coin.symbol,name:coin.name,pair:coin.pair??`${coin.symbol}USDT`,logoUrl:null,localLogoPath:`/coin-logos/${coin.symbol.toLowerCase()}.png`,isActive:coin.enabled!==false,displayOrder:catalog.displayOrder,createdAt:null,updatedAt:null};
  });
}
