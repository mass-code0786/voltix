import path from "path";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const kycStorageDir = path.join(process.cwd(), "storage", "kyc");
const contentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ fileName: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { fileName } = await params;
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(fileName)) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }
  const imagePath = `/api/kyc/files/${fileName}`;
  const canView = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || await prisma.kycRequest.findFirst({
    where: {
      userId: user.id,
      OR: [
        { frontIdImageUrl: imagePath },
        { backIdImageUrl: imagePath },
        { selfieImageUrl: imagePath },
      ],
    },
    select: { id: true },
  });
  if (!canView) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const file = await readFile(path.join(kycStorageDir, fileName)).catch(() => null);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(file, {
    headers: {
      "Content-Type": contentTypes[extension] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
