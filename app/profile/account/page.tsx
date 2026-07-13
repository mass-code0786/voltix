"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { ProfilePageHeader } from "@/components/profile-page-header";
import { SearchableSelect } from "@/components/searchable-select";
import { countryOptions, languageOptions } from "@/lib/profile-options";

type Profile = { fullName:string; email:string; uid:string; country:string; language:string; profileImageUrl:string|null };

export default function AccountPage(){
  const router=useRouter();
  const [profile,setProfile]=useState<Profile|null>(null),[name,setName]=useState(""),[country,setCountry]=useState("United States"),[language,setLanguage]=useState("en"),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  useEffect(()=>{let active=true;fetch("/api/profile",{cache:"no-store",credentials:"include"}).then(async r=>{const d=await r.json().catch(()=>({}));if(r.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/account")}`);return null;}if(!r.ok)throw new Error(d.error||"Profile request failed");return d.profile as Profile;}).then(p=>{if(!active||!p)return;setProfile(p);setName(p.fullName??"");setCountry(p.country??"United States");setLanguage(p.language??"en");}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Profile request failed");});return()=>{active=false};},[router]);
  const save=async(e:FormEvent)=>{e.preventDefault();setError("");setMessage("");setSaving(true);const r=await fetch("/api/profile",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,country,language,profileImageUrl:profile?.profileImageUrl??""})});const d=await r.json().catch(()=>({}));setSaving(false);if(!r.ok){setError(d.error||"Save failed");return;}setProfile(d.profile);setMessage("Account saved");};
  return <ProfilePageFrame title="Account Information" icon={UserRound}><form onSubmit={save} className="profile-glass rounded-[22px] p-4"><div className="space-y-3"><Field label="Name" value={name} onChange={setName}/><ReadOnly label="Email" value={profile?.email??"..."}/><ReadOnly label="UID" value={profile?.uid??"..."}/><SearchableSelect label="Country" options={countryOptions} value={country} onChange={setCountry} placeholder="Search country"/><SearchableSelect label="Language" options={languageOptions} value={language} onChange={setLanguage} placeholder="Search language"/></div>{(error||message)&&<p className={`mt-3 text-xs font-bold ${error?"text-[#ff4f6d]":"text-[#18ff8a]"}`}>{error||message}</p>}<button disabled={saving} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{saving?"Saving...":"Save"}</button></form></ProfilePageFrame>;
}

function ProfilePageFrame({title,icon,children}:{title:string;icon:typeof UserRound;children:React.ReactNode}){return <main className="profile-page min-h-screen px-4 py-4 text-white sm:px-6"><div className="mx-auto max-w-2xl"><ProfilePageHeader title={title} icon={icon}/><div className="mt-4">{children}</div></div></main>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="block text-xs font-bold text-slate-400">{label}<input value={value} onChange={e=>onChange(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"/></label>}
function ReadOnly({label,value}:{label:string;value:string}){return <div className="rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 break-all text-sm font-bold text-slate-200">{value}</p></div>}
