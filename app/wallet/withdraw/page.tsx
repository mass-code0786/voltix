"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { TransactionPinInput } from "@/components/transaction-pin-input";
import { displayWalletName } from "@/lib/wallet-labels";

type WalletType = "SPOT" | "BITEX";
type AssetTotals = {
  total?: { spot?: number; bitex?: number };
  bitex?: { principal?: number; incomeEarned?: number };
};

const fixedSpotFee = 2;
const spotFeeRate = 0.05;

export default function WalletWithdrawPage() {
  const router = useRouter();
  const [totals,setTotals]=useState<AssetTotals>({});
  const [loading,setLoading]=useState(true);
  const [walletType,setWalletType]=useState<WalletType>("SPOT");
  const [amount,setAmount]=useState("");
  const [address,setAddress]=useState("");
  const [network,setNetwork]=useState("BSC");
  const [confirming,setConfirming]=useState(false);
  const [transactionPin,setTransactionPin]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  useEffect(()=>{
    let active=true;
    fetch("/api/assets",{cache:"no-store",credentials:"include"}).then(async response=>{
      const data=await response.json().catch(()=>({}));
      if(response.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/wallet/withdraw")}`);return null;}
      if(!response.ok)throw new Error(data.error||"Wallet request failed");
      return data.totals as AssetTotals;
    }).then(next=>{if(active&&next)setTotals(next);}).catch(err=>{if(active)setError(err instanceof Error?err.message:"Wallet request failed");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[router]);

  const value=Number(amount)||0;
  const balances=useMemo(()=>({SPOT:Number(totals.total?.spot??0),BITEX:Number(totals.total?.bitex??0)}),[totals]);
  const available=balances[walletType];
  const bitexPrincipal=Number(totals.bitex?.principal??0);
  const bitexIncomeEarned=Number(totals.bitex?.incomeEarned??0);
  const locked=walletType==="BITEX"&&bitexPrincipal>0&&bitexIncomeEarned<bitexPrincipal*2;
  const fixedFee=walletType==="SPOT"&&value>0?fixedSpotFee:0;
  const percentageFee=walletType==="SPOT"?value*spotFeeRate:0;
  const totalFee=fixedFee+percentageFee;
  const received=Math.max(0,value-totalFee);

  const resetError=()=>{setError("");setSuccess("");};

  const openConfirmation=()=>{
    resetError();
    if(locked){setError("AI withdrawal will unlock after completing 2x copy trade income.");return;}
    if(value<=0){setError("Enter a valid withdrawal amount");return;}
    if(value>available){setError(`Insufficient ${displayWalletName(walletType)} balance`);return;}
    if(!address.trim()){setError("Enter an external wallet or exchange address");return;}
    if(received<=0){setError("Withdrawal amount must exceed the total fee");return;}
    setTransactionPin("");
    setConfirming(true);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const confirmWithdrawal=async()=>{
    resetError();
    if(transactionPin.length!==6){setError("Invalid Transaction PIN.");return;}
    setSubmitting(true);
    const response=await fetch("/api/withdrawals",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({walletType,amount:value,address,network,transactionPin})});
    const data=await response.json().catch(()=>({}));
    setSubmitting(false);
    if(!response.ok){
      setTransactionPin("");
      setError(data.error||"Withdrawal request failed");
      return;
    }
    setConfirming(false);
    setTransactionPin("");
    setSuccess("Withdrawal request submitted. Status: pending admin approval.");
  };

  return <main className="profile-page min-h-screen overflow-x-hidden px-4 py-3 text-white sm:px-6">
    <div className="mx-auto max-w-2xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="flex h-12 items-center gap-3">
        <Link href="/dashboard?view=wallet" className="grid h-10 w-10 place-items-center text-white" aria-label="Back to wallet"><ArrowLeft size={22}/></Link>
        <h1 className="text-xl font-black">{confirming?"Confirm Withdrawal":"Withdraw"}</h1>
      </header>

      {loading?<section className="profile-glass mt-2 rounded-[22px] p-5 text-sm text-slate-400">Loading wallet...</section>:confirming?<section className="profile-glass mt-2 rounded-[22px] p-4">
        <div className="rounded-2xl border border-[#18ff8a]/20 bg-[#18ff8a]/[.06] p-4">
          <h2 className="text-lg font-black">Confirm Withdrawal</h2>
          <p className="mt-1 text-xs text-slate-500">Enter your 6 digit Transaction PIN to submit this request.</p>
        </div>
        <div className="mt-4 space-y-2 rounded-2xl border border-white/[.08] bg-black/25 p-4">
          <LineItem label="Wallet" value={displayWalletName(walletType)}/>
          <LineItem label="Amount" value={`${value.toFixed(2)} USDT`}/>
          <LineItem label="Network" value={network}/>
          <LineItem label="Address" value={address.trim()}/>
          <LineItem label="Fixed fee" value={`${fixedFee.toFixed(2)} USDT`}/>
          <LineItem label="5% fee" value={`${percentageFee.toFixed(2)} USDT`}/>
          <LineItem label="Receivable amount" value={`${received.toFixed(2)} USDT`}/>
        </div>
        <div className="mt-4"><TransactionPinInput label="Transaction PIN" value={transactionPin} onChange={setTransactionPin} autoFocus disabled={submitting}/></div>
        {error&&<p className="mt-3 rounded-2xl border border-[#ff4f6d]/30 bg-[#ff4f6d]/10 p-3 text-xs font-bold text-[#ff8aa0]">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={()=>{setConfirming(false);setTransactionPin("");setError("");}} disabled={submitting} className="rounded-2xl border border-white/[.08] bg-black/25 py-3.5 text-xs font-black text-slate-300 disabled:opacity-60">Cancel</button>
          <button onClick={confirmWithdrawal} disabled={submitting||transactionPin.length!==6} className="rounded-2xl bg-[#18ff8a] py-3.5 text-xs font-black text-[#050608] disabled:opacity-60">{submitting?"Submitting...":"Confirm Withdrawal"}</button>
        </div>
      </section>:<section className="profile-glass mt-2 rounded-[22px] p-4">
        {success&&<div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#18ff8a]/30 bg-[#18ff8a]/10 p-3 text-sm font-bold text-[#18ff8a]"><CheckCircle2 size={18}/>{success}</div>}
        <label className="block text-xs font-bold text-slate-400">Wallet<select value={walletType} onChange={event=>{setWalletType(event.target.value as WalletType);resetError();}} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"><option value="SPOT">Spot Wallet</option><option value="BITEX">AI Wallet</option></select></label>
        {locked&&<div className="mt-3 rounded-2xl border border-[#624e1a] bg-[#2a2412] p-3 text-xs leading-5 text-[#c9b98d]">AI withdrawal will unlock after completing 2x copy trade income.</div>}
        <label className="mt-4 block text-xs font-bold text-slate-400">Amount</label>
        <div className={`mt-2 flex items-center rounded-2xl border bg-black/25 ${error?"border-[#ff4f6d]/60":"border-white/[.08] focus-within:border-[#18ff8a]/50"}`}>
          <input inputMode="decimal" value={amount} onChange={event=>{setAmount(event.target.value);resetError();}} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-white outline-none"/>
          <button type="button" onClick={()=>{setAmount(available.toFixed(2));resetError();}} className="px-4 text-xs font-black text-[#18ff8a]">MAX</button>
          <span className="pr-4 text-xs text-slate-500">USDT</span>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">Available: {available.toFixed(2)} USDT</p>
        <label className="mt-4 block text-xs font-bold text-slate-400">External wallet or exchange address<input value={address} onChange={event=>{setAddress(event.target.value);resetError();}} placeholder="0x... or exchange deposit address" className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"/></label>
        <label className="mt-4 block text-xs font-bold text-slate-400">Network<select value={network} onChange={event=>{setNetwork(event.target.value);resetError();}} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"><option value="BSC">BNB Smart Chain (BEP20)</option><option value="TRON">TRON (TRC20)</option><option value="ETH">Ethereum (ERC20)</option></select></label>
        <div className="mt-4 space-y-2 rounded-2xl border border-white/[.08] bg-black/25 p-4">
          <LineItem label="Amount" value={`${value.toFixed(2)} USDT`}/>
          <LineItem label="Fixed fee" value={`${fixedFee.toFixed(2)} USDT`}/>
          <LineItem label="5% fee" value={`${percentageFee.toFixed(2)} USDT`}/>
          <LineItem label="Total fee" value={`${totalFee.toFixed(2)} USDT`}/>
          <LineItem label="Receivable amount" value={`${received.toFixed(2)} USDT`}/>
          <LineItem label="Status" value="Pending admin approval"/>
        </div>
        {error&&<p className="mt-3 rounded-2xl border border-[#ff4f6d]/30 bg-[#ff4f6d]/10 p-3 text-xs font-bold text-[#ff8aa0]">{error}</p>}
        <div className="sticky bottom-0 -mx-4 mt-5 border-t border-white/[.08] bg-[#111c18]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
          <button onClick={openConfirmation} className="w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608]">Submit</button>
        </div>
      </section>}
    </div>
  </main>;
}

function LineItem({label,value}:{label:string;value:string}) {
  return <div className="flex items-start justify-between gap-4 text-xs"><span className="shrink-0 text-slate-500">{label}</span><span className="min-w-0 break-words text-right font-bold text-slate-200">{value}</span></div>;
}
