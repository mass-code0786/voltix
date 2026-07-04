import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth";
import { emptyRows } from "@/lib/domain/admin-service";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (admin.response) return admin.response;
  return NextResponse.json({ ...emptyRows, pending: 0 });
}
