"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, FileCheck2, ShieldCheck } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { countryOptions } from "@/lib/profile-options";
import { getKycDocumentTypes } from "@/lib/kyc-document-types";

type KycStatus = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
type KycSnapshot = {
  status: KycStatus;
  request: {
    fullName?: string | null;
    dateOfBirth?: string | null;
    country?: string | null;
    address?: string | null;
    governmentIdType?: string | null;
    governmentIdNumber?: string | null;
    frontIdImageUrl?: string | null;
    backIdImageUrl?: string | null;
    selfieImageUrl?: string | null;
    rejectionReason?: string | null;
  } | null;
};
type ProfileResponse = { profile?: { fullName?: string | null; country?: string | null } };

export default function KycPage() {
  const router=useRouter();
  const [snapshot,setSnapshot]=useState<KycSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [fullName,setFullName]=useState("");
  const [dateOfBirth,setDateOfBirth]=useState("");
  const [country,setCountry]=useState("United States");
  const [address,setAddress]=useState("");
  const [governmentIdType,setGovernmentIdType]=useState("Passport");
  const [governmentIdNumber,setGovernmentIdNumber]=useState("");
  const [frontIdImageUrl,setFrontIdImageUrl]=useState("");
  const [backIdImageUrl,setBackIdImageUrl]=useState("");
  const [selfieImageUrl,setSelfieImageUrl]=useState("");
  const documentTypes=useMemo(()=>getKycDocumentTypes(country),[country]);
  const canSubmit=snapshot?.status==="NOT_SUBMITTED"||snapshot?.status==="REJECTED";

  useEffect(()=>{
    let active=true;
    Promise.all([
      fetch("/api/kyc").then(async response=>{if(response.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/kyc")}`);return null;}if(!response.ok)throw new Error("KYC request failed");return response.json() as Promise<KycSnapshot>;}),
      fetch("/api/profile").then(response=>response.ok?response.json() as Promise<ProfileResponse>:null).catch(()=>null),
    ]).then(([kyc,profile])=>{
      if(!active||!kyc)return;
      setSnapshot(kyc);
      const request=kyc.request;
      setFullName(request?.fullName??profile?.profile?.fullName??"");
      setDateOfBirth(request?.dateOfBirth?.slice(0,10)??"");
      setCountry(request?.country??profile?.profile?.country??"United States");
      setAddress(request?.address??"");
      setGovernmentIdType(request?.governmentIdType??getKycDocumentTypes(request?.country??profile?.profile?.country??"United States")[0]??"Passport");
      setGovernmentIdNumber(request?.governmentIdNumber??"");
      setFrontIdImageUrl(request?.frontIdImageUrl??"");
      setBackIdImageUrl(request?.backIdImageUrl??"");
      setSelfieImageUrl(request?.selfieImageUrl??"");
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:"KYC request failed");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[router]);

  useEffect(()=>{if(!documentTypes.includes(governmentIdType))setGovernmentIdType(documentTypes[0]??"Passport");},[documentTypes,governmentIdType]);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setError("");
    if(!canSubmit)return;
    if(!fullName.trim()||!dateOfBirth.trim()||!country.trim()||!address.trim()||!governmentIdNumber.trim()||!frontIdImageUrl.trim()||!backIdImageUrl.trim()||!selfieImageUrl.trim()){setError("Complete all verification fields");return;}
    setSubmitting(true);
    const response=await fetch("/api/kyc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fullName,dateOfBirth,country,address,governmentIdType,governmentIdNumber,frontIdImageUrl,backIdImageUrl,selfieImageUrl})});
    const data=await response.json().catch(()=>({}));
    setSubmitting(false);
    if(!response.ok){setError(data.error||"KYC submission failed");return;}
    setSnapshot({status:"PENDING",request:data.kyc??null});
  };

  return <main className="profile-page min-h-screen overflow-x-hidden px-4 py-4 text-white sm:px-6">
    <div className="mx-auto max-w-2xl">
      <header className="profile-glass rounded-[22px] p-4">
        <div className="flex items-center justify-between">
          <Link href="/profile" className="grid h-10 w-10 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-[#18ff8a]" aria-label="Back to profile"><ArrowLeft size={18}/></Link>
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]"><ShieldCheck size={18}/></div>
        </div>
        <h1 className="mt-5 text-2xl font-black">KYC Verification</h1>
      </header>

      {loading?<section className="profile-glass mt-4 rounded-[22px] p-5 text-sm text-slate-400">Loading verification...</section>:error&&!snapshot?<section className="profile-glass mt-4 rounded-[22px] p-5 text-sm text-[#ff4f6d]">{error}</section>:snapshot?.status==="PENDING"?<StatusCard icon={Clock3} title="Your KYC is under review" text="Manual admin approval is pending." tone="pending"/>:snapshot?.status==="APPROVED"?<StatusCard icon={CheckCircle2} title="Your KYC is verified" text="Your identity verification has been approved." tone="approved"/>:<form onSubmit={submit} className="profile-glass mt-4 rounded-[22px] p-4">
        {snapshot?.status==="REJECTED"&&<div className="mb-4 rounded-2xl border border-[#ff4f6d]/30 bg-[#ff4f6d]/10 p-3 text-xs text-[#ff8aa0]">{snapshot.request?.rejectionReason||"Your KYC was rejected. Please submit updated details."}</div>}
        <div className="space-y-3">
          <Field label="Full name" value={fullName} onChange={setFullName}/>
          <Field label="Date of birth" type="date" value={dateOfBirth} onChange={setDateOfBirth}/>
          <SearchableSelect label="Country" options={countryOptions} value={country} onChange={setCountry} placeholder="Search country"/>
          <label className="block text-xs font-bold text-slate-400">Document type<select value={governmentIdType} onChange={event=>setGovernmentIdType(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50">{documentTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
          <Field label="Document number" value={governmentIdNumber} onChange={setGovernmentIdNumber}/>
          <Field label="Address" value={address} onChange={setAddress}/>
          <Field label="Document front upload/link" value={frontIdImageUrl} onChange={setFrontIdImageUrl} placeholder="https://..."/>
          <Field label="Document back upload/link" value={backIdImageUrl} onChange={setBackIdImageUrl} placeholder="https://..."/>
          <Field label="Selfie upload/link" value={selfieImageUrl} onChange={setSelfieImageUrl} placeholder="https://..."/>
        </div>
        {error&&<p className="mt-3 text-xs text-[#ff4f6d]">{error}</p>}
        <button disabled={submitting} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{submitting?"Submitting...":"Submit KYC"}</button>
      </form>}
    </div>
  </main>;
}

function StatusCard({icon:Icon,title,text,tone}:{icon:typeof Clock3;title:string;text:string;tone:"pending"|"approved"}) {
  return <section className="profile-glass mt-4 rounded-[22px] p-6 text-center">
    <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${tone==="approved"?"bg-[#18ff8a]/10 text-[#18ff8a]":"bg-[#f6c85f]/10 text-[#f6c85f]"}`}><Icon size={25}/></div>
    <h2 className="mt-4 text-xl font-black">{title}</h2>
    <p className="mt-2 text-sm text-slate-500">{text}</p>
    <Link href="/profile" className="mt-5 inline-flex rounded-2xl border border-white/[.08] bg-black/25 px-5 py-3 text-xs font-black text-[#18ff8a]">Back to Profile</Link>
  </section>;
}

function Field({label,value,onChange,type="text",placeholder}:{label:string;value:string;onChange:(value:string)=>void;type?:string;placeholder?:string}) {
  return <label className="block text-xs font-bold text-slate-400">{label}<input type={type} value={value} onChange={event=>onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"/></label>;
}
