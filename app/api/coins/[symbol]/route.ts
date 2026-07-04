import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";

export async function PATCH(request:Request,{params}:{params:Promise<{symbol:string}>}){const admin=await getCurrentAdmin();if(admin.response)return admin.response;const {symbol:raw}=await params;const symbol=raw.toUpperCase();const body=await request.json() as {name?:string;pair?:string;logoUrl?:string|null;localLogoPath?:string|null;isActive?:boolean;displayOrder?:number};const coin=await prisma.coinMetadata.update({where:{symbol},data:{...(body.name!==undefined?{name:body.name}:{}),...(body.pair!==undefined?{pair:body.pair.toUpperCase()}:{}),...(body.logoUrl!==undefined?{logoUrl:body.logoUrl}:{}),...(body.localLogoPath!==undefined?{localLogoPath:body.localLogoPath}:{}),...(body.isActive!==undefined?{isActive:body.isActive}:{}),...(body.displayOrder!==undefined?{displayOrder:body.displayOrder}:{})}});return NextResponse.json({coin});}
