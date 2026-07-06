import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/auth";
import { broadcastNotification } from "@/lib/domain/notification-service";
import { rateLimitByAdmin } from "@/lib/security";
import { auditSuccess } from "@/lib/audit";

const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
});

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const limited = rateLimitByAdmin(admin.user.id);
  if (limited) return limited;
  const parsed = broadcastSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid notification" }, { status: 400 });
  }
  const result = await broadcastNotification({
    type: "ADMIN_BROADCAST",
    title: parsed.data.title,
    message: parsed.data.message,
    metadata: { adminUserId: admin.user.id },
  });
  await auditSuccess({ request, adminId: admin.user.id, role: "ADMIN", action: "SEND_NOTIFICATION", module: "NOTIFICATIONS", description: "Admin sent broadcast notification", metadata: { title: parsed.data.title, sent: result.sent } }).catch(() => null);
  return NextResponse.json(result, { status: 201 });
}
