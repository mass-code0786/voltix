import { existsSync, readFileSync } from "fs";

loadEnvLocal();

async function main() {
  const execute = process.argv.includes("--execute");
  const dryRun = process.argv.includes("--dry-run") || !execute;
  if (process.argv.includes("--execute") && process.argv.includes("--dry-run")) throw new Error("Choose either --dry-run or --execute");
  const [{ prisma }, { recalculateAllVipRanks }] = await Promise.all([import("../lib/prisma"), import("../lib/domain/vip-rank-service")]);
  try {
    const results = await recalculateAllVipRanks(prisma, execute);
    for (const row of results) {
      console.log(JSON.stringify({
        userId: row.userId,
        previousRank: row.previousRank,
        calculatedRank: row.calculatedRank,
        effectiveRank: row.vipRank,
        qualifiedDirects: row.qualifiedDirects,
        qualifiedTeamSize: row.qualifiedTeamSize,
        matchedRankAchieverCondition: row.matchedRankAchieverCondition,
        status: row.updated ? execute ? "UPDATED" : "WOULD_UPDATE" : "UNCHANGED",
      }));
    }
    console.log(`VIP backfill ${dryRun ? "dry-run" : "execute"} complete. Scanned: ${results.length}. Changed: ${results.filter(row => row.updated).length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

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

main().catch(error => { console.error(error); process.exitCode = 1; });
