"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { ProfilePageHeader } from "@/components/profile-page-header";

type AiStatus = {
  price: number;
  validityDays: number;
  subscription: null | { id: string; amount: number; startsAt: string; expiresAt: string; active: boolean; remainingDays: number };
};

const activeAiSubscriptionMessage = "You already have an active AI Subscription. You can buy again after it expires.";

export default function AiSubscriptionPage() {
  const router = useRouter();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = () => fetch("/api/ai/subscription", { cache: "no-store", credentials: "include" })
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/ai-subscription")}`);
        return;
      }
      if (!response.ok) throw new Error(data.error || "AI subscription request failed");
      setStatus(data);
    })
    .catch(error => setError(error instanceof Error ? error.message : "AI subscription request failed"));

  useEffect(() => { load(); }, []);

  const purchase = () => {
    setError("");
    setMessage("");
    if (status?.subscription?.active) {
      setError(activeAiSubscriptionMessage);
      return;
    }
    setConfirming(true);
  };

  const cancelPurchase = () => {
    setConfirming(false);
    setError("");
    setMessage("");
  };

  const confirmPurchase = async () => {
    setError("");
    setMessage("");
    setLoading(true);
    const idempotencyKey = crypto.randomUUID();
    const response = await fetch("/api/ai/subscription/purchase", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ idempotencyKey }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    setConfirming(false);
    if (!response.ok) {
      setError(data.code === "ACTIVE_SUBSCRIPTION_EXISTS" ? activeAiSubscriptionMessage : data.error || "Purchase failed");
      return;
    }
    setMessage("AI subscription active");
    load();
  };

  const sub = status?.subscription;
  return <main className="profile-page min-h-screen px-4 py-4 text-white sm:px-6">
    <div className="mx-auto max-w-2xl">
      <ProfilePageHeader title="AI Subscription" icon={Bot}/>

      <section className="profile-glass mt-4 rounded-[22px] p-4">
        <div className="grid grid-cols-2 gap-3">
          <Info label="Status" value={sub?.active ? "Active" : "Inactive"} />
          <Info label="Price" value={`$${Number(status?.price ?? 15).toFixed(2)}`} />
          <Info label="Valid till" value={sub ? new Date(sub.expiresAt).toLocaleDateString() : "--"} />
          <Info label="Remaining" value={sub ? `${sub.remainingDays} days` : "0 days"} />
        </div>
        {(error || message) && <p className={`mt-3 text-xs font-bold ${error ? "text-[#ff4f6d]" : "text-[#18ff8a]"}`}>{error || message}</p>}
        {confirming && <div className="mt-4 rounded-2xl border border-[#18ff8a]/20 bg-[#18ff8a]/[.06] p-3">
          <p className="text-sm font-bold text-white">Do you want to buy AI Subscription for $15 for 30 days?</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={cancelPurchase} disabled={loading} className="rounded-xl border border-white/[.08] bg-black/25 py-3 text-xs font-black text-slate-300 disabled:opacity-60">Cancel</button>
            <button onClick={confirmPurchase} disabled={loading} className="rounded-xl bg-[#18ff8a] py-3 text-xs font-black text-[#050608] disabled:opacity-60">{loading ? "Working..." : "Confirm"}</button>
          </div>
        </div>}
        <button onClick={purchase} disabled={loading || confirming} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{loading ? "Working..." : sub?.active ? "Manage" : "Purchase AI"}</button>
      </section>

      <section className="profile-glass mt-4 rounded-[22px] p-4">
        <h2 className="text-lg font-black">Subscription history</h2>
        {sub ? <div className="mt-3 rounded-2xl border border-white/[.08] bg-black/25 p-3">
          <p className="font-bold text-white">Current subscription</p>
          <p className="mt-1 text-xs text-slate-400">Started {new Date(sub.startsAt).toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate-400">Amount ${sub.amount.toFixed(2)}</p>
        </div> : <p className="mt-3 rounded-2xl border border-white/[.08] bg-black/25 p-6 text-center text-sm text-slate-500">No subscription history available</p>}
      </section>
    </div>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/[.08] bg-black/25 p-3">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-black text-white">{value}</p>
  </div>;
}
