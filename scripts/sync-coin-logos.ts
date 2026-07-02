import { mkdir,writeFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { coinCatalog } from "../lib/coin-list";

const prisma=new PrismaClient();
const ids=Object.fromEntries(coinCatalog.map(coin=>[coin.symbol,coin.coingeckoId]));

async function main(){
  const directory=path.join(process.cwd(),"public","coin-logos");
  await mkdir(directory,{recursive:true});
  const query=Object.values(ids).join(",");
  const response=await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${query}&sparkline=false`);
  if(!response.ok)throw new Error(`CoinGecko request failed: ${response.status}`);
  const markets=await response.json() as {id:string;image:string}[];
  const images=new Map(markets.map(item=>[item.id,item.image]));
  const databaseReady=Boolean(process.env.DATABASE_URL);
  for(const [symbol,id] of Object.entries(ids)){
    const logoUrl=images.get(id);if(!logoUrl){console.warn(`No logo returned for ${symbol}`);continue;}
    const imageResponse=await fetch(logoUrl);if(!imageResponse.ok){console.warn(`Logo download failed for ${symbol}`);continue;}
    const localLogoPath=`/coin-logos/${symbol.toLowerCase()}.png`;
    await writeFile(path.join(directory,`${symbol.toLowerCase()}.png`),Buffer.from(await imageResponse.arrayBuffer()));
    if(databaseReady)await prisma.coinMetadata.update({where:{symbol},data:{logoUrl,localLogoPath}});
    console.log(`Cached ${symbol} -> ${localLogoPath}`);
  }
  if(!databaseReady)console.warn("DATABASE_URL is not configured; files were cached and seed data already contains their local paths.");
}

main().finally(()=>prisma.$disconnect());
