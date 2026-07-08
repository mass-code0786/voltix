import type { Prisma, PrismaClient } from "@prisma/client";
import { buildReferralLink } from "@/lib/app-url";
import { aiWalletBusinessAmount, isAiWalletActive } from "@/lib/domain/user-activation";

type TeamSnapshotClient = Pick<PrismaClient, "user"> | Prisma.TransactionClient;
type TopUpTeamClient = Pick<PrismaClient, "user" | "deposit"> | Prisma.TransactionClient;

type ReferralUser = {
  id: string;
  email?: string;
  uid: string;
  name: string;
  vipRank: string;
  bitexPrincipal: Prisma.Decimal;
  referredById: string | null;
  joinedAt: Date;
};

type TeamTreeMode = "all" | "top-up";

export async function getTeamSnapshot(client: TeamSnapshotClient, userId: string, origin?: string) {
  const sponsor = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, uid: true },
  });

  const users = await client.user.findMany({
    select: {
      id: true,
      uid: true,
      name: true,
      vipRank: true,
      bitexPrincipal: true,
      referredById: true,
      joinedAt: true,
    },
  });

  const referralsBySponsor = new Map<string, ReferralUser[]>();
  for (const user of users) {
    if (!user.referredById) continue;
    const referrals = referralsBySponsor.get(user.referredById) ?? [];
    referrals.push(user);
    referralsBySponsor.set(user.referredById, referrals);
  }

  const network: Array<ReferralUser & { level: number }> = [];
  const queue = (referralsBySponsor.get(sponsor.id) ?? []).map(user => ({ ...user, level: 1 }));
  const visited = new Set<string>();
  while (queue.length) {
    const member = queue.shift()!;
    if (visited.has(member.id)) continue;
    visited.add(member.id);
    network.push(member);
    for (const child of referralsBySponsor.get(member.id) ?? []) {
      queue.push({ ...child, level: member.level + 1 });
    }
  }

  const businessByUser = new Map(network.map(member => [member.id, decimalToNumber(aiWalletBusinessAmount(member))]));
  const teamVolume = Array.from(businessByUser.values()).reduce((total, amount) => total + amount, 0);
  const directTeamCount = referralsBySponsor.get(sponsor.id)?.length ?? 0;
  const activeUsersCount = network.filter(isAiWalletActive).length;

  return {
    referralUid: sponsor.uid,
    referralLink: buildReferralLink(sponsor.uid, origin),
    stats: {
      directTeamCount,
      totalNetworkCount: network.length,
      activeUsersCount,
      teamVolume,
    },
    members: network
      .sort((a, b) => a.level - b.level || b.joinedAt.getTime() - a.joinedAt.getTime())
      .map(member => ({
        id: member.id,
        uid: member.uid,
        name: member.name,
        initials: initials(member.name),
        level: member.level,
        businessAmount: businessByUser.get(member.id) ?? 0,
        status: isAiWalletActive(member) ? "Active" : "Inactive",
        joinedAt: member.joinedAt.toISOString(),
      })),
  };
}

export async function getTopUpTeamMembers(client: TopUpTeamClient, userId: string) {
  const network = await getReferralNetwork(client, userId);
  if (!network.length) return { members: [] };

  const deposits = await client.deposit.groupBy({
    by: ["userId"],
    where: { userId: { in: network.map(member => member.id) }, status: "CREDITED" },
    _sum: { amount: true },
  });
  const depositedByUser = new Map(deposits.map(row => [row.userId, decimalToNumber(row._sum.amount ?? 0)]));

  return {
    members: network
      .filter(member => (depositedByUser.get(member.id) ?? 0) > 0)
      .sort((a, b) => a.level - b.level || b.joinedAt.getTime() - a.joinedAt.getTime())
      .map(member => {
        const aiWalletActiveAmount = decimalToNumber(aiWalletBusinessAmount(member));
        return {
          id: member.id,
          name: member.name,
          uid: member.uid,
          level: member.level,
          depositedAmount: depositedByUser.get(member.id) ?? 0,
          aiWalletActiveAmount,
          vipRank: member.vipRank,
          status: isAiWalletActive(member) ? "Active" : "Inactive",
          joinedAt: member.joinedAt.toISOString(),
        };
      }),
  };
}

