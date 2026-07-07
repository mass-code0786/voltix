import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createSession, generateUniqueUid, hashPassword } from "@/lib/auth";
import { ensureUserWalletAccounts } from "@/lib/domain/user-wallets";
import { prisma } from "@/lib/prisma";
import { normalizeLanguage } from "@/lib/profile-options";
import { rateLimitByIp } from "@/lib/security";
import { auditFailure, auditSuccess } from "@/lib/audit";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Enter a valid email").transform(value => value.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  country: z.string().trim().min(2, "Country is required"),
  language: z.string().trim().optional(),
  referralCode: z.string().trim().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export async function POST(request: Request) {
  const limited = rateLimitByIp(request, "auth-register", 5, 60 * 60 * 1000);
  if (limited) return limited;
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details" }, { status: 400 });
  }

  const { name, email, password, country, referralCode } = parsed.data;
  const language = normalizeLanguage(parsed.data.language);
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
          language,
          passwordHash: await hashPassword(password),
          referredById: sponsor?.id,
          extraTradeTrialEndsAt: new Date(0),
        },
        select: { id: true, uid: true, name: true, email: true, country: true, language: true, vipRank: true },
      });
      await ensureUserWalletAccounts(tx, created.id);
      return created;
    });
    await createSession(user.id);
    await auditSuccess({ request, userId: user.id, role: "USER", action: "REGISTER", module: "AUTH", description: "User registered", newValue: { email: user.email, uid: user.uid, country: user.country }, metadata: { sponsorCode: sponsorCode ?? null } }).catch(() => null);
    return NextResponse.json({ authenticated: true, user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Email is already registered" }, { status: 409 });
    }
    console.error("[auth] registration failed", error);
    await auditFailure({ request, action: "REGISTER", module: "AUTH", description: "Registration failed", metadata: { email }, errorMessage: error instanceof Error ? error.message : "Registration failed" }).catch(() => null);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
