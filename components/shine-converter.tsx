"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Decimal from "decimal.js";
import { ArrowDown, CheckCircle2, X } from "lucide-react";

type ConverterState={rate:string;balances:{usdt:string;shine:string}};

export function ShineConverter(){
  const [amount,setAmount]=useState("");
  const [data,setData]=useState<ConverterState>({rate:"1",balances:{usdt:"0",shine:"0"}});
  const [loading,setLoading]=useState(true),[confirming,setConfirming]=useState(false),[submitting,setSubmitting]=useState(false);
  const [error,setError]=useState(""),[success,setSuccess]=useState("");
  const load=useCallback(async()=>{const response=await fetch("/api/convert/shine",{cache:"no-store"});const body=await response.json().catch(()=>({}));if(response.ok)setData(body);else setError(body.error||"Unable to load converter");setLoading(false);},[]);
  useEffect(()=>{void load();},[load]);
  const parsed=useMemo(()=>{try{return new Decimal(amount||0);}catch{return new Decimal(0);}},[amount]);
  const rate=useMemo(()=>{try{return new Decimal(data.rate||1);}catch{return new Decimal(1);}},[data.rate]);
  const receive=parsed.div(rate);
  const formattedAmount=decimalLabel(parsed),formattedReceive=decimalLabel(receive);
  const review=()=>{setError("");setSuccess("");if(parsed.lte(0)){setError("Amount must be greater than 0");return;}if(parsed.gt(new Decimal(data.balances.usdt||0))){setError("Insufficient USDT balance");return;}setConfirming(true);};
  const confirm=async()=>{if(submitting)return;setSubmitting(true);const response=await fetch("/api/convert/shine",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:parsed.toString(),idempotencyKey:crypto.randomUUID()})});const body=await response.json().catch(()=>({}));setSubmitting(false);if(!response.ok){setConfirming(false);setError(body.error||"Conversion failed");return;}setConfirming(false);setAmount("");setSuccess(`${formattedAmount} USDT converted to ${formattedReceive} SHINE.`);await load();};
  return <section className="shine-converter-card" aria-labelledby="converter-title">
    <div className="shine-converter-head"><div><p>Converter</p><h2 id="converter-title">Convert USDT → SHINE</h2></div><span>Spot Wallet</span></div>
    <label className="shine-converter-field"><span>USDT Amount</span><div><input value={amount} onChange={e=>{if(/^\d*(?:\.\d{0,18})?$/.test(e.target.value))setAmount(e.target.value)}} inputMode="decimal" placeholder="0.00" aria-label="USDT Amount"/><b>USDT</b></div></label>
    <button type="button" className="shine-swap" disabled aria-label="Swap direction unavailable"><ArrowDown size={18}/></button>
    <label className="shine-converter-field"><span>SHINE Amount</span><div><input value={parsed.gt(0)?formattedReceive:""} readOnly placeholder="0.00" aria-label="SHINE Amount"/><b>SHINE</b></div></label>
    <dl className="shine-converter-summary"><div><dt>Exchange Rate</dt><dd>1 SHINE = {decimalLabel(rate)} USDT</dd></div><div><dt>Available Balance</dt><dd>USDT: {loading?"—":decimalLabel(new Decimal(data.balances.usdt||0))}</dd></div><div><dt>You Will Receive</dt><dd>{formattedReceive} SHINE</dd></div></dl>
    {error&&<p className="shine-converter-message is-error" role="alert">{error}</p>}{success&&<div className="shine-converter-message is-success" role="status"><CheckCircle2 size={17}/><span><b>Conversion Successful</b>{success}</span></div>}
    <button type="button" className="shine-convert-button" disabled={loading||submitting} onClick={review}>Convert Now</button>
    {confirming&&<div className="shine-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="shine-confirm-title"><div className="shine-confirm-dialog"><button className="shine-confirm-close" onClick={()=>setConfirming(false)} aria-label="Close"><X size={18}/></button><h3 id="shine-confirm-title">Confirm Conversion</h3><div><p>Convert <b>{formattedAmount} USDT</b></p><p>Receive <b>{formattedReceive} SHINE</b></p></div><footer><button onClick={()=>setConfirming(false)} disabled={submitting}>Cancel</button><button onClick={confirm} disabled={submitting}>{submitting?"Converting…":"Confirm"}</button></footer></div></div>}
  </section>;
}

function decimalLabel(value:Decimal){if(!value.isFinite())return "0";return value.toFixed(18).replace(/\.?0+$/,"")||"0";}
