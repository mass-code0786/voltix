import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { markUserNotificationsRead } from "@/lib/domain/notification-service";

const readSchema = z.object({
  ids: z.array(z.string().trim().min(1)).optional(),
}).optional();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = readSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification read request" }, { status: 400 });
  return NextResponse.json(await markUserNotificationsRead(user.id, parsed.data?.ids));
}
