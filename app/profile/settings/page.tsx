"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { ProfilePageHeader } from "@/components/profile-page-header";
import { SearchableSelect } from "@/components/searchable-select";
import { languageOptions } from "@/lib/profile-options";

type Profile={fullName:string;country:string;language:string;profileImageUrl:string|null};

export default function SettingsPage(){
  const router=useRouter();
  const [profile,setProfile]=useState<Profile|null>(null),[language,setLanguage]=useState("en"),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  useEffect(()=>{fetch("/api/profile",{cache:"no-store",credentials:"include"}).then(async r=>{const d=await r.json().catch(()=>({}));if(r.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/settings")}`);return null;}if(!r.ok)throw new Error(d.error||"Profile request failed");return d.profile as Profile;}).then(p=>{if(!p)return;setProfile(p);setLanguage(p.language??"en");}).catch(e=>setError(e instanceof Error?e.message:"Profile request failed"));},[router]);
  const save=async(e:FormEvent)=>{e.preventDefault();if(!profile)return;setSaving(true);setError("");setMessage("");const r=await fetch("/api/profile",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:profile.fullName,country:profile.country,language,profileImageUrl:profile.profileImageUrl??""})});const d=await r.json().catch(()=>({}));setSaving(false);if(!r.ok){setError(d.error||"Save failed");return;}setProfile(d.profile);setMessage("Settings saved");};
  return <Frame><form onSubmit={save} className="profile-glass rounded-[22px] p-4"><div className="space-y-3"><SearchableSelect label="Language" options={languageOptions} value={language} onChange={setLanguage} placeholder="Search language"/><div className="rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Theme preference</p><p className="mt-1 text-sm font-bold text-slate-200">Voltix dark green</p></div><div className="rounded-2xl border border-white/[.08] bg-black/25 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Account preferences</p><p className="mt-1 text-sm text-slate-400">Core account preferences are synced with your profile.</p></div></div>{(error||message)&&<p className={`mt-3 text-xs font-bold ${error?"text-[#ff4f6d]":"text-[#18ff8a]"}`}>{error||message}</p>}<button disabled={saving||!profile} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{saving?"Saving...":"Save Settings"}</button></form></Frame>;
}

function Frame({children}:{children:React.ReactNode}){return <main className="profile-page min-h-screen px-4 py-4 text-white sm:px-6"><div className="mx-auto max-w-2xl"><ProfilePageHeader title="Settings" icon={Settings}/><div className="mt-4">{children}</div></div></main>}
