"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot } from "lucide-react";

type AiStatus={price:number;validityDays:number;subscription:null|{id:string;amount:number;startsAt:string;expiresAt:string;active:boolean;remainingDays:number}};

export default function AiSubscriptionPage(){
  const router=useRouter();
  const [status,setStatus]=useState<AiStatus|null>(null),[loading,setLoading]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const load=()=>fetch("/api/ai/subscription").then(async r=>{const d=await r.json().catch(()=>({}));if(r.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/ai-subscription")}`);return;}if(!r.ok)throw new Error(d.error||"AI subscription request failed");setStatus(d);}).catch(e=>setError(e instanceof Error?e.message:"AI subscription request failed"));
  useEffect(()=>{load();},[]);
  const purchase=async()=>{setError("");setMessage("");setLoading(true);const r=await fetch("/api/ai/subscription/purchase",{method:"POST"});const d=await r.json().catch(()=>({}));setLoading(false);if(!r.ok){setError(d.error||"Purchase failed");return;}setMessage("AI subscription active");load();};
  const sub=status?.subscription;
  return <main className="profile-page min-h-screen px-4 py-4 text-white sm:px-6"><div className="mx-auto max-w-2xl"><header className="profile-glass rounded-[22px] p-4"><div className="flex items-center justify-between"><Link href="/profile" className="grid h-10 w-10 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-[#18ff8a]"><ArrowLeft size={18}/></Link><div className="grid h-10 w-10 place-items-center rounded-xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]"><Bot size={18}/></div></div><h1 className="mt-5 text-2xl font-black">AI Subscription</h1></header><section className="profile-glass mt-4 rounded-[22px] p-4"><div className="grid grid-cols-2 gap-3"><Info label="Status" value={sub?.active?"Active":"Inactive"}/><Info label="Price" value={`$${Number(status?.price??15).toFixed(2)}`}/><Info label="Valid till" value={sub?new Date(sub.expiresAt).toLocaleDateString():"—"}/><Info label="Remaining" value={sub?`${sub.remainingDays} days`:"0 days"}/></div>{(error||message)&&<p className={`mt-3 text-xs font-bold ${error?"text-[#ff4f6d]":"text-[#18ff8a]"}`}>{error||message}</p>}<button onClick={purchase} disabled={loading} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{loading?"Working...":sub?.active?"Renew / Manage":"Purchase AI"}</button></section><section className="profile-glass mt-4 rounded-[22px] p-4"><h2 className="text-lg font-black">Subscription history</h2>{sub?<div className="mt-3 rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="font-bold text-white">Current subscription</p><p className="mt-1 text-xs text-slate-400">Started {new Date(sub.startsAt).toLocaleString()}</p><p className="mt-1 text-xs text-slate-400">Amount ${sub.amount.toFixed(2)}</p></div>:<p className="mt-3 rounded-2xl border border-white/[.08] bg-black/25 p-6 text-center text-sm text-slate-500">No subscription history available</p>}</section></div></main>;
}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>}
