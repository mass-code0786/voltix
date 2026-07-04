import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getAdminFeeLedger, getAdminLedger } from "@/lib/domain/admin-service";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  const type = new URL(request.url).searchParams.get("type");
  return NextResponse.json(type === "fees" ? await getAdminFeeLedger() : await getAdminLedger());
}
