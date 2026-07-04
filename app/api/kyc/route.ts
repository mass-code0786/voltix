import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getUserKyc, submitUserKyc } from "@/lib/domain/kyc-support-service";

const kycSchema = z.object({
  name: z.string().trim().min(1),
  documentType: z.string().trim().min(1),
  documentNumber: z.string().trim().min(1),
  documentImagePath: z.string().trim().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await getUserKyc(user.id));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = kycSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid KYC request" }, { status: 400 });
  }
  const kyc = await submitUserKyc({ userId: user.id, ...parsed.data });
  return NextResponse.json({ kyc, status: kyc.status }, { status: 201 });
}
