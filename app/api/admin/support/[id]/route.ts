import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/auth";
import { updateSupportTicket } from "@/lib/domain/kyc-support-service";

const updateSchema = z.object({
  status: z.enum(["OPEN", "PENDING", "CLOSED"]).optional(),
  adminReply: z.string().trim().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid support update" }, { status: 400 });
  }
  const { id } = await params;
  try {
    const ticket = await updateSupportTicket({ id, adminUserId: admin.user.id, ...parsed.data });
    return NextResponse.json({ ticket });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Support ticket update failed" }, { status: 400 });
  }
}
