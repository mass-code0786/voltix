export function getVipRankNumber(vipRank: number | string | null | undefined) {
  const parsed = typeof vipRank === "number" ? vipRank : Number(vipRank?.match(/\d+/)?.[0] ?? 0);
  return Math.min(10, Math.max(0, Number.isFinite(parsed) ? Math.floor(parsed) : 0));
}

export function getVipIconPath(vipRank: number | string | null | undefined) {
  return `/vip-icons/vip-${getVipRankNumber(vipRank)}.svg`;
}
