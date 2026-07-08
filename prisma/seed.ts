import { PrismaClient } from "@prisma/client";
import { coinCatalog, catalogBySymbol } from "../lib/coin-list";

const prisma = new PrismaClient();
const allowDemoSeed = process.env.VOLTIX_ENABLE_DEMO_SEED === "true" && process.env.NODE_ENV !== "production";

async function main() {
  for (const coin of coinCatalog) {
    const displayOrder=catalogBySymbol.get(coin.symbol)?.displayOrder??9999;
    const pair=coin.pair??`${coin.symbol}USDT`;
    await prisma.coinMetadata.upsert({ where:{symbol:coin.symbol}, update:{name:coin.name,pair,isActive:coin.enabled!==false,displayOrder,logoUrl:coin.logoUrl,localLogoPath:`/coin-logos/${coin.symbol.toLowerCase()}.png`}, create:{symbol:coin.symbol,name:coin.name,pair,isActive:coin.enabled!==false,displayOrder,logoUrl:coin.logoUrl,localLogoPath:`/coin-logos/${coin.symbol.toLowerCase()}.png`} });
  }
  const usdt = await prisma.asset.upsert({
    where: { symbol: "USDT" }, update: {},
    create: { symbol: "USDT", name: "Tether", decimals: 18 },
  });
  for (const asset of coinCatalog.filter(coin=>coin.symbol!=="USDT")) {
    await prisma.asset.upsert({ where: { symbol: asset.symbol }, update: { name: asset.name, enabled: asset.enabled!==false }, create: { symbol: asset.symbol, name: asset.name, decimals: defaultDecimals(asset.symbol), enabled: asset.enabled!==false } });
  }
  await prisma.chainNetwork.upsert({ where: { key: "bsc" }, update: {}, create: { key: "bsc", name: "BNB Smart Chain", requiredConfirmations: 12 } });
  for (const [label, utcTime] of [["Window 1", "08:30"], ["Window 2", "12:30"], ["Window 3", "17:10"]]) {
    const slot = await prisma.tradeSlot.findFirst({ where: { label } });
    if (slot) await prisma.tradeSlot.update({ where: { id: slot.id }, data: { utcTime, durationMinutes: 30 } });
    else await prisma.tradeSlot.create({ data: { label, utcTime, durationMinutes: 30 } });
  }
  await prisma.mlmPlan.upsert({ where: { name_version: { name: "Starter", version: 1 } }, update: {}, create: { name: "Starter", version: 1, packageAmountUsd: 50, directPercent: 5, matchingPercent: 1, levelPercents: [3,2,1] } });
  await prisma.walletAccount.createMany({ data: [{ assetId: usdt.id, type: "SPOT" }, { assetId: usdt.id, type: "FEE" }], skipDuplicates: true });
  if (allowDemoSeed) {
    console.warn("VOLTIX_ENABLE_DEMO_SEED is enabled. No production demo identity is seeded by default.");
  }
}

function defaultDecimals(symbol:string){return new Set(["BTC","LTC","BCH","DOGE","DASH","ZEC"]).has(symbol)?8:18;}

main().finally(() => prisma.$disconnect());
