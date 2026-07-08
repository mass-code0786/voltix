import type { Prisma, PrismaClient } from "@prisma/client";
import { buildReferralLink } from "@/lib/app-url";
import { aiWalletBusinessAmount, isAiWalletActive } from "@/lib/domain/user-activation";

type TeamSnapshotClient = Pick<PrismaClient, "user"> | Prisma.TransactionClient;
type TopUpTeamClient = Pick<PrismaClient, "user" | "deposit"> | Prisma.TransactionClient;

type ReferralUser = {
  id: string;
  uid: string;
  name: string;
  vipRank: string;
  bitexPrincipal: Prisma.Decimal;
  referredById: string | null;
  joinedAt: Date;
};

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
