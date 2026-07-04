import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserNotifications } from "@/lib/domain/notification-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await getUserNotifications(user.id));
}
