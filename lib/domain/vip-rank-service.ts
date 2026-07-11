import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { creditVipAchievementRewards } from "./vip-achievement-reward-service";

export const VIP_MIN_DEPOSIT = new Prisma.Decimal(100);

export const VIP_RULES = [
  { level: 1, qualifiedDirects: 5, qualifiedTeamSize: 0, achieverLevel: 0, achieverCount: 0, achieverScope: "DIRECT", salary: 20 },
  { level: 2, qualifiedDirects: 5, qualifiedTeamSize: 30, achieverLevel: 1, achieverCount: 2, achieverScope: "DIRECT", salary: 100 },
  { level: 3, qualifiedDirects: 5, qualifiedTeamSize: 100, achieverLevel: 2, achieverCount: 3, achieverScope: "DIRECT", salary: 200 },
  { level: 4, qualifiedDirects: 5, qualifiedTeamSize: 500, achieverLevel: 3, achieverCount: 3, achieverScope: "DIRECT", salary: 400 },
  { level: 5, qualifiedDirects: 5, qualifiedTeamSize: 1000, achieverLevel: 4, achieverCount: 3, achieverScope: "DIRECT", salary: 800 },
  { level: 6, qualifiedDirects: 5, qualifiedTeamSize: 2000, achieverLevel: 5, achieverCount: 3, achieverScope: "TEAM", salary: 1200 },
  { level: 7, qualifiedDirects: 5, qualifiedTeamSize: 5000, achieverLevel: 6, achieverCount: 3, achieverScope: "TEAM", salary: 1600 },
  { level: 8, qualifiedDirects: 5, qualifiedTeamSize: 10000, achieverLevel: 7, achieverCount: 3, achieverScope: "TEAM", salary: 2000 },
  { level: 9, qualifiedDirects: 5, qualifiedTeamSize: 15000, achieverLevel: 8, achieverCount: 3, achieverScope: "TEAM", salary: 3000 },
  { level: 10, qualifiedDirects: 5, qualifiedTeamSize: 20000, achieverLevel: 9, achieverCount: 3, achieverScope: "TEAM", salary: 5000 },
] as const;

type VipRankClient = Pick<PrismaClient, "user" | "deposit"> | Prisma.TransactionClient;
type SnapshotUser = { id: string; referredById: string | null; vipRank: string };
type VipSnapshot = { users: SnapshotUser[]; qualifiedUserIds: Set<string> };

export type VipEvaluation = {
  userId: string;
  vipRank: string;
  vipLabel: string;
  vipSalary: number;
  qualifiedDirects: number;
  qualifiedTeamSize: number;
  nextRank: string | null;
  nextRankProgress: number;
  missingConditions: string[];
  matchedRankAchieverCondition: string;
  calculatedRank: string;
  previousRank: string;
  updated: boolean;
};

