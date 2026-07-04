import { mkdir,writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/auth";

export const runtime="nodejs";
const allowed=new Map([["image/png","png"],["image/jpeg","jpg"],["image/webp","webp"]]);
export async function POST(request:Request,{params}:{params:Promise<{symbol:string}>}){const admin=await getCurrentAdmin();if(admin.response)return admin.response;const {symbol:raw}=await params;const symbol=raw.toUpperCase().replace(/[^A-Z0-9]/g,"");const form=await request.formData();const file=form.get("logo");if(!(file instanceof File))return NextResponse.json({error:"Logo file is required"},{status:400});const extension=allowed.get(file.type);if(!extension)return NextResponse.json({error:"Only PNG, JPG, or WebP images are allowed"},{status:400});if(file.size>2*1024*1024)return NextResponse.json({error:"Logo must be 2MB or smaller"},{status:400});const directory=path.join(process.cwd(),"public","coin-logos");await mkdir(directory,{recursive:true});const filename=`${symbol.toLowerCase()}.${extension}`;await writeFile(path.join(directory,filename),Buffer.from(await file.arrayBuffer()));const localLogoPath=`/coin-logos/${filename}`;const coin=await prisma.coinMetadata.update({where:{symbol},data:{localLogoPath}});return NextResponse.json({coin});}
