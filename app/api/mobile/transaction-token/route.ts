import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { issueMobileTransactionToken, type MobileTransactionAction } from "@/lib/mobile-transaction-token";

const schema = z.object({
  action: z.enum(["p2p", "withdrawal"]),
});

export async function POST(request: Request) {
  if (request.headers.get("x-voltix-capacitor") !== "1") {
    return NextResponse.json({ error: "Mobile verification is only available in the Voltix app" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid verification action" }, { status: 400 });

  const token = issueMobileTransactionToken(user.id, parsed.data.action as MobileTransactionAction);
  if (!token) return NextResponse.json({ error: "Mobile transaction verification is not configured" }, { status: 503 });
  return NextResponse.json({ token, expiresInSeconds: 120 });
}
