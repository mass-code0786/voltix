"use client";

import { useEffect,useState } from "react";

export function CoinMark({ symbol, color, logoPath, size = "md" }: { symbol: string; color: string; logoPath?:string|null; size?: "sm" | "md" | "lg" }) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[logoPath]);
  const dimensions = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-6 w-6 text-[8px]" : "h-10 w-10 text-xs";
  if(logoPath&&!failed)return <span className={`${dimensions} grid shrink-0 place-items-center overflow-hidden rounded-full bg-white/5 p-[2px]`}><img src={logoPath} alt={`${symbol} logo`} className="h-full w-full object-contain" onError={()=>setFailed(true)}/></span>;
  return <div className={`${dimensions} grid shrink-0 place-items-center rounded-full font-black text-white`} style={{ background: `linear-gradient(145deg, ${color}, ${color}99)`, boxShadow: `0 6px 18px ${color}26` }}>{symbol.slice(0, 1)}</div>;
}
