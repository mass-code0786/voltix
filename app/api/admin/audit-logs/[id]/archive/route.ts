import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimitByAdmin } from "@/lib/security";
import { auditSuccess } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  if (!admin.user || admin.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "SUPER_ADMIN access required" }, { status: 403 });
  }
  const limited = rateLimitByAdmin(admin.user.id);
  if (limited) return limited;
  const { id } = await params;
  const log = await prisma.auditLog.update({
    where: { id },
    data: { archivedAt: new Date(), archivedById: admin.user.id },
  });
  await auditSuccess({
    request,
    adminId: admin.user.id,
    role: "ADMIN",
    action: "AUDIT_LOG_ARCHIVE",
    module: "AUDIT",
    description: "SUPER_ADMIN archived audit log",
    metadata: { auditLogId: id },
  }).catch(() => null);
  return NextResponse.json({ archived: true, log });
}
