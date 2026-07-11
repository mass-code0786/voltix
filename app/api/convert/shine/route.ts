import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { rateLimitByUser } from "@/lib/security";
import { convertUsdtToShine, getUserShineConversions } from "@/lib/domain/shine-conversion-service";

const convertSchema=z.object({
  amount:z.string().trim().regex(/^\d+(?:\.\d{1,18})?$/,"Enter a valid amount with up to 18 decimals"),
  idempotencyKey:z.string().trim().min(8,"Idempotency key is required").max(120),
});

export async function GET(){
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"Login required"},{status:401});
  return NextResponse.json(await getUserShineConversions(user.id));
}

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user)return NextResponse.json({error:"Login required"},{status:401});
  const limited=rateLimitByUser(user.id,"shine-conversion",30,60*60*1000);
  if(limited)return limited;
  const parsed=convertSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid conversion request"},{status:400});
  try{
    const conversion=await convertUsdtToShine({userId:user.id,usdtAmount:new Prisma.Decimal(parsed.data.amount),idempotencyKey:parsed.data.idempotencyKey});
    await auditSuccess({request,userId:user.id,role:"USER",action:"SHINE_CONVERT",module:"WALLET",description:"User converted USDT to SHINE",newValue:conversion}).catch(()=>null);
    return NextResponse.json({conversion},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"SHINE conversion failed";
    await auditFailure({request,userId:user.id,role:"USER",action:"SHINE_CONVERT",module:"WALLET",description:"SHINE conversion failed",errorMessage:message}).catch(()=>null);
    return NextResponse.json({error:message},{status:400});
  }
}
