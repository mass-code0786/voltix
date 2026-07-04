import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getUserKyc, submitUserKyc } from "@/lib/domain/kyc-support-service";

const kycSchema = z.object({
  fullName: z.string().trim().min(1),
  dateOfBirth: z.coerce.date(),
  country: z.string().trim().min(1),
  address: z.string().trim().min(1),
  governmentIdType: z.string().trim().min(1),
  governmentIdNumber: z.string().trim().min(1),
  frontIdImageUrl: z.string().trim().min(1),
  backIdImageUrl: z.string().trim().min(1),
  selfieImageUrl: z.string().trim().min(1),
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
  try {
    const kyc = await submitUserKyc({ userId: user.id, ...parsed.data });
    return NextResponse.json({ kyc, status: kyc.status }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "KYC submission failed" }, { status: 400 });
  }
}
