import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { getAdminPlans } from "@/lib/domain/admin-service";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  return NextResponse.json(await getAdminPlans());
}
