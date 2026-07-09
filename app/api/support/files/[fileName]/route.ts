import path from "path";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const supportStorageDir = path.join(process.cwd(), "storage", "support");
const contentTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

export async function GET(_request: Request, { params }: { params: Promise<{ fileName: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const { fileName } = await params;
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|pdf)$/i.test(fileName)) return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  const attachmentUrl = `/api/support/files/${fileName}`;
  const ticket = await prisma.supportTicket.findFirst({
    where: user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? { attachmentUrl } : { userId: user.id, attachmentUrl },
    select: { attachmentName: true },
  });
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const file = await readFile(path.join(supportStorageDir, fileName)).catch(() => null);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response(file, {
    headers: {
      "Content-Type": contentTypes[extension] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${sanitizeDownloadName(ticket.attachmentName ?? fileName)}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function sanitizeDownloadName(value: string) {
  return value.replace(/["\r\n\\]/g, "_");
}
