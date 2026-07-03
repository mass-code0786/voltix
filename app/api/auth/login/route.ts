import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").transform(value => value.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid login details" }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, uid: true, name: true, email: true, country: true, vipRank: true, passwordHash: true, status: true },
    });
  } catch (error) {
    console.error("[auth] login failed", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(parsed.data.password, user.passwordHash))) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  await createSession(user.id);
  const { passwordHash: _passwordHash, status: _status, ...safeUser } = user;
  return NextResponse.json({ authenticated: true, user: safeUser });
}
