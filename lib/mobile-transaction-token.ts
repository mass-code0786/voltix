import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const tokenTtlMs = 2 * 60 * 1000;

export type MobileTransactionAction = "p2p" | "withdrawal";

export function issueMobileTransactionToken(userId: string, action: MobileTransactionAction) {
  const secret = getSecret();
  if (!secret) return null;
  const payload = JSON.stringify({
    userId,
    action,
    exp: Date.now() + tokenTtlMs,
    nonce: randomBytes(12).toString("base64url"),
  });
  const body = Buffer.from(payload).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyMobileTransactionToken(token: string | undefined, userId: string, action: MobileTransactionAction) {
  const secret = getSecret();
  if (!secret || !token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = sign(body, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { userId?: string; action?: string; exp?: number };
    return payload.userId === userId && payload.action === action && typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function getSecret() {
  return process.env.MOBILE_TRANSACTION_SECRET || "";
}

function sign(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}
