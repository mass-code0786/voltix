import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { catalogBySymbol, coinCatalog } from "@/lib/coin-list";
import { getCurrentAdmin } from "@/lib/auth";
import { rateLimitByAdmin } from "@/lib/security";
import { auditSuccess } from "@/lib/audit";

const coinCreateSchema = z.object({
  symbol: z.string().trim().min(1).max(16),
  name: z.string().trim().min(1).max(80),
  pair: z.string().trim().max(24).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.coerce.number().int().positive().optional(),
});

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
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const limited = rateLimitByAdmin(admin.user.id);
  if (limited) return limited;
  const parsed = coinCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid coin" }, { status: 400 });
  const body=parsed.data;
  const symbol=(body.symbol??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(!symbol||!body.name?.trim())return NextResponse.json({error:"Symbol and name are required"},{status:400});
  const pair=(body.pair??`${symbol}USDT`).toUpperCase().replace(/[^A-Z0-9]/g,"");
  const count=await prisma.coinMetadata.count();
  const coin=await prisma.coinMetadata.create({data:{symbol,name:body.name.trim(),pair,isActive:body.isActive??true,displayOrder:body.displayOrder??count+1,logoUrl:`https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`,localLogoPath:`/coin-logos/${symbol.toLowerCase()}.png`}});
  await auditSuccess({ request, adminId: admin.user.id, role: "ADMIN", action: "COIN_CREATE", module: "COINS", description: "Admin created coin", newValue: coin }).catch(() => null);
  return NextResponse.json({coin},{status:201});
}

async function ensureCatalogCoins(){
  const existing=await prisma.coinMetadata.findMany({select:{symbol:true}});
  const seen=new Set(existing.map(coin=>coin.symbol));
  const missing=coinCatalog.filter(coin=>!seen.has(coin.symbol));
  await Promise.all(coinCatalog.filter(coin=>seen.has(coin.symbol)).map(coin=>{
    const catalog=catalogBySymbol.get(coin.symbol)!;
    return prisma.coinMetadata.update({where:{symbol:coin.symbol},data:{name:coin.name,pair:coin.pair??`${coin.symbol}USDT`,isActive:coin.enabled!==false,displayOrder:catalog.displayOrder,logoUrl:coin.logoUrl,localLogoPath:`/coin-logos/${coin.symbol.toLowerCase()}.png`}});
  }));
  if(missing.length)await prisma.coinMetadata.createMany({
    data:missing.map(coin=>{
      const catalog=catalogBySymbol.get(coin.symbol)!;
      return {symbol:coin.symbol,name:coin.name,pair:coin.pair??`${coin.symbol}USDT`,isActive:coin.enabled!==false,displayOrder:catalog.displayOrder,logoUrl:coin.logoUrl,localLogoPath:`/coin-logos/${coin.symbol.toLowerCase()}.png`};
    }),
    skipDuplicates:true,
  });
}

function catalogFallbackCoins(){
  return coinCatalog.map(coin=>{
    const catalog=catalogBySymbol.get(coin.symbol)!;
    return {id:coin.symbol,symbol:coin.symbol,name:coin.name,pair:coin.pair??`${coin.symbol}USDT`,logoUrl:coin.logoUrl,localLogoPath:`/coin-logos/${coin.symbol.toLowerCase()}.png`,isActive:coin.enabled!==false,displayOrder:catalog.displayOrder,createdAt:null,updatedAt:null};
  });
}
