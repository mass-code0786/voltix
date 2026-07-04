import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createSupportTicket, getUserSupportTickets } from "@/lib/domain/kyc-support-service";

const ticketSchema = z.object({
  subject: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  return NextResponse.json(await getUserSupportTickets(user.id));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = ticketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid support ticket" }, { status: 400 });
  }
  const ticket = await createSupportTicket({ userId: user.id, ...parsed.data });
  return NextResponse.json({ ticket }, { status: 201 });
}
