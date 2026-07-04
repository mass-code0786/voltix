import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/auth";
import { createTradeCode, getAdminTradeCodes } from "@/lib/domain/trade-service";

const createCodeSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9]{6}$/i).optional(),
  vipRank: z.string().trim().min(1).default("NONE"),
  returnPercent: z.coerce.number().min(2).max(2.5),
  maxUsage: z.coerce.number().int().min(1).default(1),
  createdBy: z.string().trim().min(1).default("admin"),
});

export async function GET() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const codes = await getAdminTradeCodes();
  return NextResponse.json({
    codes: codes.map(code => ({
      id: code.id,
      code: code.code,
      vipRank: code.vipRank,
      returnPercent: Number(code.returnPercent.toString()),
      createdAt: code.createdAt.toISOString(),
      expiresAt: code.expiresAt?.toISOString() ?? null,
      tradeWindow: code.tradeWindowMinutes,
      status: code.status,
      maxUsage: code.maxUsage,
      currentUsage: code.usedCount,
      createdBy: code.createdBy,
    })),
  });
}

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const parsed = createCodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid trade code" }, { status: 400 });
  }

  try {
    const code = await createTradeCode({
      code: parsed.data.code,
      vipRank: parsed.data.vipRank,
      returnPercent: new Prisma.Decimal(parsed.data.returnPercent),
      maxUsage: parsed.data.maxUsage,
      createdBy: parsed.data.createdBy,
    });
    return NextResponse.json({
      code: {
        id: code.id,
        code: code.code,
        vipRank: code.vipRank,
        returnPercent: Number(code.returnPercent.toString()),
        createdAt: code.createdAt.toISOString(),
        expiresAt: code.expiresAt?.toISOString() ?? null,
        tradeWindow: code.tradeWindowMinutes,
        status: code.status,
        maxUsage: code.maxUsage,
        currentUsage: code.usedCount,
        createdBy: code.createdBy,
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Trade code could not be created" }, { status: 400 });
  }
}
