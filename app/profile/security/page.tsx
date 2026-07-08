"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { TransactionPinInput } from "@/components/transaction-pin-input";

type SessionInfo = { id: string; createdAt: string; expiresAt: string };
type TransactionPinStatus = { isSet: boolean; setAt: string | null };

export default function SecurityPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [pinStatus, setPinStatus] = useState<TransactionPinStatus>({ isSet: false, setAt: null });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSecurity = () => {
    fetch("/api/profile/security").then(async response => {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile/security")}`);
        return;
      }
      if (response.ok) {
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        setPinStatus(data.transactionPin ?? { isSet: false, setAt: null });
      }
    }).catch(() => {});
  };

  useEffect(() => { loadSecurity(); }, []);

  const change = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const response = await fetch("/api/profile/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "Password change failed");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Password changed");
  };

  const logoutAll = async () => {
    setError("");
    setLoading(true);
    const response = await fetch("/api/profile/security", { method: "DELETE" });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Logout all failed");
      return;
    }
    window.location.replace("/auth?mode=login");
  };

  return <Frame title="Security" icon={LockKeyhole}>
    <form onSubmit={change} className="profile-glass rounded-[22px] p-4">
      <h2 className="text-lg font-black">Change password</h2>
      <div className="mt-4 space-y-3">
        <Password label="Current password" value={currentPassword} onChange={setCurrentPassword} />
        <Password label="New password" value={newPassword} onChange={setNewPassword} />
        <Password label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} />
      </div>
      {(error || message) && <p className={`mt-3 text-xs font-bold ${error ? "text-[#ff4f6d]" : "text-[#18ff8a]"}`}>{error || message}</p>}
      <button disabled={loading} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{loading ? "Working..." : "Change Password"}</button>
    </form>
    <TransactionPinSection status={pinStatus} refreshed={loadSecurity} />
    <section className="profile-glass mt-4 rounded-[22px] p-4">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#18ff8a]/10 text-[#18ff8a]"><ShieldCheck size={18} /></span><div><h2 className="font-black">Active sessions</h2><p className="text-xs text-slate-500">{sessions.length} active session(s)</p></div></div>
      <div className="mt-3 space-y-2">{sessions.map(session => <div key={session.id} className="rounded-2xl border border-white/[.08] bg-black/25 p-3 text-xs text-slate-400"><p className="font-bold text-white">Session {session.id.slice(-6)}</p><p>Created {new Date(session.createdAt).toLocaleString()}</p><p>Expires {new Date(session.expiresAt).toLocaleString()}</p></div>)}</div>
      <button onClick={logoutAll} disabled={loading} className="mt-4 w-full rounded-2xl border border-[#ff4f6d]/30 bg-[#ff4f6d]/10 py-3.5 text-sm font-black text-[#ff8aa0] disabled:opacity-60">Logout from all devices</button>
    </section>
  </Frame>;
}

