import { AuditRole, AuditStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/security";

type AuditActor = {
  userId?: string | null;
  adminId?: string | null;
  role?: AuditRole;
};

type AuditInput = AuditActor & {
  request?: Request;
  action: string;
  module: string;
  description: string;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: unknown;
  errorMessage?: string | null;
  durationMs?: number;
  country?: string | null;
  city?: string | null;
};

const sensitiveKeyPattern = /(password|secret|token|private.?key|jwt|session|cookie|authorization|api.?key|ipn.?secret)/i;

export async function auditSuccess(input: AuditInput) {
  return writeAudit({ ...input, status: AuditStatus.SUCCESS });
}

export async function auditFailure(input: AuditInput) {
  return writeAudit({ ...input, status: AuditStatus.FAILED });
}

export async function auditWarning(input: AuditInput) {
  return writeAudit({ ...input, status: AuditStatus.WARNING });
}

async function writeAudit(input: AuditInput & { status: AuditStatus }) {
  const requestContext = input.request ? contextFromRequest(input.request) : {};
  const role = input.role ?? (input.adminId ? AuditRole.ADMIN : input.userId ? AuditRole.USER : AuditRole.SYSTEM);
  const actorId = input.adminId ?? input.userId ?? null;
  const data = {
    userId: input.userId ?? null,
    adminId: input.adminId ?? null,
    role,
    action: input.action,
    module: input.module,
    description: input.description,
    status: input.status,
    country: input.country ?? null,
    city: input.city ?? null,
    oldValue: toJson(input.oldValue),
    newValue: toJson(input.newValue),
    metadata: toJson(input.metadata) ?? {},
    errorMessage: input.errorMessage ?? null,
    durationMs: input.durationMs,
    actorId,
    actorType: role,
    entityType: input.module,
    entityId: actorId ?? input.action,
    ...requestContext,
  };
  return prisma.auditLog.create({ data });
}

function contextFromRequest(request: Request) {
  const url = new URL(request.url);
  const userAgent = request.headers.get("user-agent") ?? null;
  const parsed = parseUserAgent(userAgent);
  return {
    ipAddress: clientIp(request),
    userAgent,
    device: parsed.device,
    browser: parsed.browser,
    os: parsed.os,
    requestMethod: request.method,
    requestPath: url.pathname,
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
  };
}

function parseUserAgent(userAgent: string | null) {
  const value = userAgent ?? "";
  const os = /Windows/i.test(value) ? "Windows" : /Android/i.test(value) ? "Android" : /iPhone|iPad|iOS/i.test(value) ? "iOS" : /Mac OS|Macintosh/i.test(value) ? "macOS" : /Linux/i.test(value) ? "Linux" : "Unknown";
  const browser = /Edg\//i.test(value) ? "Edge" : /Chrome\//i.test(value) ? "Chrome" : /Firefox\//i.test(value) ? "Firefox" : /Safari\//i.test(value) ? "Safari" : "Unknown";
  const device = /Mobile|Android|iPhone/i.test(value) ? "Mobile" : /iPad|Tablet/i.test(value) ? "Tablet" : "Desktop";
  return { os, browser, device };
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return maskSensitive(value) as Prisma.InputJsonValue;
}

function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    sensitiveKeyPattern.test(key) ? "[MASKED]" : maskSensitive(item),
  ]));
}
