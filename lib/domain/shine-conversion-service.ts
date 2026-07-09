import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SHINE_NAME, SHINE_PRICE_USD, SHINE_SYMBOL } from "@/lib/shine-token";
import { postBalancedJournal } from "./ledger";

export async function convertUsdtToShine(input: { userId: string; usdtAmount: Prisma.Decimal; idempotencyKey: string }) {
  const idempotencyKey=input.idempotencyKey.trim();
  if(!idempotencyKey)throw new Error("Idempotency key is required");
  if(input.usdtAmount.lte(0))throw new Error("USDT amount must be greater than 0");
  const price=new Prisma.Decimal(SHINE_PRICE_USD);
  const shineAmount=input.usdtAmount.div(price);

  return prisma.$transaction(async tx=>{
    const existing=await tx.assetConversion.findUnique({where:{idempotencyKey}});
    if(existing)return formatConversion(existing);

    const [user,usdtAsset,shineAsset]=await Promise.all([
      tx.user.findUniqueOrThrow({where:{id:input.userId},select:{id:true,spotBalance:true}}),
      tx.asset.upsert({where:{symbol:"USDT"},update:{enabled:true},create:{symbol:"USDT",name:"Tether",decimals:18,enabled:true}}),
      tx.asset.upsert({where:{symbol:SHINE_SYMBOL},update:{name:SHINE_NAME,enabled:true},create:{symbol:SHINE_SYMBOL,name:SHINE_NAME,decimals:18,enabled:true}}),
    ]);

    const debit=await tx.user.updateMany({where:{id:user.id,spotBalance:{gte:input.usdtAmount}},data:{spotBalance:{decrement:input.usdtAmount}}});
    if(debit.count!==1)throw new Error("Insufficient Spot Wallet USDT balance");

    const [userUsdtAccount,userShineAccount,feeUsdtAccount,feeShineAccount]=await Promise.all([
      ensureAccount(tx,user.id,usdtAsset.id,"SPOT"),
      ensureAccount(tx,user.id,shineAsset.id,"SPOT"),
      ensureSystemAccount(tx,usdtAsset.id,"FEE"),
      ensureSystemAccount(tx,shineAsset.id,"FEE"),
    ]);

    const conversion=await tx.assetConversion.create({
      data:{
        userId:user.id,
        fromAssetId:usdtAsset.id,
        toAssetId:shineAsset.id,
        fromSymbol:"USDT",
        toSymbol:SHINE_SYMBOL,
        fromAmount:input.usdtAmount,
        toAmount:shineAmount,
        price,
        idempotencyKey,
        status:"PENDING",
      },
    });

    const usdtJournal=await postBalancedJournal(tx,{
      referenceType:"ASSET_CONVERSION_USDT",
      referenceId:conversion.id,
      idempotencyKey:`asset-conversion:${idempotencyKey}:usdt`,
      memo:`Convert USDT to ${SHINE_SYMBOL}`,
      lines:[
        {accountId:userUsdtAccount.id,direction:"DEBIT",amount:input.usdtAmount},
        {accountId:feeUsdtAccount.id,direction:"CREDIT",amount:input.usdtAmount},
      ],
    });
    const shineJournal=await postBalancedJournal(tx,{
      referenceType:"ASSET_CONVERSION_SHINE",
      referenceId:conversion.id,
      idempotencyKey:`asset-conversion:${idempotencyKey}:shine`,
      memo:`Credit ${SHINE_SYMBOL} conversion`,
      lines:[
        {accountId:feeShineAccount.id,direction:"DEBIT",amount:shineAmount},
        {accountId:userShineAccount.id,direction:"CREDIT",amount:shineAmount},
      ],
    });

    const completed=await tx.assetConversion.update({
      where:{id:conversion.id},
      data:{status:"COMPLETED",usdtLedgerJournalId:usdtJournal.id,shineLedgerJournalId:shineJournal.id},
    });
    return formatConversion(completed);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function getUserShineConversions(userId:string) {
  const rows=await prisma.assetConversion.findMany({where:{userId,toSymbol:SHINE_SYMBOL},orderBy:{createdAt:"desc"},take:25});
  return {conversions:rows.map(formatConversion)};
}

async function ensureAccount(tx:Prisma.TransactionClient,userId:string,assetId:string,type:"SPOT") {
  const existing=await tx.walletAccount.findUnique({where:{userId_assetId_type:{userId,assetId,type}}});
  if(existing)return existing;
  return tx.walletAccount.create({data:{userId,assetId,type}});
}

async function ensureSystemAccount(tx:Prisma.TransactionClient,assetId:string,type:"FEE") {
  const existing=await tx.walletAccount.findFirst({where:{userId:null,assetId,type}});
  if(existing)return existing;
  return tx.walletAccount.create({data:{assetId,type}});
}

function formatConversion(row:{id:string;fromSymbol:string;toSymbol:string;fromAmount:Prisma.Decimal;toAmount:Prisma.Decimal;price:Prisma.Decimal;status:string;createdAt:Date}) {
  return {
    id:row.id,
    fromSymbol:row.fromSymbol,
    toSymbol:row.toSymbol,
    fromAmount:Number(row.fromAmount.toString()),
    toAmount:Number(row.toAmount.toString()),
    price:Number(row.price.toString()),
    status:row.status,
    createdAt:row.createdAt.toISOString(),
  };
}
