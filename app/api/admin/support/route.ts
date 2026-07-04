import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getAdminSupportRows } from "@/lib/domain/kyc-support-service";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  return NextResponse.json(await getAdminSupportRows());
}
