import type { Prisma, PrismaClient } from "@prisma/client";
import { buildReferralLink } from "@/lib/app-url";
import { isAiWalletActive } from "@/lib/domain/user-activation";

type TeamClient = Pick<PrismaClient, "user" | "userPackage"> | Prisma.TransactionClient;

type ReferralUser = {
  id: string;
  uid: string;
  name: string;
  bitexPrincipal: Prisma.Decimal;
  referredById: string | null;
  joinedAt: Date;
};

export async function getTeamSnapshot(client: TeamClient, userId: string, origin?: string) {
  const sponsor = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, uid: true },
  });

  const users = await client.user.findMany({
    select: {
      id: true,
      uid: true,
      name: true,
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

  const networkIds = network.map(member => member.id);
  const packages = networkIds.length
    ? await client.userPackage.groupBy({
        by: ["userId"],
        where: { userId: { in: networkIds }, status: "ACTIVE" },
        _sum: { amountUsd: true },
      })
    : [];
  const packageByUser = new Map(packages.map(row => [row.userId, decimalToNumber(row._sum.amountUsd ?? 0)]));
  const teamVolume = Array.from(packageByUser.values()).reduce((total, amount) => total + amount, 0);
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
        packageAmount: packageByUser.get(member.id) ?? 0,
        status: isAiWalletActive(member) ? "Active" : "Inactive",
        joinedAt: member.joinedAt.toISOString(),
      })),
  };
}

function decimalToNumber(value: Prisma.Decimal | number) {
  return Number(value.toString());
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map(part => part[0]).join("").toUpperCase() : "U";
}
