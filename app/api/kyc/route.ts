import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getUserKyc, submitUserKyc } from "@/lib/domain/kyc-support-service";
import { getKycDocumentTypes } from "@/lib/kyc-document-types";
import { auditSuccess } from "@/lib/audit";

const kycSchema = z.object({
  fullName: z.string().trim().min(1),
  dateOfBirth: z.coerce.date(),
  country: z.string().trim().min(1),
  address: z.string().trim().min(1),
  governmentIdType: z.string().trim().min(1),
  governmentIdNumber: z.string().trim().min(1),
  frontIdImageUrl: z.string().trim().url("Front ID image URL must be valid"),
  backIdImageUrl: z.string().trim().url("Back ID image URL must be valid"),
  selfieImageUrl: z.string().trim().url("Selfie image URL must be valid"),
}).refine(data => getKycDocumentTypes(data.country).includes(data.governmentIdType), {
  message: "Document type is not supported for selected country",
  path: ["governmentIdType"],
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
    await auditSuccess({ request, userId: user.id, role: "USER", action: "KYC_SUBMIT", module: "KYC", description: "User submitted KYC for manual review", newValue: { ...parsed.data, status: kyc.status, kycId: kyc.id } }).catch(() => null);
    return NextResponse.json({ kyc, status: kyc.status }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "KYC submission failed" }, { status: 400 });
  }
}
