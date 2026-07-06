import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(options: RateLimitOptions) {
  const now = Date.now();
  const current = buckets.get(options.key);
  if (!current || current.resetAt <= now) {
    buckets.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }
  if (current.count >= options.limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  current.count += 1;
  return null;
}

export function rateLimitByIp(request: Request, scope: string, limit: number, windowMs: number) {
  return rateLimit({ key: `${scope}:ip:${clientIp(request)}`, limit, windowMs });
}

export function rateLimitByUser(userId: string, scope: string, limit: number, windowMs: number) {
  return rateLimit({ key: `${scope}:user:${userId}`, limit, windowMs });
}

export function rateLimitByAdmin(adminUserId: string) {
  return rateLimit({ key: `admin-action:${adminUserId}`, limit: 60, windowMs: 60 * 1000 });
}

export function rateLimitLogin(request: Request, email: string) {
  return rateLimit({
    key: `auth-login:${clientIp(request)}:${email.toLowerCase()}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
}

export async function auditAdminAction(input: {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const { auditSuccess } = await import("@/lib/audit");
  await auditSuccess({
    adminId: input.adminUserId,
    role: "ADMIN",
    action: input.action,
    module: input.entityType,
    description: `${input.action} ${input.entityType}`,
    metadata: { ...(typeof input.metadata === "object" && input.metadata && !Array.isArray(input.metadata) ? input.metadata : { value: input.metadata }), entityId: input.entityId },
  });
}
