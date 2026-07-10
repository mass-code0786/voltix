"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { mobileFetchHeaders, offerBiometricEnrollment } from "@/lib/mobile-native";
import { countryOptions, languageOptions } from "@/lib/profile-options";

export type AuthMode = "login" | "register";

type AuthScreenProps = {
  initialMode?: AuthMode;
  initialReferralCode?: string;
  lockedReferral?: boolean;
  initialSponsorLabel?: string;
};

export function AuthScreen({ initialMode = "login", initialReferralCode = "", lockedReferral = false, initialSponsorLabel = "" }: AuthScreenProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [returnTo, setReturnTo] = useState("/dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("United States");
  const [language, setLanguage] = useState("en");
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [isReferralLocked, setIsReferralLocked] = useState(lockedReferral);
  const [sponsorLabel, setSponsorLabel] = useState(initialSponsorLabel);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlReferralCode = params.get("referralCode")?.trim() || "";
    const urlLocked = params.get("referralLocked") === "1";
    const nextMode = params.get("mode") === "register" || urlReferralCode ? "register" : initialMode;
    setMode(nextMode);
    if (urlReferralCode) setReferralCode(urlReferralCode);
    if (urlLocked) setIsReferralLocked(true);
    const next = params.get("returnTo") || "/dashboard";
    setReturnTo(next.startsWith("/") && !next.startsWith("/auth") ? next : "/dashboard");
  }, [initialMode]);

  const switchMode = (nextMode: AuthMode) => {
    if (isReferralLocked && nextMode === "login") return;
    setError("");
    setMode(nextMode);
    const params = new URLSearchParams(window.location.search);
    params.set("mode", nextMode);
    params.set("returnTo", returnTo);
    if (referralCode) params.set("referralCode", referralCode);
    if (isReferralLocked) params.set("referralLocked", "1");
    window.history.replaceState({}, "", `/auth?${params.toString()}`);
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
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(await mobileFetchHeaders()) },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Authentication failed");
      const user = await refreshAuthenticatedData();
      if (!user) throw new Error("Login session could not be verified. Please try again.");
      if (mode === "login") {
        window.sessionStorage.removeItem("voltixIntroShown");
        await offerBiometricEnrollment(data.mobileSessionToken).catch(() => null);
      }
      router.replace(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <main className="auth-premium-page min-h-screen text-white">
      <div className="auth-bg-particles" aria-hidden="true">{Array.from({length:16}).map((_,i)=><i key={i} style={{"--x":`${(i*37)%100}%`,"--y":`${8+(i*29)%84}%`,"--d":`${1+i*.2}s`} as CSSProperties}/>)}</div>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="auth-header">
          <img src="/logo.png" alt="VOLTIX" />
          <button onClick={() => switchMode(isRegister ? "login" : "register")} className="auth-switch-link" disabled={isReferralLocked && isRegister}>
            {isRegister ? "Login Now" : "Sign up Now"}
          </button>
        </header>

        <section className="auth-hero">
          <AuthHeroVisual register={isRegister}/>
          <h1>{isRegister ? "Create Account" : "Welcome Back"}</h1>
          <p>{isRegister ? "Join Voltix and start trading smarter" : "Login to your Voltix account"}</p>
          <div className="auth-mode-tabs">
            <button type="button" onClick={() => switchMode("login")} className={!isRegister ? "active" : ""} disabled={isReferralLocked}>Login</button>
            <button type="button" onClick={() => switchMode("register")} className={isRegister ? "active" : ""}>Register</button>
          </div>
        </section>

        <form onSubmit={submit} className="auth-card">
          <div className="space-y-3">
            {isRegister && <AuthInput label="Full Name" value={name} onChange={setName} autoComplete="name" icon="user" />}
            <AuthInput label="Email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" icon="email" />
            {isRegister && (
              <>
                <SearchableSelect label="Country" options={countryOptions} value={country} onChange={setCountry} placeholder="Search country" className="auth-select" />
                <SearchableSelect label="Language" options={languageOptions} value={language} onChange={setLanguage} placeholder="Search language" className="auth-select" />
                {sponsorLabel && <p className="rounded-xl border border-lime/20 bg-lime/10 px-4 py-3 text-xs font-bold text-lime">Invited by {sponsorLabel}</p>}
                <AuthInput label={isReferralLocked ? "Referral UID" : "Referral UID (optional)"} value={referralCode} onChange={setReferralCode} autoComplete="off" icon="shield" readOnly={isReferralLocked} />
              </>
            )}
            <PasswordInput label="Password" value={password} onChange={setPassword} visible={showPassword} setVisible={setShowPassword} autoComplete={isRegister ? "new-password" : "current-password"} />
            {isRegister && <PasswordInput label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} visible={showConfirmPassword} setVisible={setShowConfirmPassword} autoComplete="new-password" />}
          </div>

          {!isRegister && (
            <div className="auth-options">
              <label>
                <input checked={remember} onChange={event => setRemember(event.target.checked)} type="checkbox" />
                Remember Me
              </label>
              <button type="button">Forgot Password</button>
            </div>
          )}

          {error && <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs font-bold text-danger">{error}</p>}

          <button disabled={loading} className="auth-submit">
            {loading ? "Please wait..." : isRegister ? "Create Account" : "Login"}
          </button>

          <div className="auth-footer-link">
            {isRegister ? "Already have an account? " : "Don't have an account? "}
            <button type="button" onClick={() => switchMode(isRegister ? "login" : "register")} disabled={isReferralLocked && isRegister}>
              {isRegister ? "Login" : "Sign Up"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function AuthHeroVisual({register}:{register:boolean}) {
  return <svg viewBox="0 0 180 126" className="auth-hero-svg" aria-hidden="true">
    <defs><radialGradient id="authGlow" cx="50%" cy="65%" r="58%"><stop stopColor="#18ff8a" stopOpacity=".45"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient><linearGradient id="authV" x1="58" y1="24" x2="112" y2="90"><stop stopColor="#f7fff9"/><stop offset=".5" stopColor="#18ff8a"/><stop offset="1" stopColor="#036c44"/></linearGradient></defs>
    <path d="M20 102H160M38 88H142M54 74H126" stroke="#18ff8a" strokeOpacity=".13"/>
    <ellipse cx="90" cy="100" rx="58" ry="18" fill="url(#authGlow)" className="auth-svg-pulse"/>
    <ellipse cx="90" cy="96" rx="52" ry="13" fill="#06110d" stroke="#18ff8a" strokeOpacity=".42" strokeDasharray="24 12" className="auth-svg-orbit"/>
    <g className="auth-svg-float"><circle cx="90" cy="54" r="34" fill="rgba(24,255,138,.1)" stroke="#18ff8a" strokeOpacity=".34"/><path d="M74 34H63l19 45 8 15 8-15 19-45h-11L90 70 74 34Z" fill="url(#authV)"/></g>
    <path d="M132 38l16 8v16c0 10-6 16-16 20-10-4-16-10-16-20V46l16-8Z" fill="#08140f" stroke="#18ff8a" strokeOpacity=".52"/>
    {register?<path d="M132 53v14M125 60h14" stroke="#18ff8a" strokeWidth="2.4" strokeLinecap="round"/>:<path d="M124 61l6 6 12-16" stroke="#18ff8a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>}
  </svg>;
}

function AuthInput({ label, value, onChange, autoComplete, inputMode, icon = "email", readOnly = false }: { label: string; value: string; onChange: (value: string) => void; autoComplete?: string; inputMode?: "email"; icon?: "email" | "user" | "shield"; readOnly?: boolean }) {
  const Icon=icon==="user"?User:icon==="shield"?ShieldCheck:Mail;
  return (
    <label className="auth-field">{label}
      <span><Icon size={17}/><input value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} inputMode={inputMode} readOnly={readOnly} aria-readonly={readOnly} /></span>
    </label>
  );
}

function PasswordInput({ label, value, onChange, visible, setVisible, autoComplete }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; setVisible: (value: boolean) => void; autoComplete: string }) {
  return (
    <label className="auth-field">{label}
      <span>
        <Lock size={17}/>
        <input type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

async function refreshAuthenticatedData() {
  const meResponse = await fetch("/api/me", { cache: "no-store", credentials: "include" });
  const meData = await meResponse.json().catch(() => ({}));
  const user = meResponse.ok && meData?.authenticated ? meData.user : null;
  if (!user) return null;
  await Promise.allSettled([
    fetch("/api/dashboard", { cache: "no-store", credentials: "include" }),
    fetch("/api/wallet", { cache: "no-store", credentials: "include" }),
    fetch("/api/notifications", { cache: "no-store", credentials: "include" }),
    fetch("/api/team", { cache: "no-store", credentials: "include" }),
    fetch("/api/ai/subscription", { cache: "no-store", credentials: "include" }),
  ]);
  return user;
}
