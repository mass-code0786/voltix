import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { markUserNotificationsRead } from "@/lib/domain/notification-service";
import { auditSuccess } from "@/lib/audit";

const readSchema = z.object({
  ids: z.array(z.string().trim().min(1)).optional(),
}).optional();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = readSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification read request" }, { status: 400 });
  const result = await markUserNotificationsRead(user.id, parsed.data?.ids);
  await auditSuccess({ request, userId: user.id, role: "USER", action: "NOTIFICATION_READ", module: "NOTIFICATIONS", description: "User marked notifications as read", metadata: { ids: parsed.data?.ids ?? "all", updated: result.updated } }).catch(() => null);
  return NextResponse.json(result);
}
