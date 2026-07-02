import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function validSignature(body:string, signature:string|null){
  const secret=process.env.CHAIN_WEBHOOK_SECRET;
  if(!secret||!signature) return false;
  const expected=createHmac("sha256",secret).update(body).digest("hex");
  const a=Buffer.from(expected),b=Buffer.from(signature);
  return a.length===b.length&&timingSafeEqual(a,b);
}

export async function POST(request:NextRequest){
  const body=await request.text();
  if(!validSignature(body,request.headers.get("x-chain-signature"))) return NextResponse.json({error:"Invalid signature"},{status:401});
  // Production adapter: validate the event against an RPC provider, upsert by
  // network + tx hash + event index, then credit only the user's Spot wallet
  // through creditConfirmedDepositToSpot and a balanced, idempotent journal.
  return NextResponse.json({accepted:true});
}