export async function calculateHighestVipRank(userId: string, client: VipRankClient = prisma): Promise<VipEvaluation | null> {
  if (client === prisma) return prisma.$transaction(tx => calculateHighestVipRank(userId, tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const snapshot = await loadVipSnapshot(client);
  return calculateFromSnapshot(userId, snapshot, client);
}

export async function recalculateAllVipRanks(client: VipRankClient = prisma, execute = false) {
  const snapshot = await loadVipSnapshot(client);
  const byId = new Map(snapshot.users.map(user => [user.id, user]));
  const depth = (user: SnapshotUser) => {
    let value = 0;
    let cursor = user.referredById;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) { visited.add(cursor); value += 1; cursor = byId.get(cursor)?.referredById ?? null; }
    return value;
  };
  const ordered = [...snapshot.users].sort((a, b) => depth(b) - depth(a));
  const results: VipEvaluation[] = [];
  for (const user of ordered) {
    const result = await calculateFromSnapshot(user.id, snapshot, client, execute, false);
    if (result) results.push(result);
  }
  return results;
}

export async function recalculateVipRanksForUserAndUplines(userId: string, client: VipRankClient = prisma): Promise<VipEvaluation[]> {
  if (client === prisma) return prisma.$transaction(tx => recalculateVipRanksForUserAndUplines(userId, tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const snapshot = await loadVipSnapshot(client);
  const byId = new Map(snapshot.users.map(user => [user.id, user]));
  const chain: string[] = [];
  const visited = new Set<string>();
  let cursor: string | null = userId;
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    chain.push(cursor);
    cursor = byId.get(cursor)?.referredById ?? null;
  }
  const results: VipEvaluation[] = [];
  for (const id of chain) {
    const result = await calculateFromSnapshot(id, snapshot, client);
    if (!result) continue;
    results.push(result);
    const snapshotUser = byId.get(id);
    if (snapshotUser) snapshotUser.vipRank = result.vipRank;
  }
  return results;
}

export async function refreshUserVipRank(userId: string, client: VipRankClient = prisma) {
  return calculateHighestVipRank(userId, client);
}

export function vipSalaryForRank(rank: string | null | undefined) {
  const level = vipLevel(rank);
  return VIP_RULES.find(rule => rule.level === level)?.salary ?? 0;
}

export function normalizeVipLabel(rank: string | null | undefined) {
  return `VIP ${vipLevel(rank)}`;
}

export function creditedDepositWhere(): Prisma.DepositWhereInput {
  return { OR: [{ status: "CREDITED" }, { status: "APPROVED", creditedAt: { not: null } }] };
}

export function evaluateVipMetrics(input: {
  previousRank?: string | null;
  qualifiedDirects: number;
  qualifiedTeamSize: number;
  directRankLevels: number[];
  teamRankLevels: number[];
}) {
  let calculatedLevel = 0;
  let matchedRankAchieverCondition = "No VIP achiever condition required";
  for (const rule of [...VIP_RULES].reverse()) {
    const achievers = rule.achieverScope === "DIRECT" ? input.directRankLevels : input.teamRankLevels;
    const achieverMatches = rule.achieverCount === 0 || achievers.filter(level => level >= rule.achieverLevel).length >= rule.achieverCount;
    if (input.qualifiedDirects >= rule.qualifiedDirects && input.qualifiedTeamSize >= rule.qualifiedTeamSize && achieverMatches) {
      calculatedLevel = rule.level;
      matchedRankAchieverCondition = rule.achieverCount
        ? `${rule.achieverCount} ${rule.achieverScope === "DIRECT" ? "direct" : "team"} VIP ${rule.achieverLevel}+ achievers matched`
        : "No VIP achiever condition required";
      break;
    }
  }
  const previousLevel = vipLevel(input.previousRank);
  const effectiveLevel = Math.max(previousLevel, calculatedLevel);
  const nextRule = VIP_RULES.find(rule => rule.level === effectiveLevel + 1) ?? null;
  const missingConditions = nextRule ? missingForRule(nextRule, input) : [];
  const progressParts = nextRule ? progressForRule(nextRule, input) : [1];
  return {
    level: effectiveLevel,
    calculatedLevel,
    nextRank: nextRule ? `VIP ${nextRule.level}` : null,
    nextRankProgress: Math.round(Math.min(...progressParts) * 100),
    missingConditions,
    matchedRankAchieverCondition,
  };
}

async function loadVipSnapshot(client: VipRankClient): Promise<VipSnapshot> {
  const [users, deposits] = await Promise.all([
    client.user.findMany({ select: { id: true, referredById: true, vipRank: true } }),
    client.deposit.groupBy({ by: ["userId"], where: creditedDepositWhere(), _sum: { amount: true } }),
  ]);
  return {
    users,
    qualifiedUserIds: new Set(deposits.filter(row => (row._sum.amount ?? new Prisma.Decimal(0)).gte(VIP_MIN_DEPOSIT)).map(row => row.userId)),
  };
}

async function calculateFromSnapshot(userId: string, snapshot: VipSnapshot, client: VipRankClient, persist = true, rewardEnabled = true): Promise<VipEvaluation | null> {
  const user = snapshot.users.find(item => item.id === userId);
  if (!user) return null;
  const children = new Map<string, SnapshotUser[]>();
  for (const member of snapshot.users) {
    if (!member.referredById) continue;
    const rows = children.get(member.referredById) ?? [];
    rows.push(member);
    children.set(member.referredById, rows);
  }
  const directs = children.get(userId) ?? [];
  const team: SnapshotUser[] = [];
  const queue = [...directs];
  const visited = new Set<string>();
  while (queue.length) {
    const member = queue.shift()!;
    if (visited.has(member.id) || member.id === userId) continue;
    visited.add(member.id);
    team.push(member);
    queue.push(...(children.get(member.id) ?? []));
  }
  const qualifiedDirects = directs.filter(member => snapshot.qualifiedUserIds.has(member.id)).length;
  const qualifiedTeamSize = team.filter(member => snapshot.qualifiedUserIds.has(member.id)).length;
  const evaluated = evaluateVipMetrics({
    previousRank: user.vipRank,
    qualifiedDirects,
    qualifiedTeamSize,
    directRankLevels: directs.map(member => vipLevel(member.vipRank)),
    teamRankLevels: team.map(member => vipLevel(member.vipRank)),
  });
  const vipRank = `VIP ${evaluated.level}`;
  const previousRank = normalizeVipLabel(user.vipRank);
  const updated = vipRank !== previousRank;
  if (persist && (updated || user.vipRank !== previousRank)) {
    const now = new Date();
    await client.user.update({
      where: { id: userId },
      data: { vipRank, vipUpdatedAt: now, ...(updated && evaluated.level > vipLevel(user.vipRank) ? { vipAchievedAt: now } : {}) },
    });
    if (updated && evaluated.level > vipLevel(user.vipRank) && rewardEnabled) {
      await creditVipAchievementRewards(client as Prisma.TransactionClient, { userId, previousLevel: vipLevel(user.vipRank), newLevel: evaluated.level, achievedAt: now });
    }
  }
  user.vipRank = vipRank;
  return {
    userId,
    vipRank,
    vipLabel: vipRank,
    vipSalary: vipSalaryForRank(vipRank),
    qualifiedDirects,
    qualifiedTeamSize,
    nextRank: evaluated.nextRank,
    nextRankProgress: evaluated.nextRankProgress,
    missingConditions: evaluated.missingConditions,
    matchedRankAchieverCondition: evaluated.matchedRankAchieverCondition,
    calculatedRank: `VIP ${evaluated.calculatedLevel}`,
    previousRank,
    updated,
  };
}

function missingForRule(rule: typeof VIP_RULES[number], input: { qualifiedDirects: number; qualifiedTeamSize: number; directRankLevels: number[]; teamRankLevels: number[] }) {
  const missing: string[] = [];
  if (input.qualifiedDirects < rule.qualifiedDirects) missing.push(`${rule.qualifiedDirects - input.qualifiedDirects} more qualified direct users`);
  if (input.qualifiedTeamSize < rule.qualifiedTeamSize) missing.push(`${rule.qualifiedTeamSize - input.qualifiedTeamSize} more qualified team members`);
  if (rule.achieverCount) {
    const levels = rule.achieverScope === "DIRECT" ? input.directRankLevels : input.teamRankLevels;
    const count = levels.filter(level => level >= rule.achieverLevel).length;
    if (count < rule.achieverCount) missing.push(`${rule.achieverCount - count} more ${rule.achieverScope === "DIRECT" ? "direct" : "team"} VIP ${rule.achieverLevel}+ achievers`);
  }
  return missing;
}

function progressForRule(rule: typeof VIP_RULES[number], input: { qualifiedDirects: number; qualifiedTeamSize: number; directRankLevels: number[]; teamRankLevels: number[] }) {
  const values = [ratio(input.qualifiedDirects, rule.qualifiedDirects)];
  if (rule.qualifiedTeamSize) values.push(ratio(input.qualifiedTeamSize, rule.qualifiedTeamSize));
  if (rule.achieverCount) {
    const levels = rule.achieverScope === "DIRECT" ? input.directRankLevels : input.teamRankLevels;
    values.push(ratio(levels.filter(level => level >= rule.achieverLevel).length, rule.achieverCount));
  }
  return values;
}

function ratio(value: number, required: number) { return required ? Math.min(1, value / required) : 1; }
function vipLevel(rank: string | null | undefined) {
  const level = Number((rank ?? "").match(/\d{1,2}/)?.[0] ?? 0);
  return Number.isInteger(level) && level >= 0 && level <= 10 ? level : 0;
}

export function displayVipRank(input: { vipRank?: string | null }, _hasCreditedDeposit = false) { return normalizeVipLabel(input.vipRank); }
