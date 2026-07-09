"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Network, RefreshCw } from "lucide-react";
import { usd } from "@/lib/format";

type TeamTreeMember = {
  id: string;
  name: string;
  email: string;
  uid: string;
  level: number;
  vipRank: string;
  depositedAmount: number;
  aiWalletActiveAmount: number;
  status: string;
  joinedAt: string;
  hasChildren: boolean;
};

type TreeNode = TeamTreeMember & {
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
  loaded?: boolean;
};

function joinedLabel(value: string) {
  const joined = new Date(value);
  if (Number.isNaN(joined.getTime())) return "recently";
  return joined.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TopUpTeamPage() {
  const [members,setMembers]=useState<TreeNode[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const loadRoot=()=> {
    setLoading(true);
    setError("");
      fetch("/api/team/tree?mode=top-up", { cache: "no-store", credentials: "include" })
      .then(response=>response.ok?response.json():Promise.reject())
      .then(data=>setMembers(Array.isArray(data.members)?data.members.map(toNode):[]))
      .catch(()=>{setMembers([]);setError("Top-up team unavailable");})
      .finally(()=>setLoading(false));
  };

  useEffect(()=>{loadRoot();},[]);

  const loadChildren=async(parentId:string)=>{
    setMembers(nodes=>updateNode(nodes,parentId,node=>({...node,loading:true})));
    try {
      const response=await fetch(`/api/team/tree?mode=top-up&parentUserId=${encodeURIComponent(parentId)}`, { cache: "no-store", credentials: "include" });
      if(!response.ok) throw new Error("request failed");
      const data=await response.json();
      const children=Array.isArray(data.members)?data.members.map(toNode):[];
      setMembers(nodes=>updateNode(nodes,parentId,node=>({...node,children,expanded:true,loaded:true,loading:false,hasChildren:children.length>0})));
    } catch {
      setMembers(nodes=>updateNode(nodes,parentId,node=>({...node,loading:false,loaded:true,expanded:true,children:[]})));
    }
  };

  const toggleNode=(node:TreeNode)=>{
    if(node.expanded){
      setMembers(nodes=>updateNode(nodes,node.id,item=>({...item,expanded:false})));
      return;
    }
    if(node.loaded){
      setMembers(nodes=>updateNode(nodes,node.id,item=>({...item,expanded:true})));
      return;
    }
    loadChildren(node.id);
  };

  return <main className="min-h-screen bg-ink px-4 pb-8 pt-4 text-white sm:px-6">
    <div className="mx-auto max-w-4xl">
      <header className="rounded-3xl border border-lime/20 bg-gradient-to-br from-[#18291f] to-panel p-4 shadow-[0_18px_60px_rgba(0,0,0,.35)] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/5 text-lime" aria-label="Back to My Network"><ArrowLeft size={18}/></Link>
          <button onClick={loadRoot} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/5 text-slate-300 disabled:opacity-50" aria-label="Refresh Top-up Team"><RefreshCw size={17}/></button>
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="mt-1 text-2xl font-black">Top-up Team</h1>
          </div>
          <div className="hidden rounded-2xl border border-lime/20 bg-lime/10 p-3 text-lime sm:block"><Network size={24}/></div>
        </div>
      </header>

      <section className="mt-5 space-y-3">
        {loading?<div className="rounded-2xl border border-line bg-panel p-5 text-xs text-slate-500">Loading top-up team...</div>:error?<div className="rounded-2xl border border-line bg-panel p-5 text-xs text-danger">{error}</div>:members.length?members.map(member=><TeamNodeCard key={member.id} node={member} depth={0} onToggle={toggleNode}/>):<div className="rounded-2xl border border-line bg-panel p-6 text-center text-sm text-slate-500">No referrals found</div>}
      </section>
    </div>
  </main>;
}

function TeamNodeCard({node,depth,onToggle}:{node:TreeNode;depth:number;onToggle:(node:TreeNode)=>void}) {
  return <div className={depth>0?"border-l border-lime/25 pl-3 sm:pl-4":""}>
    <article className="rounded-2xl border border-line bg-panel/95 p-4 shadow-[0_14px_40px_rgba(0,0,0,.25)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-black text-white">{node.name}</h2>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-bold text-slate-400">L{node.level}</span>
            <span className="rounded bg-lime/10 px-1.5 py-0.5 text-[9px] font-bold text-lime">{node.vipRank}</span>
          </div>
          <p className="mt-1 truncate text-[10px] text-slate-500">{node.email}</p>
          <p className="mt-1 truncate text-[10px] text-slate-500">UID {node.uid}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${node.status==="Active"?"bg-lime/10 text-lime":"bg-white/5 text-slate-500"}`}>{node.status}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Metric label="Deposited" value={usd(node.depositedAmount)}/>
        <Metric label="AI Wallet" value={usd(node.aiWalletActiveAmount)}/>
        <Metric label="Joined" value={joinedLabel(node.joinedAt)}/>
        <Metric label="Level" value={`L${node.level}`}/>
      </div>
      <div className="mt-4 flex justify-end">
        {node.hasChildren||node.loaded?<button onClick={()=>onToggle(node)} disabled={node.loading} className="flex items-center gap-1 rounded-xl border border-lime/25 bg-lime/10 px-3 py-2 text-[10px] font-black text-lime disabled:opacity-60">{node.loading?"Loading...":node.expanded?"Hide":"View More"} {node.expanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>:<span className="text-[10px] font-bold text-slate-600">No direct top-up referrals</span>}
      </div>
    </article>
    {node.expanded&&node.children&&<div className="mt-3 space-y-3">{node.children.length?node.children.map(child=><TeamNodeCard key={child.id} node={child} depth={depth+1} onToggle={onToggle}/>):<div className="rounded-2xl border border-line bg-white/[.03] p-4 text-xs text-slate-500">No referrals found</div>}</div>}
  </div>;
}

function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-xl border border-line bg-ink/50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{label}</p><p className="mt-1 truncate text-xs font-black text-white">{value}</p></div>;
}

function toNode(member:TeamTreeMember):TreeNode {
  return { ...member, children: [], expanded: false, loading: false, loaded: false };
}

function updateNode(nodes:TreeNode[], id:string, update:(node:TreeNode)=>TreeNode):TreeNode[] {
  return nodes.map(node=>{
    if(node.id===id) return update(node);
    if(node.children?.length) return { ...node, children: updateNode(node.children, id, update) };
    return node;
  });
}
