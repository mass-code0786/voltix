import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getAdminAuditLogs } from "@/lib/domain/admin-service";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const url = new URL(request.url);
  const result = await getAdminAuditLogs({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    action: url.searchParams.get("action"),
    module: url.searchParams.get("module"),
    status: url.searchParams.get("status"),
    user: url.searchParams.get("user"),
    admin: url.searchParams.get("admin"),
    country: url.searchParams.get("country"),
    ip: url.searchParams.get("ip"),
    search: url.searchParams.get("search"),
  });
  if (url.searchParams.get("export") === "csv") {
    return new NextResponse(toCsv(result.logs), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="voltix-audit-report.csv"`,
      },
    });
  }
  return NextResponse.json(result);
}

function toCsv(logs: Awaited<ReturnType<typeof getAdminAuditLogs>>["logs"]) {
  const headers = ["Audit ID","Timestamp","Role","User","Admin","Action","Module","Status","IP","Country","Description"];
  const rows = logs.map(log => [log.id, log.createdAt, log.role, log.userLabel, log.adminLabel, log.action, log.module, log.status, log.ipAddress ?? "", log.country ?? "", log.description]);
  return [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}
