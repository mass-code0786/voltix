import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";
import { rateLimitByAdmin } from "@/lib/security";
import { auditSuccess } from "@/lib/audit";

const coinUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  pair: z.string().trim().min(1).max(24).optional(),
  logoUrl: z.string().trim().url().nullable().optional(),
  localLogoPath: z.string().trim().nullable().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.coerce.number().int().positive().optional(),
});

export async function PATCH(request:Request,{params}:{params:Promise<{symbol:string}>}){const admin=await getCurrentAdmin();if(admin.response)return admin.response;if(!admin.user)return NextResponse.json({error:"Admin access required"},{status:403});const limited=rateLimitByAdmin(admin.user.id);if(limited)return limited;const {symbol:raw}=await params;const symbol=raw.toUpperCase();const parsed=coinUpdateSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message??"Invalid coin update"},{status:400});const body=parsed.data;const before=await prisma.coinMetadata.findUnique({where:{symbol}});const coin=await prisma.coinMetadata.update({where:{symbol},data:{...(body.name!==undefined?{name:body.name}:{}),...(body.pair!==undefined?{pair:body.pair.toUpperCase()}:{}),...(body.logoUrl!==undefined?{logoUrl:body.logoUrl}:{}),...(body.localLogoPath!==undefined?{localLogoPath:body.localLogoPath}:{}),...(body.isActive!==undefined?{isActive:body.isActive}:{}),...(body.displayOrder!==undefined?{displayOrder:body.displayOrder}:{})}});await auditSuccess({request,adminId:admin.user.id,role:"ADMIN",action:"COIN_UPDATE",module:"COINS",description:"Admin updated coin",oldValue:before,newValue:coin,metadata:{fields:Object.keys(body)}}).catch(()=>null);return NextResponse.json({coin});}
