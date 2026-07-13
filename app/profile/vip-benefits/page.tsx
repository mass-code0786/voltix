"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Lock } from "lucide-react";
import { ProfilePageHeader } from "@/components/profile-page-header";
import { getVipIconPath, getVipRankNumber } from "@/lib/vip-icons";

type Profile = { vipRank: string; nextRank: string | null; nextRankProgress: number; missingConditions: string[] };
const benefits = [["VIP 0", "Base access", "1.0% - 1.1% daily AI row"], ["VIP 1 / 2", "Growth tier", "1.1% - 1.2% daily AI row"], ["VIP 3 / 4", "Advanced tier", "1.2% - 1.3% daily AI row"], ["VIP 5 / 6", "Premium tier", "1.3% - 1.4% daily AI row"], ["VIP 7 - 10", "Elite tier", "1.4% - 1.5% daily AI row"]];
const vipRanks = Array.from({ length: 11 }, (_, rank) => rank);

export default function VipBenefitsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/profile", { cache: "no-store", credentials: "include" }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/vip-benefits")}`);
        return;
      }
      if (!response.ok) throw new Error(data.error || "Profile request failed");
      setProfile(data.profile);
    }).catch(cause => setError(cause instanceof Error ? cause.message : "Profile request failed"));
  }, [router]);

  const current = profile?.vipRank?.trim() || "—";
  const currentRank = getVipRankNumber(profile?.vipRank);
  const next = useMemo(() => profile?.nextRank ?? "Max level", [profile?.nextRank]);

  return <main className="profile-page min-h-screen px-4 py-4 text-white sm:px-6"><div className="mx-auto max-w-2xl">
    <ProfilePageHeader title="VIP & Benefits" icon={Crown}/>
    {error && <p className="profile-glass mt-4 rounded-[22px] p-4 text-sm text-[#ff4f6d]">{error}</p>}
    <section className="profile-glass mt-4 rounded-[22px] p-4">
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#18ff8a]/25 bg-[#18ff8a]/10 p-3 shadow-[0_0_24px_rgba(24,255,138,.12)]"><img src={getVipIconPath(currentRank)} alt={`VIP ${currentRank} badge`} className="h-20 w-20 object-contain"/><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Achieved rank</p><p className="mt-1 text-xl font-black text-white">{current}</p></div></div>
      <div className="grid grid-cols-2 gap-3"><Info label="Current VIP rank" value={current}/><Info label="Next VIP rank" value={next}/></div>
      <div className="mt-4 rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Requirements</p><p className="mt-1 text-sm text-slate-400">{profile?.missingConditions?.length ? profile.missingConditions.join(" · ") : "Highest VIP rank achieved."}</p></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-[#18ff8a]" style={{ width: `${profile?.nextRankProgress ?? 0}%` }}/></div><p className="mt-2 text-center text-xs text-slate-500">Progress updates automatically from account activity.</p>
    </section>
    <section className="profile-glass mt-4 rounded-[22px] p-4"><h2 className="text-lg font-black">VIP badge path</h2><div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">{vipRanks.map(rank => { const locked = rank > currentRank; const currentBadge = rank === currentRank; return <div key={rank} className={`relative rounded-2xl border p-2 text-center ${currentBadge ? "border-[#18ff8a]/45 bg-[#18ff8a]/10 shadow-[0_0_20px_rgba(24,255,138,.18)]" : "border-white/[.08] bg-black/25"}`}><img src={getVipIconPath(rank)} alt={`VIP ${rank} badge`} className={`mx-auto h-16 w-16 object-contain ${locked ? "opacity-35" : currentBadge ? "opacity-100" : "opacity-65"}`}/>{locked && <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-slate-400"><Lock size={10}/></span>}<p className={`mt-1 text-[10px] font-black ${currentBadge ? "text-[#18ff8a]" : "text-slate-400"}`}>VIP {rank}</p></div>; })}</div></section>
    <section className="profile-glass mt-4 rounded-[22px] p-4"><h2 className="text-lg font-black">Benefits table</h2><div className="mt-3 space-y-2">{benefits.map(([tier, label, benefit]) => <div key={tier} className="rounded-2xl border border-white/[.08] bg-black/25 p-3"><div className="flex justify-between gap-3"><p className="font-bold text-white">{tier}</p><span className="text-xs text-[#18ff8a]">{label}</span></div><p className="mt-1 text-xs text-slate-400">{benefit}</p></div>)}</div></section>
  </div></main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>;
}
