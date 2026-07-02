import { marketData } from "@/lib/market-data";
import { prisma } from "@/lib/prisma";
import { enabledTradingPairs } from "@/lib/coin-list";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{const coins=await prisma.coinMetadata.findMany({where:{isActive:true},select:{symbol:true,pair:true}});marketData.configureTickerPairs(coins.length?coins.map(coin=>coin.pair??coin.symbol):enabledTradingPairs);}catch(error){console.error("[market-data] coin metadata unavailable, using catalog pairs",error);marketData.configureTickerPairs(enabledTradingPairs);}
  await marketData.refreshNow("stream-open");
  const encoder=new TextEncoder();let unsubscribe=()=>{};
  const stream=new ReadableStream({start(controller){const send=(event:string,data:unknown)=>controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));send("tickers",marketData.getTickers());unsubscribe=marketData.subscribe(send);const heartbeat=setInterval(()=>controller.enqueue(encoder.encode(": ping\n\n")),15000);request.signal.addEventListener("abort",()=>{clearInterval(heartbeat);unsubscribe();try{controller.close();}catch{}});},cancel(){unsubscribe();}});
  return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","Connection":"keep-alive"}});
}
