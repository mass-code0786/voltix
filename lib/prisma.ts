import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const datasourceUrl = databaseUrlWithPoolLimits();
export const prisma = globalForPrisma.prisma ?? new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function databaseUrlWithPoolLimits() {
  const configured = process.env.DATABASE_URL;
  if (!configured) return undefined;
  const url = new URL(configured);
  const connectionLimit = boundedInteger(process.env.DATABASE_CONNECTION_LIMIT, 1, 100);
  const poolTimeout = boundedInteger(process.env.DATABASE_POOL_TIMEOUT_SECONDS, 1, 60);
  const connectTimeout = boundedInteger(process.env.DATABASE_CONNECT_TIMEOUT_SECONDS, 1, 60);
  if (connectionLimit) url.searchParams.set("connection_limit", String(connectionLimit));
  if (poolTimeout) url.searchParams.set("pool_timeout", String(poolTimeout));
  if (connectTimeout) url.searchParams.set("connect_timeout", String(connectTimeout));
  return url.toString();
}

function boundedInteger(value: string | undefined, min: number, max: number) {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
