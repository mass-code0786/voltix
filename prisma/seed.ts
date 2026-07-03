import { PrismaClient, Prisma } from "@prisma/client";
import { coinCatalog, catalogBySymbol } from "../lib/coin-list";

const prisma = new PrismaClient();

async function main() {
  for (const coin of coinCatalog) {
    const displayOrder=catalogBySymbol.get(coin.symbol)?.displayOrder??9999;
    const pair=coin.pair??`${coin.symbol}USDT`;
    await prisma.coinMetadata.upsert({ where:{symbol:coin.symbol}, update:{name:coin.name,pair,isActive:coin.enabled!==false,displayOrder}, create:{symbol:coin.symbol,name:coin.name,pair,isActive:coin.enabled!==false,displayOrder,localLogoPath:`/coin-logos/${coin.symbol.toLowerCase()}.png`} });
  }
  const usdt = await prisma.asset.upsert({
    where: { symbol: "USDT" }, update: {},
    create: { symbol: "USDT", name: "Tether", decimals: 18 },
  });
  for (const asset of coinCatalog.filter(coin=>coin.symbol!=="USDT")) {
    await prisma.asset.upsert({ where: { symbol: asset.symbol }, update: { name: asset.name, enabled: asset.enabled!==false }, create: { symbol: asset.symbol, name: asset.name, decimals: defaultDecimals(asset.symbol), enabled: asset.enabled!==false } });
  }
  const bsc = await prisma.chainNetwork.upsert({ where: { key: "bsc" }, update: {}, create: { key: "bsc", name: "BNB Smart Chain", requiredConfirmations: 12 } });
  const slots = await Promise.all([["Window 1", "08:30"], ["Window 2", "12:30"], ["Window 3", "14:30"]].map(([label, utcTime]) => prisma.tradeSlot.create({ data: { label, utcTime } })));
  const starter = await prisma.mlmPlan.upsert({ where: { name_version: { name: "Starter", version: 1 } }, update: {}, create: { name: "Starter", version: 1, packageAmountUsd: 50, directPercent: 5, matchingPercent: 1, levelPercents: [3,2,1] } });
  const user = await prisma.user.upsert({ where: { email: "arjun@example.com" }, update: { uid: "762897", country: "India" }, create: { email: "arjun@example.com", uid: "762897", name: "Arjun Kumar", country: "India", passwordHash: "demo-not-for-auth", extraTradeTrialEndsAt: new Date(Date.now() + 24*60*60*1000), permanentExtraTrade: true, spotBalance: 1280.50, futuresBalance: 350, bitexBalance: 1284.65, bitexPrincipal: 2468.25, bitexIncomeEarned: 642.40, bitexTargetAmount: 4936.50 } });
  await prisma.userPackage.create({ data: { userId: user.id, planId: starter.id, amountUsd: 50 } });
  await prisma.walletAccount.createMany({ data: [{ userId: user.id, assetId: usdt.id, type: "SPOT" }, { userId: user.id, assetId: usdt.id, type: "FUTURES" }, { userId: user.id, assetId: usdt.id, type: "BITEX" }, { assetId: usdt.id, type: "SPOT" }, { assetId: usdt.id, type: "FEE" }], skipDuplicates: true });
  await prisma.depositAddress.upsert({ where: { networkId_address: { networkId: bsc.id, address: "0x7F3B91a8D4C62E5a1108f42D8E6b2C309A7dB844" } }, update: {}, create: { userId: user.id, assetId: usdt.id, networkId: bsc.id, address: "0x7F3B91a8D4C62E5a1108f42D8E6b2C309A7dB844", derivationIndex: 1842, path: "m/44'/60'/0'/0/1842" } });
  await prisma.tradeCode.upsert({ where: { code: "A7K92B" }, update: {}, create: { code: "A7K92B", returnPercent: new Prisma.Decimal(2.35), assignedUserId: user.id, slotId: slots[1].id, createdBy: "seed" } });
}

function defaultDecimals(symbol:string){return new Set(["BTC","LTC","BCH","DOGE","DASH","ZEC"]).has(symbol)?8:18;}

main().finally(() => prisma.$disconnect());
