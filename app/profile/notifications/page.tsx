"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";
import { promotionNotificationDetails } from "@/lib/notification-display";

type Notification={id:string;type?:string;title:string;message:string;metadata?:unknown;createdAt:string;readAt:string|null;unread:boolean};

export default function NotificationsPage(){
  const router=useRouter();
  const [items,setItems]=useState<Notification[]>([]),[unread,setUnread]=useState(0),[error,setError]=useState("");
  const load=()=>fetch("/api/notifications",{cache:"no-store",credentials:"include"}).then(async r=>{const d=await r.json().catch(()=>({}));if(r.status===401){router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/notifications")}`);return;}if(!r.ok)throw new Error(d.error||"Notifications failed");setItems(Array.isArray(d.notifications)?d.notifications:[]);setUnread(Number(d.unreadCount??0));}).catch(e=>setError(e instanceof Error?e.message:"Notifications failed"));
  useEffect(()=>{load();const timer=window.setInterval(load,30000);return()=>window.clearInterval(timer);},[]);
  const markRead=async()=>{await fetch("/api/notifications/read",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});load();};
  return <main className="profile-page min-h-screen px-4 py-4 text-white sm:px-6"><div className="mx-auto max-w-2xl"><header className="profile-glass rounded-[22px] p-4"><div className="flex items-center justify-between"><Link href="/profile" className="grid h-10 w-10 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-[#18ff8a]"><ArrowLeft size={18}/></Link><div className="grid h-10 w-10 place-items-center rounded-xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]"><Bell size={18}/></div></div><h1 className="mt-5 text-2xl font-black">Notifications</h1><p className="mt-1 text-sm text-slate-500">{unread?`${unread} unread`:"All caught up"}</p></header><section className="profile-glass mt-4 rounded-[22px] p-4">{unread>0&&<button onClick={markRead} className="mb-3 w-full rounded-2xl border border-[#18ff8a]/25 bg-[#18ff8a]/10 py-3 text-xs font-black text-[#18ff8a]">Mark as read</button>}{error&&<p className="text-xs text-[#ff4f6d]">{error}</p>}<div className="space-y-2">{items.length?items.map(n=>{const target=notificationTarget(n);const details=promotionNotificationDetails(n.metadata);return <div key={n.id} onClick={()=>{if(target)router.push(target);}} className={`rounded-2xl border border-white/[.08] p-3 ${target?"cursor-pointer":""} ${n.unread?"bg-[#18ff8a]/10":"bg-black/25"}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 rounded-full ${n.unread?"bg-[#18ff8a]":"bg-slate-700"}`}/><div className="min-w-0 flex-1"><p className="font-bold text-white">{n.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{n.message}</p>{details.length>0&&<div className="mt-2 space-y-0.5 text-[10px] text-slate-500">{details.map(detail=><p key={detail}>{detail}</p>)}</div>}<p className="mt-2 text-[10px] text-slate-600">{new Date(n.createdAt).toLocaleString()}</p></div></div></div>}):<p className="rounded-2xl border border-white/[.08] bg-black/25 p-6 text-center text-sm text-slate-500">No notifications</p>}</div></section></div></main>;
}

function notificationTarget(notification:Notification){
  const metadata=notification.metadata;
  if(metadata&&typeof metadata==="object"&&!Array.isArray(metadata)&&"href" in metadata&&typeof metadata.href==="string")return metadata.href;
  return notification.type==="KYC_STATUS"?"/kyc":null;
}
