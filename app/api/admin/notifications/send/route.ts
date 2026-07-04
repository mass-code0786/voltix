import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/auth";
import { broadcastNotification } from "@/lib/domain/notification-service";

const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const parsed = broadcastSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid notification" }, { status: 400 });
  }
  const result = await broadcastNotification({
    type: "ADMIN_BROADCAST",
    title: parsed.data.title,
    message: parsed.data.message,
    metadata: { adminUserId: admin.user?.id ?? null },
  });
  return NextResponse.json(result, { status: 201 });
}
