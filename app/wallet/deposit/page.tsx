"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy } from "lucide-react";

type DepositResult = {
  id: string;
  amount: number;
  asset: string;
  network: string;
  networkName: string;
  providerPaymentId: string | null;
  providerInvoiceId: string | null;
  providerPaymentUrl: string | null;
  payCurrency: string | null;
  payAddress: string | null;
  paymentStatus: string | null;
  addressMode: "PERMANENT" | "PER_PAYMENT";
  expiresAt: string | null;
  actuallyPaid: number | null;
  outcomeAmount: number | null;
  status: string;
  creditedAt: string | null;
  createdAt: string;
};

export default function WalletDepositPage() {
  const router=useRouter();
  const [amount,setAmount]=useState("");
  const [network,setNetwork]=useState("BSC");
  const [payCurrency,setPayCurrency]=useState("usdtbsc");
  const [error,setError]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [deposit,setDeposit]=useState<DepositResult|null>(null);
  const [creditedDeposit,setCreditedDeposit]=useState<DepositResult|null>(null);
  const clientRequestIdRef=useRef<string|null>(null);
  const submittingRef=useRef(false);
  const value=Number(amount);
  const payAddress=deposit?.payAddress??"";
  const qrValue=payAddress||deposit?.providerPaymentId||"";

  useEffect(()=>{
    if(!deposit||["COMPLETED","FAILED","EXPIRED","REVIEW_REQUIRED","UNDERPAID","OVERPAID"].includes(deposit.status))return;
    let stopped=false;
    const poll=async()=>{
      try{
        const response=await fetch(`/api/deposits/nowpayments/status/${deposit.id}`,{credentials:"include",cache:"no-store"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok||stopped)return;
        const current=data.deposit as DepositResult;
        setDeposit(current);
        if(current.status==="COMPLETED"&&current.creditedAt){
          const key=`nowpayments-credit-ack:${current.id}:${current.creditedAt}`;
          if(!sessionStorage.getItem(key)){
            sessionStorage.setItem(key,"1");
            setCreditedDeposit(current);
            window.setTimeout(()=>setCreditedDeposit(value=>value?.id===current.id?null:value),10000);
          }
          await Promise.allSettled([
            fetch("/api/assets",{credentials:"include",cache:"no-store"}),
            fetch("/api/wallet/history",{credentials:"include",cache:"no-store"}),
          ]);
          router.refresh();
        }
      }catch{}
    };
    void poll();
    const timer=window.setInterval(poll,4000);
    return()=>{stopped=true;window.clearInterval(timer);};
  },[deposit?.id,deposit?.status,deposit?.creditedAt,router]);

  const changeNetwork=(next:string)=>{
    setNetwork(next);
    setPayCurrency(next==="TRON"?"usdttrc20":"usdtbsc");
    setError("");
    clientRequestIdRef.current=null;
  };

  const submit=async()=>{
    if(submittingRef.current)return;
    setError("");
    if(value<=0){setError("Enter a valid deposit amount");return;}
    if(value<10){setError("Minimum deposit is 10 USDT.");return;}
    submittingRef.current=true;
    setSubmitting(true);
    clientRequestIdRef.current??=crypto.randomUUID();
    let response:Response;
    try{
      response=await fetch("/api/deposits/nowpayments/create",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:value,network,payCurrency,clientRequestId:clientRequestIdRef.current})});
    }catch{
      submittingRef.current=false;
      setSubmitting(false);
      setError("Unable to create the deposit address right now. Please try again shortly.");
      return;
    }
    const data=await response.json().catch(()=>({}));
    submittingRef.current=false;
    setSubmitting(false);
    if(response.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/wallet/deposit")}`);return;}
    if(!response.ok){setError(data.error||"NOWPayments deposit failed");return;}
    setDeposit(data.deposit as DepositResult);
  };

  const copyPayment=async()=>{
    setError("");
    if(!payAddress){setError("Payment address unavailable");return;}
    await navigator.clipboard?.writeText(payAddress);
  };

  return <main className="profile-page min-h-screen overflow-x-hidden px-4 py-3 text-white sm:px-6">
    {creditedDeposit&&<div role="dialog" aria-modal="true" aria-labelledby="deposit-success-title" className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl border border-[#18ff8a]/25 bg-[#111c18] p-6 shadow-2xl"><button onClick={()=>setCreditedDeposit(null)} aria-label="Close" className="float-right text-xl text-slate-400">×</button><h2 id="deposit-success-title" className="text-2xl font-black text-white">Congratulations!</h2><p className="mt-2 text-sm text-slate-300">Your deposit has been successfully credited.</p><div className="mt-5 space-y-3 rounded-2xl border border-white/[.08] bg-black/25 p-4"><LineItem label="Amount Credited" value={`${(creditedDeposit.actuallyPaid??0).toFixed(2)} ${creditedDeposit.asset}`}/><LineItem label="Wallet" value="Spot Wallet"/><LineItem label="Network" value={creditedDeposit.networkName}/><LineItem label="Status" value="Completed"/></div></div></div>}
    <div className="mx-auto max-w-2xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="flex h-12 items-center gap-3">
        <Link href="/dashboard?view=wallet" className="grid h-10 w-10 place-items-center text-white" aria-label="Back to wallet"><ArrowLeft size={22}/></Link>
        <h1 className="text-xl font-black">Deposit</h1>
      </header>

      <section className="profile-glass mt-2 rounded-[22px] p-4">
        {deposit?<>
          <div className="mx-auto my-5 grid h-44 w-44 place-items-center rounded-2xl bg-white p-3">
            {qrValue?<img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrValue)}`} alt="NOWPayments payment QR code" className="h-full w-full object-contain"/>:<div className="grid h-full w-full place-items-center bg-[#07130f] p-2 text-center text-[10px] font-bold text-slate-500">Payment QR unavailable</div>}
          </div>
          <div className="space-y-2 rounded-2xl border border-white/[.08] bg-black/25 p-4 text-xs">
            <LineItem label="Payment ID" value={deposit.providerPaymentId??"Pending"}/>
            <LineItem label="Status" value={deposit.paymentStatus??deposit.status}/>
            <LineItem label="Amount" value={`${deposit.amount.toFixed(2)} ${deposit.asset}`}/>
            <LineItem label="Pay currency" value={deposit.payCurrency??payCurrency.toUpperCase()}/>
            <LineItem label="Network" value={deposit.networkName}/>
            <LineItem label="Pay address" value={payAddress||"Payment address unavailable"}/>
            {deposit.expiresAt&&<LineItem label="Expires" value={new Date(deposit.expiresAt).toLocaleString()}/>}
          </div>
          <button onClick={copyPayment} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/[.08] bg-black/25 p-3 text-left">
            <span className="min-w-0 flex-1 break-all text-xs text-slate-300">{payAddress||"Payment address unavailable"}</span>
            <Copy size={16} className="shrink-0 text-[#18ff8a]"/>
          </button>
        </>:<>
          <label className="block text-xs font-bold text-slate-400">Amount<input inputMode="decimal" value={amount} onChange={event=>{setAmount(event.target.value);setError("");clientRequestIdRef.current=null;}} placeholder="0.00" className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"/></label>
          <label className="mt-4 block text-xs font-bold text-slate-400">Network<select value={network} onChange={event=>changeNetwork(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"><option value="BSC">BNB Smart Chain (BEP20)</option><option value="TRON">TRON (TRC20)</option></select></label>
          <label className="mt-4 block text-xs font-bold text-slate-400">Payment currency<select value={payCurrency} onChange={event=>{setPayCurrency(event.target.value);setError("");clientRequestIdRef.current=null;}} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50"><option value="usdtbsc">USDT BSC</option><option value="usdttrc20">USDT TRC20</option></select></label>
        </>}
        {error&&<p className="mt-3 rounded-2xl border border-[#ff4f6d]/30 bg-[#ff4f6d]/10 p-3 text-xs font-bold text-[#ff8aa0]">{error}</p>}
        {!deposit&&<div className="sticky bottom-0 -mx-4 mt-5 border-t border-white/[.08] bg-[#111c18]/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
          <button onClick={submit} disabled={submitting} className="w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{submitting?"Creating...":"Create Deposit"}</button>
        </div>}
      </section>
    </div>
  </main>;
}

function LineItem({label,value}:{label:string;value:string}) {
  return <div className="flex items-start justify-between gap-4 text-xs"><span className="shrink-0 text-slate-500">{label}</span><span className="min-w-0 break-words text-right font-bold text-slate-200">{value}</span></div>;
}
