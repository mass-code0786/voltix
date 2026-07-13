"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Trash2, WalletCards } from "lucide-react";
import { ProfilePageHeader } from "@/components/profile-page-header";
import {
  type ExternalWalletNetwork,
  externalWalletNetworkLabel,
  normalizeExternalWalletAddress,
  supportedExternalWalletNetworks,
  validateExternalWalletAddress,
} from "@/lib/external-wallets";

type BoundWallet = {
  id: string;
  network: string;
  walletAddress: string;
  walletName: string | null;
  updatedAt: string;
};

export default function BindWalletPage() {
  const router=useRouter();
  const [wallets,setWallets]=useState<BoundWallet[]>([]);
  const [network,setNetwork]=useState<ExternalWalletNetwork>(supportedExternalWalletNetworks[0].id);
  const [walletAddress,setWalletAddress]=useState("");
  const [walletName,setWalletName]=useState("");
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const selectedWallet=useMemo(()=>wallets.find(wallet=>wallet.network===network)??null,[network,wallets]);

  useEffect(()=>{
    let active=true;
    fetch("/api/profile/wallet-bindings",{cache:"no-store",credentials:"include"}).then(async response=>{
      const data=await response.json().catch(()=>({}));
      if(response.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/bind-wallet")}`);return null;}
      if(!response.ok)throw new Error(data.error||"Wallet bindings request failed");
      return data.wallets as BoundWallet[];
    }).then(rows=>{if(active&&rows)setWallets(rows);}).catch(err=>{if(active)setError(err instanceof Error?err.message:"Wallet bindings request failed");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[router]);

  useEffect(()=>{
    setWalletAddress(selectedWallet?.walletAddress??"");
    setWalletName(selectedWallet?.walletName??"");
    setError("");
    setMessage("");
  },[selectedWallet]);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setError("");
    setMessage("");
    const normalized=normalizeExternalWalletAddress(network,walletAddress);
    const validationError=validateExternalWalletAddress(network,normalized);
    if(validationError){setError(validationError);return;}
    setSubmitting(true);
    const response=await fetch("/api/profile/wallet-bindings",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({network,walletAddress:normalized,walletName})});
    const data=await response.json().catch(()=>({}));
    setSubmitting(false);
    if(!response.ok){setError(data.error||"Wallet binding failed");return;}
    setWallets(current=>[...current.filter(wallet=>wallet.network!==data.wallet.network),data.wallet].sort((a,b)=>networkOrder(a.network)-networkOrder(b.network)));
    setWalletAddress(data.wallet.walletAddress);
    setWalletName(data.wallet.walletName??"");
    setMessage(selectedWallet?"Wallet updated":"Wallet bound successfully");
  };

  const remove=async()=>{
    if(!selectedWallet)return;
    setError("");
    setMessage("");
    setSubmitting(true);
    const response=await fetch("/api/profile/wallet-bindings",{method:"DELETE",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({network})});
    const data=await response.json().catch(()=>({}));
    setSubmitting(false);
    if(!response.ok){setError(data.error||"Remove wallet failed");return;}
    setWallets(current=>current.filter(wallet=>wallet.network!==network));
    setWalletAddress("");
    setWalletName("");
    setMessage("Wallet removed");
  };

  return <main className="profile-page min-h-screen overflow-x-hidden px-4 py-4 text-white sm:px-6">
    <div className="mx-auto max-w-2xl">
      <ProfilePageHeader title="Bind Your Wallet" icon={WalletCards} subtitle="Connect your external crypto wallet"/>

      <section className="profile-glass mt-4 rounded-[22px] p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#18ff8a]/10 text-[#18ff8a]"><Link2 size={18}/></span>
          <div>
            <h2 className="text-lg font-black">Supported Networks</h2>
            <p className="text-xs text-slate-500">One wallet address per network</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {supportedExternalWalletNetworks.map(item=><button key={item.id} type="button" onClick={()=>setNetwork(item.id)} className={`rounded-2xl border px-3 py-3 text-left text-xs font-bold ${network===item.id?"border-[#18ff8a]/40 bg-[#18ff8a]/10 text-[#18ff8a]":"border-white/[.08] bg-black/20 text-slate-300"}`}>{item.label}</button>)}
        </div>
      </section>

      <form onSubmit={submit} className="profile-glass mt-4 rounded-[22px] p-4">
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-400">Network<select value={network} onChange={event=>setNetwork(event.target.value as ExternalWalletNetwork)} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50">{supportedExternalWalletNetworks.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <Field label="Wallet Address" value={walletAddress} onChange={setWalletAddress} placeholder={addressPlaceholder(network)}/>
          <Field label="Wallet Name (optional)" value={walletName} onChange={setWalletName} placeholder="My exchange wallet"/>
        </div>
        {selectedWallet&&<p className="mt-3 rounded-2xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 px-3 py-2 text-xs font-bold text-[#18ff8a]">{externalWalletNetworkLabel(network)} already bound. Submitting will update this network.</p>}
        {(error||message)&&<p className={`mt-3 text-xs font-bold ${error?"text-[#ff4f6d]":"text-[#18ff8a]"}`}>{error||message}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button disabled={loading||submitting} className="rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{submitting?"Saving...":"Bind Wallet"}</button>
          <button type="button" onClick={remove} disabled={loading||submitting||!selectedWallet} className="flex items-center justify-center gap-2 rounded-2xl border border-[#ff4f6d]/30 bg-[#ff4f6d]/10 py-3.5 text-sm font-black text-[#ff8aa0] disabled:opacity-40"><Trash2 size={16}/> Remove Wallet</button>
        </div>
      </form>

      <section className="profile-glass mt-4 rounded-[22px] p-4">
        <h2 className="text-lg font-black">Bound Wallets</h2>
        <div className="mt-3 space-y-2">
          {loading?<p className="text-sm text-slate-500">Loading wallets...</p>:wallets.length?wallets.map(wallet=><button key={wallet.id} onClick={()=>setNetwork(wallet.network as ExternalWalletNetwork)} className="w-full rounded-2xl border border-white/[.08] bg-black/20 p-3 text-left">
            <span className="block text-sm font-black text-white">{externalWalletNetworkLabel(wallet.network)}</span>
            <span className="mt-1 block break-all text-xs text-slate-400">{wallet.walletAddress}</span>
            {wallet.walletName&&<span className="mt-1 block text-xs font-bold text-[#18ff8a]">{wallet.walletName}</span>}
          </button>):<p className="rounded-2xl border border-white/[.08] bg-black/20 p-4 text-center text-xs text-slate-500">No wallets bound yet</p>}
        </div>
      </section>
    </div>
  </main>;
}

function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string}) {
  return <label className="block text-xs font-bold text-slate-400">{label}<input value={value} onChange={event=>onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"/></label>;
}

function networkOrder(network:string) {
  const index=supportedExternalWalletNetworks.findIndex(item=>item.id===network);
  return index<0?999:index;
}

function addressPlaceholder(network:string) {
  if(network==="TRC20")return "T...";
  if(network==="SOLANA")return "Solana wallet address";
  return "0x...";
}
