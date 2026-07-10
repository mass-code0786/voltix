"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Crown } from "lucide-react";

type Profile={vipRank:string;nextRank:string|null;nextRankProgress:number;missingConditions:string[]};
const benefits=[["VIP 0","Base access","1.0% - 1.1% daily AI row"],["VIP 1 / 2","Growth tier","1.1% - 1.2% daily AI row"],["VIP 3 / 4","Advanced tier","1.2% - 1.3% daily AI row"],["VIP 5 / 6","Premium tier","1.3% - 1.4% daily AI row"],["VIP 7 - 10","Elite tier","1.4% - 1.5% daily AI row"]];

export default function VipBenefitsPage(){
  const router=useRouter();
  const [profile,setProfile]=useState<Profile|null>(null),[error,setError]=useState("");
  useEffect(()=>{fetch("/api/profile",{cache:"no-store",credentials:"include"}).then(async r=>{const d=await r.json().catch(()=>({}));if(r.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/vip-benefits")}`);return;}if(!r.ok)throw new Error(d.error||"Profile request failed");setProfile(d.profile);}).catch(e=>setError(e instanceof Error?e.message:"Profile request failed"));},[router]);
  const current=profile?.vipRank?.trim()||"—";
  const next=useMemo(()=>profile?.nextRank??"Max level",[profile?.nextRank]);
  return <main className="profile-page min-h-screen px-4 py-4 text-white sm:px-6"><div className="mx-auto max-w-2xl"><header className="profile-glass rounded-[22px] p-4"><div className="flex items-center justify-between"><Link href="/profile" className="grid h-10 w-10 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-[#18ff8a]"><ArrowLeft size={18}/></Link><div className="grid h-10 w-10 place-items-center rounded-xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]"><Crown size={18}/></div></div><h1 className="mt-5 text-2xl font-black">VIP & Benefits</h1></header>{error&&<p className="profile-glass mt-4 rounded-[22px] p-4 text-sm text-[#ff4f6d]">{error}</p>}<section className="profile-glass mt-4 rounded-[22px] p-4"><div className="grid grid-cols-2 gap-3"><Info label="Current VIP rank" value={current}/><Info label="Next VIP rank" value={next}/></div><div className="mt-4 rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Requirements</p><p className="mt-1 text-sm text-slate-400">{profile?.missingConditions?.length?profile.missingConditions.join(" · "):"Highest VIP rank achieved."}</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-black/40"><div className="h-full rounded-full bg-[#18ff8a]" style={{width:`${profile?.nextRankProgress??0}%`}}/></div><p className="mt-2 text-center text-xs text-slate-500">Progress updates automatically from account activity.</p></section><section className="profile-glass mt-4 rounded-[22px] p-4"><h2 className="text-lg font-black">Benefits table</h2><div className="mt-3 space-y-2">{benefits.map(([tier,label,benefit])=><div key={tier} className="rounded-2xl border border-white/[.08] bg-black/25 p-3"><div className="flex justify-between gap-3"><p className="font-bold text-white">{tier}</p><span className="text-xs text-[#18ff8a]">{label}</span></div><p className="mt-1 text-xs text-slate-400">{benefit}</p></div>)}</div></section></div></main>;
}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>}
