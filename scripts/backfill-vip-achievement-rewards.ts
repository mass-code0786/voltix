import { existsSync, readFileSync } from "fs";
import { Prisma } from "@prisma/client";

loadEnvLocal();
async function main() {
  const execute = process.argv.includes("--execute");
  if (execute && process.argv.includes("--dry-run")) throw new Error("Choose either --dry-run or --execute");
  const [{ prisma }, rewards] = await Promise.all([import("../lib/prisma"), import("../lib/domain/vip-achievement-reward-service")]);
  try {
    const users = await prisma.user.findMany({ select: { id: true, vipRank: true, spotBalance: true, vipAchievementRewards: { where: { status: "CREDITED" }, select: { vipRank: true } } }, orderBy: { id: "asc" } });
    for (const user of users) {
      const level = Number(user.vipRank.match(/\d{1,2}/)?.[0] ?? 0);
      const paid = new Set(user.vipAchievementRewards.map(row => row.vipRank));
      const missing = Array.from({ length: level }, (_, index) => index + 1).filter(rank => !paid.has(rank));
      const total = missing.reduce((sum, rank) => sum.add(rewards.vipAchievementRewardForRank(rank)), new Prisma.Decimal(0));
      console.log(JSON.stringify({ userId: user.id, currentVipRank: `VIP ${level}`, missingRewardRanks: missing.map(rank => `VIP ${rank}`), proposedRewardAmount: total.toFixed(2), currentSpotWalletBalance: user.spotBalance.toFixed(2), expectedSpotWalletBalance: user.spotBalance.add(total).toFixed(2), mode: execute ? "EXECUTE" : "DRY_RUN" }));
      if (execute && missing.length) await prisma.$transaction(tx => rewards.creditVipAchievementRewards(tx, { userId: user.id, previousLevel: 0, newLevel: level, achievedAt: new Date() }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
  } finally { await prisma.$disconnect(); }
}
function loadEnvLocal() { if (!existsSync(".env.local")) return; for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const value = line.trim(); if (!value || value.startsWith("#")) continue; const at = value.indexOf("="); if (at > 0 && !process.env[value.slice(0, at).trim()]) process.env[value.slice(0, at).trim()] = value.slice(at + 1).trim().replace(/^['"]|['"]$/g, ""); } }
main().catch(error => { console.error(error); process.exitCode = 1; });
