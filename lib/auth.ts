import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const scrypt = promisify(scryptCallback);
const sessionCookieName = "voltix_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, expectedHex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashSessionToken(token), expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  cookieStore.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser(client = prisma) {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;
  const session = await client.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: { id: true, uid: true, name: true, email: true, country: true, language: true, vipRank: true, role: true, status: true } } },
  });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    if (session) await client.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  const { status: _status, ...user } = session.user;
  return user;
}

export async function getCurrentAdmin(client = prisma) {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return { user: null, response: Response.json({ error: "Login required" }, { status: 401 }) };
  const session = await client.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: { id: true, uid: true, name: true, email: true, role: true, status: true } } },
  });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    if (session) await client.session.deleteMany({ where: { id: session.id } });
    return { user: null, response: Response.json({ error: "Login required" }, { status: 401 }) };
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return { user: null, response: Response.json({ error: "Admin access required" }, { status: 403 }) };
  }
  const { status: _status, ...user } = session.user;
  return { user, response: null };
}

export async function generateUniqueUid(client: Pick<typeof prisma, "user"> = prisma) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const uid = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await client.user.findUnique({ where: { uid }, select: { id: true } });
    if (!existing) return uid;
  }
  throw new Error("Could not generate a unique UID");
}
