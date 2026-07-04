"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { SearchableSelect } from "@/components/searchable-select";
import { countryOptions, languageOptions } from "@/lib/profile-options";

type AuthMode = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [returnTo, setReturnTo] = useState("/");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("United States");
  const [language, setLanguage] = useState("en");
  const [referralCode, setReferralCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMode(params.get("mode") === "register" ? "register" : "login");
    const next = params.get("returnTo") || "/";
    setReturnTo(next.startsWith("/") && !next.startsWith("/auth") ? next : "/");
  }, []);

  const switchMode = (nextMode: AuthMode) => {
    setError("");
    setMode(nextMode);
    const params = new URLSearchParams(window.location.search);
    params.set("mode", nextMode);
    params.set("returnTo", returnTo);
    window.history.replaceState({}, "", `/auth?${params.toString()}`);
  };

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(returnTo);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register"
        ? { name, email, country, language, referralCode, password, confirmPassword }
        : { email, password };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Authentication failed");
      await refreshAuthenticatedData();
      router.replace(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <main className="min-h-screen bg-[#08100d] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between py-3">
          <button onClick={goBack} aria-label="Go back" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel text-slate-300">
            <ArrowLeft size={20} />
          </button>
          <button onClick={() => switchMode(isRegister ? "login" : "register")} className="rounded-full border border-lime/25 bg-lime/[.08] px-4 py-2 text-xs font-black text-lime">
            {isRegister ? "Login Now" : "Sign up Now"}
          </button>
        </header>

        <section className="mt-6">
          <BrandLogo compact />
          <h1 className="mt-8 text-4xl font-black tracking-tight">{isRegister ? "Register" : "Login"}</h1>
          <div className="mt-7 grid grid-cols-2 rounded-2xl border border-line bg-panel p-1">
            <button onClick={() => switchMode("login")} className={`rounded-xl py-2.5 text-sm font-black transition ${!isRegister ? "bg-lime text-ink" : "text-slate-500"}`}>Login</button>
            <button onClick={() => switchMode("register")} className={`rounded-xl py-2.5 text-sm font-black transition ${isRegister ? "bg-lime text-ink" : "text-slate-500"}`}>Register</button>
          </div>
        </section>

        <form onSubmit={submit} className="mt-8 flex flex-1 flex-col">
          <div className="space-y-4">
            {isRegister && <AuthInput label="Full Name" value={name} onChange={setName} autoComplete="name" />}
            <AuthInput label="Email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
            {isRegister && (
              <>
                <SearchableSelect label="Country" options={countryOptions} value={country} onChange={setCountry} placeholder="Search country" />
                <SearchableSelect label="Language" options={languageOptions} value={language} onChange={setLanguage} placeholder="Search language" />
                <AuthInput label="Referral UID (optional)" value={referralCode} onChange={setReferralCode} autoComplete="off" />
              </>
            )}
            <PasswordInput label="Password" value={password} onChange={setPassword} visible={showPassword} setVisible={setShowPassword} autoComplete={isRegister ? "new-password" : "current-password"} />
            {isRegister && <PasswordInput label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmPassword} setVisible={setShowConfirmPassword} autoComplete="new-password" />}
          </div>

          {!isRegister && (
            <div className="mt-4 flex items-center justify-between text-xs">
              <button type="button" className="font-bold text-lime">Forgot Password</button>
              <label className="flex items-center gap-2 text-slate-400">
                <input checked={remember} onChange={event => setRemember(event.target.checked)} type="checkbox" className="h-4 w-4 rounded border-line accent-[#c4ff3b]" />
                Remember Me
              </label>
            </div>
          )}

          {error && <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs font-bold text-danger">{error}</p>}

          <button disabled={loading} className="mt-7 w-full rounded-2xl bg-lime py-3 text-sm font-black text-ink shadow-[0_16px_38px_rgba(196,255,59,.18)] transition hover:bg-mint disabled:opacity-60">
            {loading ? "Please wait..." : isRegister ? "Create Account" : "Login"}
          </button>

          <div className="mt-5 text-center text-sm text-slate-500">
            {isRegister ? "Already have an account? " : "Don't have an account? "}
            <button type="button" onClick={() => switchMode(isRegister ? "login" : "register")} className="font-black text-lime">
              {isRegister ? "Login" : "Sign Up"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function AuthInput({ label, value, onChange, autoComplete, inputMode }: { label: string; value: string; onChange: (value: string) => void; autoComplete?: string; inputMode?: "email" }) {
  return (
    <label className="block text-xs font-bold text-slate-400">{label}
      <input value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} inputMode={inputMode} className="mt-2 w-full rounded-2xl border border-line bg-[#111c18] px-4 py-2.5 text-sm font-bold text-white outline-none transition focus:border-lime/50" />
    </label>
  );
}

function PasswordInput({ label, value, onChange, visible, setVisible, autoComplete }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; setVisible: (value: boolean) => void; autoComplete: string }) {
  return (
    <label className="block text-xs font-bold text-slate-400">{label}
      <span className="mt-2 flex items-center rounded-2xl border border-line bg-[#111c18] px-4 py-2.5 transition focus-within:border-lime/50">
        <input type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none" />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} className="text-slate-500">
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

async function refreshAuthenticatedData() {
  await Promise.allSettled([
    fetch("/api/me", { cache: "no-store" }),
    fetch("/api/dashboard", { cache: "no-store" }),
    fetch("/api/wallet", { cache: "no-store" }),
    fetch("/api/notifications", { cache: "no-store" }),
    fetch("/api/team", { cache: "no-store" }),
    fetch("/api/ai/subscription", { cache: "no-store" }),
  ]);
}