export async function getTeamTreeMembers(
  client: TopUpTeamClient,
  currentUser: { id: string; role?: string | null },
  parentUserId?: string | null,
  mode: TeamTreeMode = "all",
) {
  const isAdmin = currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN";
  const parentId = parentUserId?.trim() || currentUser.id;
  const parentLevel = parentId === currentUser.id ? 0 : await getDownlineLevel(client, currentUser.id, parentId, isAdmin);
  if (parentLevel === null) return { members: [] };

  const directMembers = await client.user.findMany({
    where: { referredById: parentId },
    select: {
      id: true,
      email: true,
      uid: true,
      name: true,
      vipRank: true,
      bitexPrincipal: true,
      referredById: true,
      joinedAt: true,
    },
    orderBy: { joinedAt: "desc" },
  });
  if (!directMembers.length) return { members: [] };

  const memberIds = directMembers.map(member => member.id);
  const deposits = await client.deposit.groupBy({
    by: ["userId"],
    where: { userId: { in: memberIds }, status: "CREDITED" },
    _sum: { amount: true },
  });
  const depositedByUser = new Map(deposits.map(row => [row.userId, decimalToNumber(row._sum.amount ?? 0)]));
  const visibleMembers = mode === "top-up"
    ? directMembers.filter(member => (depositedByUser.get(member.id) ?? 0) > 0)
    : directMembers;
  if (!visibleMembers.length) return { members: [] };

  const visibleIds = visibleMembers.map(member => member.id);
  const directChildren = await client.user.findMany({
    where: { referredById: { in: visibleIds } },
    select: { id: true, referredById: true },
  });
  const visibleChildIds = mode === "top-up" ? await creditedUserIds(client, directChildren.map(child => child.id)) : null;
  const childCountByParent = new Map<string, number>();
  for (const child of directChildren) {
    if (!child.referredById) continue;
    if (visibleChildIds && !visibleChildIds.has(child.id)) continue;
    childCountByParent.set(child.referredById, (childCountByParent.get(child.referredById) ?? 0) + 1);
  }

  return {
    members: visibleMembers.map(member => ({
      id: member.id,
      name: member.name,
      email: member.email,
      uid: member.uid,
      level: parentLevel + 1,
      vipRank: member.vipRank,
      depositedAmount: depositedByUser.get(member.id) ?? 0,
      aiWalletActiveAmount: decimalToNumber(aiWalletBusinessAmount(member)),
      status: isAiWalletActive(member) ? "Active" : "Inactive",
      joinedAt: member.joinedAt.toISOString(),
      hasChildren: (childCountByParent.get(member.id) ?? 0) > 0,
    })),
  };
}

async function creditedUserIds(client: TopUpTeamClient, userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const deposits = await client.deposit.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, status: "CREDITED" },
  });
  return new Set(deposits.map(row => row.userId));
}

async function getDownlineLevel(client: TopUpTeamClient, rootUserId: string, targetUserId: string, isAdmin: boolean): Promise<number | null> {
  if (isAdmin) return 0;
  let level = 0;
  let cursor: string | null = targetUserId;
  const visited = new Set<string>();
  while (cursor) {
    if (visited.has(cursor)) return null;
    visited.add(cursor);
    if (cursor === rootUserId) return level;
    const user: { referredById: string | null } | null = await client.user.findUnique({ where: { id: cursor }, select: { referredById: true } });
    if (!user) return null;
    cursor = user.referredById;
    level += 1;
  }
  return null;
}

async function getReferralNetwork(client: TopUpTeamClient, userId: string) {
  const sponsor = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true },
  });

  const users = await client.user.findMany({
    select: {
      id: true,
      uid: true,
      name: true,
      vipRank: true,
      bitexPrincipal: true,
      referredById: true,
      joinedAt: true,
    },
  });

  const referralsBySponsor = new Map<string, ReferralUser[]>();
  for (const user of users) {
    if (!user.referredById) continue;
    const referrals = referralsBySponsor.get(user.referredById) ?? [];
    referrals.push(user);
    referralsBySponsor.set(user.referredById, referrals);
  }

  const network: Array<ReferralUser & { level: number }> = [];
  const queue = (referralsBySponsor.get(sponsor.id) ?? []).map(user => ({ ...user, level: 1 }));
  const visited = new Set<string>();
  while (queue.length) {
    const member = queue.shift()!;
    if (visited.has(member.id)) continue;
    visited.add(member.id);
    network.push(member);
    for (const child of referralsBySponsor.get(member.id) ?? []) {
      queue.push({ ...child, level: member.level + 1 });
    }
  }
  return network;
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return Number(value.toString());
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map(part => part[0]).join("").toUpperCase() : "U";
}
