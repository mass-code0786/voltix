import { randomUUID } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getUserKyc, submitUserKyc } from "@/lib/domain/kyc-support-service";
import { getKycDocumentTypes, kycDocumentRequiresBackPhoto } from "@/lib/kyc-document-types";
import { auditSuccess } from "@/lib/audit";

const MAX_KYC_FILE_BYTES = 5 * 1024 * 1024;
const kycStorageDir = path.join(process.cwd(), "storage", "kyc");
const allowedImageTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const kycFieldsSchema = z.object({
  country: z.string().trim().min(1),
  governmentIdType: z.string().trim().min(1),
  governmentIdNumber: z.string().trim().min(1),
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

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid KYC upload request" }, { status: 400 });

  const parsed = kycFieldsSchema.safeParse({
    country: formString(form, "country"),
    governmentIdType: formString(form, "governmentIdType"),
    governmentIdNumber: formString(form, "governmentIdNumber"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid KYC request" }, { status: 400 });
  }

  const backRequired = kycDocumentRequiresBackPhoto(parsed.data.governmentIdType);
  const frontFile = formFile(form, "frontIdImage");
  const backFile = formFile(form, "backIdImage");
  const selfieFile = formFile(form, "selfieImage");
  if (!frontFile) return NextResponse.json({ error: "Document Front Photo is required" }, { status: 400 });
  if (backRequired && !backFile) return NextResponse.json({ error: "Document Back Photo is required for this document type" }, { status: 400 });
  if (!selfieFile) return NextResponse.json({ error: "Selfie Holding Document is required" }, { status: 400 });

  try {
    const [frontIdImageUrl, backIdImageUrl, selfieImageUrl] = await Promise.all([
      saveKycImage(frontFile),
      backFile ? saveKycImage(backFile) : Promise.resolve(null),
      saveKycImage(selfieFile),
    ]);
    const kyc = await submitUserKyc({
      userId: user.id,
      fullName: user.name?.trim() || `UID ${user.uid ?? user.id}`,
      dateOfBirth: null,
      country: parsed.data.country,
      address: null,
      governmentIdType: parsed.data.governmentIdType,
      governmentIdNumber: parsed.data.governmentIdNumber,
      frontIdImageUrl,
      backIdImageUrl,
      selfieImageUrl,
    });
    await auditSuccess({
      request,
      userId: user.id,
      role: "USER",
      action: "KYC_SUBMIT",
      module: "KYC",
      description: "User submitted KYC for manual review",
      newValue: { ...parsed.data, status: kyc.status, kycId: kyc.id, frontIdImageUrl, backIdImageUrl, selfieImageUrl },
    }).catch(() => null);
    return NextResponse.json({ kyc, status: kyc.status }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "KYC submission failed" }, { status: 400 });
  }
}

function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function formFile(form: FormData, key: string) {
  const value = form.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

async function saveKycImage(file: File) {
  const extension = allowedImageTypes[file.type];
  if (!extension) throw new Error("Only JPG, JPEG, PNG, or WebP images are allowed");
  if (file.size > MAX_KYC_FILE_BYTES) throw new Error("Each KYC image must be 5MB or smaller");
  const bytes = Buffer.from(await file.arrayBuffer());
  await mkdir(kycStorageDir, { recursive: true });
  const fileName = `${randomUUID()}.${extension}`;
  await writeFile(path.join(kycStorageDir, fileName), bytes, { flag: "wx" });
  return `/api/kyc/files/${fileName}`;
}
