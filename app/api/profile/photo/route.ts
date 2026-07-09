import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditSuccess } from "@/lib/audit";

const maxPhotoBytes = 5 * 1024 * 1024;
const allowedPhotoTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Profile photo is required" }, { status: 400 });

  const extension = allowedPhotoTypes.get(file.type);
  if (!extension) return NextResponse.json({ error: "Only PNG, JPG, JPEG, or WEBP images are allowed" }, { status: 400 });
  if (file.size > maxPhotoBytes) return NextResponse.json({ error: "Profile photo must be 5MB or smaller" }, { status: 400 });

  const directory = path.join(process.cwd(), "public", "profile-photos");
  await mkdir(directory, { recursive: true });
  const fileName = `${user.id}-${Date.now()}.${extension}`;
  const profileImageUrl = `/profile-photos/${fileName}`;
  await writeFile(path.join(directory, fileName), Buffer.from(await file.arrayBuffer()), { flag: "wx" });

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
