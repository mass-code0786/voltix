import { existsSync, readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const aiActivePrincipalThreshold = 100;

loadEnvLocal();
const prisma = new PrismaClient();

function loadEnvLocal() {
  const path = ".env.local";
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  const depositedUsers = await prisma.deposit.findMany({
    where: {
      OR: [
        { status: "CREDITED" },
        { status: "APPROVED", creditedAt: { not: null } },
      ],
    },
    distinct: ["userId"],
    select: { userId: true },
  });
  const activeAiUsers = await prisma.user.findMany({
    where: { bitexPrincipal: { gte: aiActivePrincipalThreshold } },
    select: { id: true },
  });
  const qualifiedUserIds = Array.from(new Set([...depositedUsers.map(deposit => deposit.userId), ...activeAiUsers.map(user => user.id)]));
  const result = qualifiedUserIds.length
    ? await prisma.user.updateMany({
        where: {
          id: { in: qualifiedUserIds },
          OR: [{ vipRank: "NONE" }, { vipRank: "" }, { vipRank: "VIP0" }],
        },
        data: { vipRank: "VIP 0" },
      })
    : { count: 0 };

  console.log(`VIP rank backfill complete. Scanned qualified users: ${qualifiedUserIds.length}. Updated: ${result.count}.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
