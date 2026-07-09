import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createSupportTicket, getUserSupportTickets } from "@/lib/domain/kyc-support-service";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const supportStorageDir = path.join(process.cwd(), "storage", "support");
const allowedAttachmentTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

const ticketSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(2000),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await getUserSupportTickets(user.id));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) return createMultipartTicket(request, user.id);
  const parsed = ticketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid support ticket" }, { status: 400 });
  }
  const ticket = await createSupportTicket({ userId: user.id, ...parsed.data });
  return NextResponse.json({ ticket }, { status: 201 });
}

async function createMultipartTicket(request: Request, userId: string) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid support ticket" }, { status: 400 });
  const parsed = ticketSchema.safeParse({
    subject: formString(form, "subject"),
    message: formString(form, "message"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid support ticket" }, { status: 400 });
  }
  try {
    const attachment = await saveSupportAttachment(formFile(form, "attachment"));
    const ticket = await createSupportTicket({ userId, ...parsed.data, ...attachment });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Support ticket failed" }, { status: 400 });
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

async function saveSupportAttachment(file: File | null) {
  if (!file) return {};
  const extension = allowedAttachmentTypes[file.type];
  if (!extension) throw new Error("Only JPG, JPEG, PNG, or PDF attachments are allowed");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Attachment must be 10MB or smaller");
  const bytes = Buffer.from(await file.arrayBuffer());
  await mkdir(supportStorageDir, { recursive: true });
  const fileName = `${randomUUID()}.${extension}`;
  await writeFile(path.join(supportStorageDir, fileName), bytes, { flag: "wx" });
  return {
    attachmentUrl: `/api/support/files/${fileName}`,
    attachmentName: file.name,
    attachmentType: file.type,
    attachmentSize: file.size,
  };
}
