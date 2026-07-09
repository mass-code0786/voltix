"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock3, ImagePlus, ShieldCheck, X } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { countryOptions } from "@/lib/profile-options";
import { getKycDocumentTypes, kycDocumentRequiresBackPhoto } from "@/lib/kyc-document-types";

type KycStatus = "NOT_SUBMITTED" | "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
type KycSnapshot = {
  status: KycStatus;
  request: {
    country?: string | null;
    governmentIdType?: string | null;
    governmentIdNumber?: string | null;
    rejectionReason?: string | null;
    reviewedAt?: string | null;
    approvedAt?: string | null;
    approvedBy?: string | null;
  } | null;
};
type ProfileResponse = { profile?: { country?: string | null } };
type UploadState = { file: File | null; preview: string };

const emptyUpload: UploadState = { file: null, preview: "" };
const acceptedImages = "image/jpeg,image/png,image/webp";
const maxUploadBytes = 5 * 1024 * 1024;

export default function KycPage() {
  const router=useRouter();
  const [snapshot,setSnapshot]=useState<KycSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [country,setCountry]=useState("United States");
  const [governmentIdType,setGovernmentIdType]=useState("Passport");
  const [governmentIdNumber,setGovernmentIdNumber]=useState("");
  const [frontUpload,setFrontUpload]=useState<UploadState>(emptyUpload);
  const [backUpload,setBackUpload]=useState<UploadState>(emptyUpload);
  const [selfieUpload,setSelfieUpload]=useState<UploadState>(emptyUpload);
  const documentTypes=useMemo(()=>getKycDocumentTypes(country),[country]);
  const backRequired=kycDocumentRequiresBackPhoto(governmentIdType);
  const canSubmit=snapshot?.status==="NOT_SUBMITTED"||snapshot?.status==="REJECTED";

  useEffect(()=>()=>{[frontUpload.preview,backUpload.preview,selfieUpload.preview].forEach(revokePreview);},[frontUpload.preview,backUpload.preview,selfieUpload.preview]);

  useEffect(()=>{
    let active=true;
    Promise.all([
      fetch("/api/kyc",{cache:"no-store",credentials:"include"}).then(async response=>{if(response.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/kyc")}`);return null;}if(!response.ok)throw new Error("KYC request failed");return response.json() as Promise<KycSnapshot>;}),
      fetch("/api/profile",{cache:"no-store",credentials:"include"}).then(response=>response.ok?response.json() as Promise<ProfileResponse>:null).catch(()=>null),
    ]).then(([kyc,profile])=>{
      if(!active||!kyc)return;
      setSnapshot(kyc);
      const request=kyc.request;
      const nextCountry=request?.country??profile?.profile?.country??"United States";
      setCountry(nextCountry);
      setGovernmentIdType(request?.governmentIdType??getKycDocumentTypes(nextCountry)[0]??"Passport");
      setGovernmentIdNumber(request?.governmentIdNumber??"");
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:"KYC request failed");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[router]);

  useEffect(()=>{if(!documentTypes.includes(governmentIdType))setGovernmentIdType(documentTypes[0]??"Passport");},[documentTypes,governmentIdType]);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setError("");
    setSuccess("");
    if(!canSubmit)return;
    if(!country.trim()||!governmentIdNumber.trim()||!frontUpload.file||!selfieUpload.file||backRequired&&!backUpload.file){setError("Complete all required verification fields");return;}
    setSubmitting(true);
    const form=new FormData();
    form.set("country",country);
    form.set("governmentIdType",governmentIdType);
    form.set("governmentIdNumber",governmentIdNumber);
    form.set("frontIdImage",frontUpload.file);
    if(backUpload.file)form.set("backIdImage",backUpload.file);
    form.set("selfieImage",selfieUpload.file);
    const response=await fetch("/api/kyc",{method:"POST",credentials:"include",body:form});
    const data=await response.json().catch(()=>({}));
    setSubmitting(false);
    if(!response.ok){setError(data.error||"KYC submission failed");return;}
    setSnapshot({status:"UNDER_REVIEW",request:data.kyc??null});
    setSuccess(data.message||"Your KYC has been submitted successfully. It is now under review.");
  };

  const chooseFile=(setter:(value:UploadState)=>void,current:UploadState,file?:File)=>{
    setError("");
    if(!file)return;
    if(!acceptedImages.split(",").includes(file.type)){setError("Only JPG, JPEG, PNG, or WebP images are allowed");return;}
    if(file.size>maxUploadBytes){setError("Each photo must be 5MB or smaller");return;}
    revokePreview(current.preview);
    setter({file,preview:URL.createObjectURL(file)});
  };
  const removeFile=(setter:(value:UploadState)=>void,current:UploadState)=>{revokePreview(current.preview);setter(emptyUpload);};

  return <main className="profile-page min-h-screen overflow-x-hidden px-4 py-4 text-white sm:px-6">
    <div className="mx-auto max-w-2xl">
      <header className="profile-glass rounded-[22px] p-4">
        <div className="flex items-center justify-between">
          <Link href="/profile" className="grid h-10 w-10 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-[#18ff8a]" aria-label="Back to profile"><ArrowLeft size={18}/></Link>
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]"><ShieldCheck size={18}/></div>
        </div>
        <h1 className="mt-5 text-2xl font-black">KYC Verification</h1>
      </header>
      {success&&<div className="mt-4 rounded-2xl border border-[#18ff8a]/30 bg-[#18ff8a]/10 p-4 text-sm font-bold text-[#18ff8a]">{success}</div>}

      {loading?<section className="profile-glass mt-4 rounded-[22px] p-5 text-sm text-slate-400">Loading verification...</section>:error&&!snapshot?<section className="profile-glass mt-4 rounded-[22px] p-5 text-sm text-[#ff4f6d]">{error}</section>:isUnderReview(snapshot?.status)?<StatusCard icon={Clock3} title="Your KYC is under review" text="Manual admin approval is pending." tone="pending"/>:snapshot?.status==="APPROVED"?<StatusCard icon={CheckCircle2} title="Status: Verified" text={`Approval Date: ${formatReviewDate(snapshot.request?.approvedAt??snapshot.request?.reviewedAt)}${snapshot.request?.approvedBy?` | Approved By: ${snapshot.request.approvedBy}`:""}`} tone="approved"/>:<form onSubmit={submit} className="profile-glass mt-4 rounded-[22px] p-4">
        {snapshot?.status==="REJECTED"&&<div className="mb-4 rounded-2xl border border-[#ff4f6d]/30 bg-[#ff4f6d]/10 p-3 text-xs text-[#ff8aa0]"><p className="font-black">Status: Rejected</p><p className="mt-2 font-bold">Reason:</p><p className="mt-1">{snapshot.request?.rejectionReason||"Your KYC was rejected. Please submit updated details."}</p></div>}
        <div className="space-y-3">
          <SearchableSelect label="Country" options={countryOptions} value={country} onChange={setCountry} placeholder="Search country"/>
          <label className="block text-xs font-bold text-slate-400">Document type<select value={governmentIdType} onChange={event=>setGovernmentIdType(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50">{documentTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
          <Field label="Document number" value={governmentIdNumber} onChange={setGovernmentIdNumber}/>
          <KycUploadBox label="Document Front Photo" upload={frontUpload} required onChange={file=>chooseFile(setFrontUpload,frontUpload,file)} onRemove={()=>removeFile(setFrontUpload,frontUpload)}/>
          <KycUploadBox label="Document Back Photo" upload={backUpload} required={backRequired} onChange={file=>chooseFile(setBackUpload,backUpload,file)} onRemove={()=>removeFile(setBackUpload,backUpload)}/>
          <KycUploadBox label="Selfie Holding Document" upload={selfieUpload} required onChange={file=>chooseFile(setSelfieUpload,selfieUpload,file)} onRemove={()=>removeFile(setSelfieUpload,selfieUpload)}/>
        </div>
        {error&&<p className="mt-3 text-xs text-[#ff4f6d]">{error}</p>}
        <button disabled={submitting} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{submitting?"Submitting...":snapshot?.status==="REJECTED"?"Submit Again":"Submit KYC"}</button>
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

function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  return <label className="block text-xs font-bold text-slate-400">{label}<input value={value} onChange={event=>onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"/></label>;
}

function KycUploadBox({label,upload,required,onChange,onRemove}:{label:string;upload:UploadState;required?:boolean;onChange:(file?:File)=>void;onRemove:()=>void}) {
  return <div className="rounded-2xl border border-white/[.08] bg-black/20 p-3">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-bold text-slate-400">{label}{required&&<span className="text-[#18ff8a]"> *</span>}</p>
      {upload.file&&<button type="button" onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-xl border border-white/[.08] text-slate-400 hover:text-[#ff4f6d]" aria-label={`Remove ${label}`}><X size={15}/></button>}
    </div>
    <label className="mt-2 flex min-h-[124px] cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#18ff8a]/25 bg-[#18ff8a]/[.04] p-3 transition hover:bg-[#18ff8a]/[.07]">
      <input type="file" accept={acceptedImages} className="hidden" onChange={event=>onChange(event.target.files?.[0])}/>
      {upload.preview?<img src={upload.preview} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover"/>:<span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#18ff8a]/10 text-[#18ff8a]"><ImagePlus size={22}/></span>}
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{upload.file?"Replace photo":"Choose photo"}</span>
        <span className="mt-1 block break-all text-xs text-slate-500">{upload.file?.name??"JPG, JPEG, PNG, or WebP up to 5MB"}</span>
      </span>
    </label>
  </div>;
}

function revokePreview(preview:string) {
  if(preview)URL.revokeObjectURL(preview);
}

function isUnderReview(status?: KycStatus) {
  return status === "UNDER_REVIEW" || status === "PENDING";
}

function formatReviewDate(value?: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}