function TransactionPinSection({ status, refreshed }: { status: TransactionPinStatus; refreshed: () => void }) {
  const [mode, setMode] = useState<"create" | "change" | "forgot">(status.isSet ? "change" : "create");
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setMode(status.isSet ? "change" : "create"); }, [status.isSet]);

  const reset = () => {
    setCurrentPin("");
    setPin("");
    setConfirmPin("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!/^\d{6}$/.test(pin) || !/^\d{6}$/.test(confirmPin) || (mode === "change" && !/^\d{6}$/.test(currentPin))) {
      setError(pin || confirmPin || currentPin ? "Enter a valid 6-digit Transaction PIN." : "Transaction PIN required.");
      return;
    }
    if (pin !== confirmPin) {
      setError("Transaction PIN confirmation must match.");
      return;
    }
    setLoading(true);
    const endpoint = mode === "create" ? "/api/profile/transaction-pin/create" : "/api/profile/transaction-pin/change";
    const body = mode === "create" ? { pin, confirmPin } : { currentPin, newPin: pin, confirmPin };
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "Transaction PIN update failed");
      reset();
      return;
    }
    reset();
    setMessage(mode === "create" ? "Transaction PIN created" : "Transaction PIN changed");
    refreshed();
  };

  return <section className="profile-glass mt-4 rounded-[22px] p-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black">Transaction PIN</h2><p className="mt-1 text-xs text-slate-500">{status.isSet && status.setAt ? `Created ${new Date(status.setAt).toLocaleDateString()}` : "Required for P2P transfers and withdrawals"}</p></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black ${status.isSet ? "border-[#18ff8a]/25 bg-[#18ff8a]/10 text-[#18ff8a]" : "border-white/[.08] bg-black/25 text-slate-400"}`}>{status.isSet ? "Set" : "Not set"}</span></div>
    <div className="mt-4 grid grid-cols-3 gap-2">
      <button type="button" onClick={() => { setMode("create"); setError(""); setMessage(""); }} disabled={status.isSet} className={`rounded-xl border py-2.5 text-[11px] font-black disabled:opacity-40 ${mode === "create" ? "border-[#18ff8a]/40 bg-[#18ff8a]/10 text-[#18ff8a]" : "border-white/[.08] bg-black/25 text-slate-400"}`}>Create</button>
      <button type="button" onClick={() => { setMode("change"); setError(""); setMessage(""); }} disabled={!status.isSet} className={`rounded-xl border py-2.5 text-[11px] font-black disabled:opacity-40 ${mode === "change" ? "border-[#18ff8a]/40 bg-[#18ff8a]/10 text-[#18ff8a]" : "border-white/[.08] bg-black/25 text-slate-400"}`}>Change</button>
      <button type="button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }} className={`rounded-xl border py-2.5 text-[11px] font-black ${mode === "forgot" ? "border-[#18ff8a]/40 bg-[#18ff8a]/10 text-[#18ff8a]" : "border-white/[.08] bg-black/25 text-slate-400"}`}>Forgot</button>
    </div>
    {mode === "forgot" ? <div className="mt-4 rounded-2xl border border-white/[.08] bg-black/25 p-4 text-sm font-bold leading-6 text-slate-300">Please contact support to reset your Transaction PIN.</div> : <form onSubmit={submit} className="mt-4 space-y-3">
      {mode === "change" && <TransactionPinInput label="Current PIN" value={currentPin} onChange={setCurrentPin} autoFocus />}
      <TransactionPinInput label={mode === "create" ? "6 digit PIN" : "New 6 digit PIN"} value={pin} onChange={setPin} autoFocus={mode === "create"} />
      <TransactionPinInput label={mode === "create" ? "Confirm 6 digit PIN" : "Confirm New PIN"} value={confirmPin} onChange={setConfirmPin} />
      {(error || message) && <p className={`text-xs font-bold ${error ? "text-[#ff4f6d]" : "text-[#18ff8a]"}`}>{error || message}</p>}
      <button disabled={loading || pin.length !== 6 || confirmPin.length !== 6 || (mode === "change" && currentPin.length !== 6)} className="w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{loading ? "Working..." : mode === "create" ? "Create Transaction PIN" : "Change Transaction PIN"}</button>
    </form>}
  </section>;
}

function Frame({ title, icon: Icon, children }: { title: string; icon: typeof LockKeyhole; children: React.ReactNode }) {
  return <main className="profile-page min-h-screen px-4 py-4 text-white sm:px-6"><div className="mx-auto max-w-2xl"><header className="profile-glass rounded-[22px] p-4"><div className="flex items-center justify-between"><Link href="/profile" className="grid h-10 w-10 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-[#18ff8a]"><ArrowLeft size={18} /></Link><div className="grid h-10 w-10 place-items-center rounded-xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]"><Icon size={18} /></div></div><h1 className="mt-5 text-2xl font-black">{title}</h1></header><div className="mt-4">{children}</div></div></main>;
}

function Password({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-bold text-slate-400">{label}<input type="password" value={value} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50" /></label>;
}
