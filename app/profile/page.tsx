"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Copy,
  Eye,
  EyeOff,
  Globe2,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { SearchableSelect } from "@/components/searchable-select";
import { countryOptions, languageOptions } from "@/lib/profile-options";

type Profile = {
  avatar: string | null;
  profileImageUrl: string | null;
  fullName: string;
  uid: string;
  email: string;
  country: string;
  language: string;
  vipRank: string;
  referralUid: string | null;
  referralLink: string | null;
  memberSince: string;
  kycStatus: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
};

function initials(name: string) {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "VX";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("United States");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const kycTone = useMemo(() => {
    if (profile?.kycStatus === "APPROVED") return "border-lime/40 bg-lime/10 text-lime";
    if (profile?.kycStatus === "REJECTED") return "border-danger/40 bg-danger/10 text-danger";
    if (profile?.kycStatus === "PENDING") return "border-amber-400/40 bg-amber-400/10 text-amber-300";
    return "border-line bg-white/5 text-slate-300";
  }, [profile?.kycStatus]);

  useEffect(() => {
    let active = true;
    fetch("/api/profile")
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          router.replace(`/auth?mode=login&returnTo=${encodeURIComponent("/profile")}`);
          return null;
        }
        if (!response.ok) throw new Error(data.error || "Profile request failed");
        return data.profile as Profile;
      })
      .then(data => {
        if (!active || !data) return;
        setProfile(data);
        setName(data.fullName ?? "");
        setCountry(data.country ?? "United States");
        setLanguage(data.language ?? "en");
        setProfileImageUrl(data.profileImageUrl ?? "");
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : "Profile request failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!country.trim()) {
      setError("Country is required");
      return;
    }
    setSavingProfile(true);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, country, language, profileImageUrl }),
    });
    const data = await response.json().catch(() => ({}));
    setSavingProfile(false);
    if (!response.ok) {
      setError(data.error || "Profile update failed");
      return;
    }
    setProfile(data.profile as Profile);
    setMessage("Profile updated");
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Confirm password must match");
      return;
    }
    setSavingPassword(true);
    const response = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await response.json().catch(() => ({}));
    setSavingPassword(false);
    if (!response.ok) {
      setError(data.error || "Password update failed");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Password changed");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  };

  const copyReferral = async () => {
    if (!profile?.referralLink) return;
    await navigator.clipboard?.writeText(profile.referralLink);
    setMessage("Referral link copied");
  };

  return (
    <main className="min-h-screen bg-ink text-white">
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-10 pt-5">
        <header className="flex items-center justify-between">
          <button onClick={() => router.back()} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-panel text-slate-200" aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
          <BrandLogo />
          <div className="h-10 w-10" />
        </header>

        <section className="mt-7">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-lime">Profile & Settings</p>
          <h1 className="mt-2 text-3xl font-black">Account Center</h1>
          <p className="mt-2 text-sm text-slate-500">Manage your Voltix profile, security, and preferences.</p>
        </section>

        {loading ? (
          <div className="mt-8 rounded-3xl border border-line bg-panel/80 p-6 text-sm text-slate-400">Loading profile...</div>
        ) : profile ? (
          <div className="mt-6 space-y-5">
            <section className="rounded-3xl border border-line bg-panel/80 p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center gap-4">
                <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-3xl border border-line bg-ink text-2xl font-black text-lime">
                  {profileImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initials(name)
                  )}
                  <div className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-lime text-ink">
                    <Camera size={14} />
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-black">{profile.fullName}</h2>
                  <p className="mt-1 text-xs text-slate-500">UID {profile.uid}</p>
                  <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-[11px] font-black ${kycTone}`}>
                    KYC {profile.kycStatus.replace("_", " ")}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <InfoTile label="VIP Rank" value={profile.vipRank || "NONE"} />
                <InfoTile label="Member Since" value={formatDate(profile.memberSince)} />
              </div>
            </section>

            <form onSubmit={saveProfile} className="rounded-3xl border border-line bg-panel/80 p-5">
              <SectionTitle icon={UserRound} title="Profile" />
              <div className="mt-5 space-y-4">
                <Field label="Full Name" value={name} onChange={setName} />
                <SearchableSelect label="Country" options={countryOptions} value={country} onChange={setCountry} placeholder="Search country" />
                <Field label="Profile Picture URL" value={profileImageUrl} onChange={setProfileImageUrl} placeholder="https://..." />
              </div>
              <button disabled={savingProfile} className="mt-5 w-full rounded-2xl bg-lime py-4 text-sm font-black text-ink disabled:opacity-60">
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </form>

            <section className="rounded-3xl border border-line bg-panel/80 p-5">
              <SectionTitle icon={ShieldCheck} title="Account Details" />
              <div className="mt-5 space-y-3">
                <ReadOnly label="UID" value={profile.uid} />
                <ReadOnly label="Email" value={profile.email} />
                <ReadOnly label="Referral UID" value={profile.referralUid || "Unavailable"} />
                <div className="rounded-2xl border border-line bg-ink p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Referral Link</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-200">{profile.referralLink || "Unavailable"}</p>
                    <button onClick={copyReferral} className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-lime" aria-label="Copy referral link">
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <form onSubmit={changePassword} className="rounded-3xl border border-line bg-panel/80 p-5">
              <SectionTitle icon={LockKeyhole} title="Security" />
              <div className="mt-5 space-y-4">
                <PasswordField label="Current Password" value={currentPassword} onChange={setCurrentPassword} visible={showPassword} toggle={() => setShowPassword(value => !value)} />
                <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} visible={showPassword} toggle={() => setShowPassword(value => !value)} />
                <PasswordField label="Confirm Password" value={confirmPassword} onChange={setConfirmPassword} visible={showPassword} toggle={() => setShowPassword(value => !value)} />
              </div>
              <button disabled={savingPassword} className="mt-5 w-full rounded-2xl bg-lime py-4 text-sm font-black text-ink disabled:opacity-60">
                {savingPassword ? "Updating..." : "Change Password"}
              </button>
            </form>

            <section className="rounded-3xl border border-line bg-panel/80 p-5">
              <SectionTitle icon={Globe2} title="Preferences" />
              <div className="mt-5 space-y-3">
                <SearchableSelect label="Language" options={languageOptions} value={language} onChange={setLanguage} placeholder="Search language" />
              </div>
            </section>

            <section className="rounded-3xl border border-line bg-panel/80 p-5">
              <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line py-4 text-sm font-black text-slate-200">
                <LogOut size={17} /> Logout
              </button>
            </section>

            {(message || error) && (
              <div className={`fixed inset-x-4 bottom-5 z-50 mx-auto max-w-sm rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl ${error ? "border-danger/40 bg-danger text-white" : "border-lime/40 bg-lime text-ink"}`}>
                {error || message}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-line bg-panel/80 p-6 text-sm text-danger">{error || "Profile unavailable"}</div>
        )}
      </div>
    </main>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof UserRound; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-lime/10 text-lime">
        <Icon size={18} />
      </div>
      <h2 className="text-lg font-black">{title}</h2>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black">{value}</p>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 break-all text-sm font-bold text-slate-200">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block text-xs font-bold text-slate-400">
      {label}
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-2xl border border-line bg-ink px-4 py-3.5 text-sm font-bold text-white outline-none focus:border-lime/50" />
    </label>
  );
}

function PasswordField({ label, value, onChange, visible, toggle }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; toggle: () => void }) {
  return (
    <label className="block text-xs font-bold text-slate-400">
      {label}
      <span className="mt-2 flex items-center rounded-2xl border border-line bg-ink focus-within:border-lime/50">
        <input type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm font-bold text-white outline-none" />
        <button type="button" onClick={toggle} className="grid h-12 w-12 place-items-center text-slate-400" aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </label>
  );
}
