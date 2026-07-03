import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await prisma.user.findUnique({
      where: { uid: "762897" },
      select: { uid: true, name: true, country: true },
    });
    return NextResponse.json(user ?? { uid: "762897", name: "Arjun Kumar", country: "United States" });
  } catch {
    return NextResponse.json({ uid: "762897", name: "Arjun Kumar", country: "United States" });
  }
}
