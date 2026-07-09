import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditSuccess } from "@/lib/audit";

export const runtime = "nodejs";

const maxPhotoBytes = 2 * 1024 * 1024;
const unsupportedImageMessage = "Unsupported image format. Please upload JPG, PNG, or WEBP.";
const oversizedImageMessage = "Image size is too large. Please upload a smaller photo.";
const processImageMessage = "Could not process this image. Please try another photo.";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: processImageMessage }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: processImageMessage }, { status: 400 });

  if (file.size > maxPhotoBytes) return NextResponse.json({ error: oversizedImageMessage }, { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const imageType = detectImageType(bytes);
  if (imageType === "heic") return NextResponse.json({ error: unsupportedImageMessage }, { status: 415 });
  if (!imageType) return NextResponse.json({ error: unsupportedImageMessage }, { status: 415 });

  const directory = path.join(process.cwd(), "public", "profile-photos");
  await mkdir(directory, { recursive: true });
  const fileName = `${user.id}-${Date.now()}.${imageType.extension}`;
  const profileImageUrl = `/profile-photos/${fileName}`;
  await writeFile(path.join(directory, fileName), bytes, { flag: "wx" });

  const before = await prisma.user.findUnique({ where: { id: user.id }, select: { profileImageUrl: true } });
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { profileImageUrl },
    select: {
      id: true,
      uid: true,
      name: true,
      email: true,
      country: true,
      language: true,
      profileImageUrl: true,
      vipRank: true,
    },
  });

  await auditSuccess({
    request,
    userId: user.id,
    role: "USER",
    action: "PROFILE_PHOTO_UPDATE",
    module: "PROFILE",
    description: "User updated profile photo",
    oldValue: before,
    newValue: { profileImageUrl },
  }).catch(() => null);

  return NextResponse.json({
    profileImageUrl,
    profile: {
      avatar: updated.profileImageUrl,
      profileImageUrl: updated.profileImageUrl,
      fullName: updated.name,
      uid: updated.uid,
      email: updated.email,
      country: updated.country,
      language: updated.language,
      vipRank: updated.vipRank,
    },
  });
}

function detectImageType(bytes: Buffer): { mime: string; extension: "jpg" | "png" | "webp" } | "heic" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", extension: "png" };
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", extension: "webp" };
  const brand = bytes.subarray(4, 12).toString("ascii");
  if (brand.startsWith("ftyp") && /hei[cf]|heix|hevc|mif1|msf1/.test(bytes.subarray(8, 32).toString("ascii"))) return "heic";
  return null;
}
