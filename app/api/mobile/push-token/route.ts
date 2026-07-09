import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const pushTokenSchema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(["android", "ios", "web"]).default("android"),
  appVersion: z.string().trim().max(40).optional(),
  deviceId: z.string().trim().max(160).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = pushTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid push token" }, { status: 400 });

  const device = await prisma.pushDevice.upsert({
    where: { token: parsed.data.token },
    update: {
      userId: user.id,
      platform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
      deviceId: parsed.data.deviceId,
      enabled: true,
      lastSeenAt: new Date(),
    },
    create: {
      userId: user.id,
      token: parsed.data.token,
      platform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
      deviceId: parsed.data.deviceId,
    },
    select: { id: true, platform: true, enabled: true, lastSeenAt: true },
  });

  return NextResponse.json({ registered: true, device });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = z.object({ token: z.string().trim().min(20).max(4096).optional() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.token) {
    await prisma.pushDevice.updateMany({ where: { userId: user.id }, data: { enabled: false, lastSeenAt: new Date() } });
  } else {
    await prisma.pushDevice.updateMany({ where: { userId: user.id, token: parsed.data.token }, data: { enabled: false, lastSeenAt: new Date() } });
  }
  return NextResponse.json({ registered: false });
}
