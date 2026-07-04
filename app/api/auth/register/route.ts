import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createSession, generateUniqueUid, hashPassword } from "@/lib/auth";
import { ensureUserWalletAccounts } from "@/lib/domain/user-wallets";
import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Enter a valid email").transform(value => value.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  country: z.string().trim().min(2, "Country is required"),
  referralCode: z.string().trim().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details" }, { status: 400 });
  }

  const { name, email, password, country, referralCode } = parsed.data;
  const sponsorCode = referralCode?.toUpperCase();
  const sponsor = sponsorCode ? await prisma.user.findUnique({ where: { uid: sponsorCode }, select: { id: true } }) : null;
  if (sponsorCode && !sponsor) return NextResponse.json({ error: "Invalid referral or sponsor code" }, { status: 400 });

  try {
    const user = await prisma.$transaction(async tx => {
      const uid = await generateUniqueUid(tx);
      const created = await tx.user.create({
        data: {
          email,
          uid,
          name,
          country,
          passwordHash: await hashPassword(password),
          referredById: sponsor?.id,
          extraTradeTrialEndsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        },
        select: { id: true, uid: true, name: true, email: true, country: true, vipRank: true },
      });
      await ensureUserWalletAccounts(tx, created.id);
      return created;
    });
    await createSession(user.id);
    return NextResponse.json({ authenticated: true, user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Email is already registered" }, { status: 409 });
    }
    console.error("[auth] registration failed", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
