"use client";

import { FormEvent, useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { LucideProps } from "lucide-react";
import {
  Bell,
  Bot,
  Camera,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  Globe2,
  Headphones,
  Home,
  LineChart,
  LockKeyhole,
  LogOut,
  Network,
  Settings,
  ShieldCheck,
  UserRound,
  Wallet,
  Zap,
} from "lucide-react";
import { AppHeader, BottomNav } from "@/components/design-system";
import { SearchableSelect } from "@/components/searchable-select";
import { countryOptions, languageOptions } from "@/lib/profile-options";
import { usd } from "@/lib/format";

type Profile = {
  avatar: string | null;
  profileImageUrl: string | null;
  fullName: string;
  uid: string;
  email: string;
  phone?: string | null;
  country: string;
  language: string;
  vipRank: string;
  referralUid: string | null;
  referralLink: string | null;
  memberSince: string;
  kycStatus: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
};

type DashboardSnapshot = {
  summary?: {
    totalPortfolio?: number;
    totalIncome?: number;
  };
  team?: {
    stats?: {
      totalNetworkCount?: number;
      directTeamCount?: number;
    };
  };
};

type TeamSnapshot = {
  stats?: {
    totalNetworkCount?: number;
    directTeamCount?: number;
  };
};

type AiSubscriptionStatus = {
  subscription: { active: boolean } | null;
};

type IncomeHistory = {
  incomes?: {
    type?: string;
    amount?: number;
  }[];
};

type MobileNavTab = "home" | "markets" | "bitex" | "wallet" | "profile";
type Panel = "account" | "security" | "settings" | null;
type IconType = ComponentType<LucideProps>;

const mobileTabs: { id: MobileNavTab; label: string; icon: IconType; section?: string }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "markets", label: "Markets", icon: LineChart },
  { id: "bitex", label: "AI Trade", icon: Zap },
  { id: "wallet", label: "Wallet", icon: Wallet, section: "overview" },
  { id: "profile", label: "Profile", icon: Settings },
];

function initials(name: string) {
  return name
    .split(" ")
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "VX";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function kycLabel(status?: Profile["kycStatus"]) {
  if (status === "APPROVED") return "Verified";
  if (status === "PENDING") return "Pending";
  if (status === "REJECTED") return "Rejected";
  return "Not submitted";
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [team, setTeam] = useState<TeamSnapshot | null>(null);
  const [ai, setAi] = useState<AiSubscriptionStatus | null>(null);
  const [income, setIncome] = useState<IncomeHistory | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [activePanel, setActivePanel] = useState<Panel>(null);
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
    if (profile?.kycStatus === "APPROVED") return "border-[#18ff8a]/30 bg-[#18ff8a]/10 text-[#18ff8a]";
    if (profile?.kycStatus === "REJECTED") return "border-[#ff4f6d]/30 bg-[#ff4f6d]/10 text-[#ff4f6d]";
    if (profile?.kycStatus === "PENDING") return "border-[#f6c85f]/30 bg-[#f6c85f]/10 text-[#f6c85f]";
    return "border-white/10 bg-white/[.05] text-slate-300";
  }, [profile?.kycStatus]);

  const totalBalance = Number(dashboard?.summary?.totalPortfolio ?? 0);
  const totalIncome = Number(dashboard?.summary?.totalIncome ?? 0);
  const referralIncome = Number(income?.incomes?.filter(row => ["DIRECT","LEVEL","BOT_COMMISSION"].includes(row.type ?? "")).reduce((sum,row)=>sum+Number(row.amount ?? 0),0) ?? 0);
  const teamSize = Number(team?.stats?.totalNetworkCount ?? dashboard?.team?.stats?.totalNetworkCount ?? 0);
  const currentVip = profile?.vipRank?.trim() || "—";
  const nextVip = currentVip.match(/\d+/) ? `VIP ${Number(currentVip.match(/\d+/)?.[0] ?? 0) + 1}` : "—";
  const vipProgress = 0;

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

    Promise.allSettled([
      fetch("/api/dashboard").then(r => r.ok ? r.json() : null),
      fetch("/api/team").then(r => r.ok ? r.json() : null),
      fetch("/api/ai/subscription").then(r => r.ok ? r.json() : null),
      fetch("/api/notifications").then(r => r.ok ? r.json() : null),
      fetch("/api/income").then(r => r.ok ? r.json() : null),
    ]).then(results => {
      if (!active) return;
      const [dashboardResult, teamResult, aiResult, notificationResult, incomeResult] = results;
      if (dashboardResult.status === "fulfilled") setDashboard(dashboardResult.value?.dashboard ?? null);
      if (teamResult.status === "fulfilled") setTeam(teamResult.value?.team ?? null);
      if (aiResult.status === "fulfilled") setAi(aiResult.value ?? null);
      if (notificationResult.status === "fulfilled") setUnreadNotifications(Number(notificationResult.value?.unreadCount ?? 0));
      if (incomeResult.status === "fulfilled") setIncome(incomeResult.value ?? null);
    }).catch(() => {});

    return () => {
      active = false;
    };
  }, [router]);

  const notify = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2600);
  };

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
    notify("Profile updated");
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
    notify("Password changed");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
  };

  const copyUid = async () => {
    if (!profile?.uid) return;
    await navigator.clipboard?.writeText(profile.uid);
    notify("UID copied");
  };

  const copyReferral = async () => {
    if (!profile?.referralLink) return;
    await navigator.clipboard?.writeText(profile.referralLink);
    notify("Referral link copied");
  };

  const navTo = (id: MobileNavTab, section?: string) => {
    if (id === "profile") return;
    if (id === "home") router.push("/");
    else if (id === "wallet") router.push(section && section !== "overview" ? `/?view=wallet&wallet=${section}` : "/?view=wallet");
    else router.push(`/?view=${id}`);
  };

  return (
    <main className="profile-page min-h-screen overflow-x-hidden text-white">
      <AppHeader
        title="Profile"
        subtitle="Account Center"
        initials={initials(profile?.fullName ?? "")}
        unreadNotifications={unreadNotifications}
        onNotifications={() => router.push("/?view=home")}
        onMenu={() => router.push("/")}
        onMenuButton={() => router.push("/")}
      />
      <div className="mx-auto w-full max-w-[420px] px-4 pb-28 pt-1 lg:max-w-3xl">
        {loading ? (
          <div className="profile-glass mt-1 rounded-[22px] p-5 text-sm text-slate-400">Loading profile...</div>
        ) : profile ? (
          <div className="space-y-3">
            <ProfileHero
              profile={profile}
              initialsText={initials(profile.fullName)}
              kycTone={kycTone}
              totalBalance={totalBalance}
              totalIncome={totalIncome}
              referralIncome={referralIncome}
              teamSize={teamSize}
              copyUid={copyUid}
            />

            <VipProgressCard currentVip={currentVip} nextVip={nextVip} progress={vipProgress} />

            <section className="space-y-2">
              <h2 className="px-1 text-[18px] font-black text-white">Account</h2>
              <div className="profile-menu-card">
                <ProfileRow icon={UserRound} tone="green" title="Account Information" subtitle="Name, email, country and profile details" onClick={() => setActivePanel(activePanel === "account" ? null : "account")} />
                <ProfileRow icon={ShieldCheck} tone="green" title="KYC Verification" subtitle="Identity verification status" pill={kycLabel(profile.kycStatus)} pillTone={profile.kycStatus === "APPROVED" ? "green" : "muted"} onClick={() => router.push("/?view=home")} />
                <ProfileRow icon={LockKeyhole} tone="purple" title="Security" subtitle="Password and account access" onClick={() => setActivePanel(activePanel === "security" ? null : "security")} />
                <ProfileRow icon={CreditCard} tone="blue" title="Bank & Payment Methods" subtitle="Deposit and withdrawal methods" onClick={() => router.push("/?view=wallet")} />
                <ProfileRow icon={Network} tone="yellow" title="Referral & Team" subtitle="Referral link and network overview" onClick={() => router.push("/?view=team")} />
                <ProfileRow icon={Crown} tone="purple" title="VIP & Benefits" subtitle={`Current level ${currentVip}`} onClick={() => router.push("/?view=bitex")} />
                <ProfileRow icon={Bot} tone="green" title="AI Subscription" subtitle="AI trading membership" pill={ai?.subscription?.active ? "Active" : "Inactive"} pillTone={ai?.subscription?.active ? "green" : "muted"} onClick={() => router.push("/?view=bitex")} />
                <ProfileRow icon={Bell} tone="yellow" title="Notifications" subtitle={`${unreadNotifications} unread`} onClick={() => router.push("/?view=home")} />
                <ProfileRow icon={Settings} tone="gray" title="Settings" subtitle="Language and preferences" onClick={() => setActivePanel(activePanel === "settings" ? null : "settings")} />
                <ProfileRow icon={Headphones} tone="blue" title="Support Center" subtitle="Help, tickets and account support" onClick={() => router.push("/?view=home")} />
                <ProfileRow icon={LogOut} tone="red" title="Logout" subtitle="End this session" onClick={logout} danger last />
              </div>
            </section>

            <ProfilePanels
              activePanel={activePanel}
              profile={profile}
              name={name}
              setName={setName}
              country={country}
              setCountry={setCountry}
              language={language}
              setLanguage={setLanguage}
              profileImageUrl={profileImageUrl}
              setProfileImageUrl={setProfileImageUrl}
              savingProfile={savingProfile}
              saveProfile={saveProfile}
              currentPassword={currentPassword}
              setCurrentPassword={setCurrentPassword}
              newPassword={newPassword}
              setNewPassword={setNewPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              savingPassword={savingPassword}
              changePassword={changePassword}
              copyReferral={copyReferral}
            />

            {(message || error) && (
              <div className={`fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl ${error ? "border-[#ff4f6d]/40 bg-[#4d1420] text-white" : "border-[#18ff8a]/40 bg-[#18ff8a] text-[#050608]"}`}>
                {error || message}
              </div>
            )}
          </div>
        ) : (
          <div className="profile-glass mt-1 rounded-[22px] p-5 text-sm text-[#ff4f6d]">{error || "Profile unavailable"}</div>
        )}
      </div>
      <BottomNav items={mobileTabs} activeId="profile" activeSection="overview" labelFor={(id) => mobileTabs.find(item => item.id === id)?.label ?? id} onSelect={navTo} />
    </main>
  );
}

function ProfileHero({profile,initialsText,kycTone,totalBalance,totalIncome,referralIncome,teamSize,copyUid}:{profile:Profile;initialsText:string;kycTone:string;totalBalance:number;totalIncome:number;referralIncome:number;teamSize:number;copyUid:()=>void}) {
  return (
    <section className="profile-hero-card">
      <div className="relative z-10 flex h-[130px] gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className="profile-avatar">
              <span>{initialsText}</span>
              <span className="profile-camera"><Camera size={13}/></span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <h1 className="truncate text-[22px] font-black leading-tight text-white">{profile.fullName || "—"}</h1>
                {profile.kycStatus === "APPROVED" && <CheckCircle2 size={17} className="shrink-0 text-[#18ff8a] drop-shadow-[0_0_10px_rgba(24,255,138,.55)]"/>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="profile-vip-pill">{profile.vipRank || "—"}</span>
                <span className={`profile-status-pill ${kycTone}`}>KYC {kycLabel(profile.kycStatus)}</span>
              </div>
              <button onClick={copyUid} className="mt-1 flex max-w-full items-center gap-1.5 text-[11px] font-bold text-slate-400">
                <span className="truncate">UID {profile.uid || "—"}</span><Copy size={12} className="shrink-0 text-[#18ff8a]"/>
              </button>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{profile.email || "—"}</p>
              {profile.phone&&<p className="mt-0.5 truncate text-[11px] text-slate-500">{profile.phone}</p>}
            </div>
          </div>
        </div>
        <VoltixVMark/>
      </div>
      <div className="profile-hero-stats">
        <HeroStat label="Total Balance" value={usd(totalBalance)}/>
        <HeroStat label="Total Income" value={usd(totalIncome)}/>
        <HeroStat label="Referral Income" value={usd(referralIncome)}/>
        <HeroStat label="Team Size" value={String(teamSize)}/>
      </div>
    </section>
  );
}

function VoltixVMark() {
  return <svg width="110" height="110" viewBox="0 0 110 110" className="profile-v-svg shrink-0" aria-hidden="true">
    <defs>
      <linearGradient id="profileV" x1="22" y1="10" x2="88" y2="98">
        <stop stopColor="#f4fff9"/>
        <stop offset=".38" stopColor="#18ff8a"/>
        <stop offset="1" stopColor="#047a49"/>
      </linearGradient>
      <radialGradient id="profileVGlow" cx="50%" cy="50%" r="50%">
        <stop stopColor="#18ff8a" stopOpacity=".55"/>
        <stop offset="1" stopColor="#18ff8a" stopOpacity="0"/>
      </radialGradient>
    </defs>
    <ellipse cx="55" cy="83" rx="38" ry="13" fill="url(#profileVGlow)" className="profile-v-pulse"/>
    <path d="M24 22 L43 22 L55 64 L68 22 L87 22 L63 82 L47 82 Z" fill="url(#profileV)" stroke="#eafff4" strokeOpacity=".34" strokeWidth="1.2"/>
    <path d="M33 28 L45 28 L55 63 L66 28 L78 28" fill="none" stroke="#06120d" strokeOpacity=".42" strokeWidth="3"/>
    <ellipse cx="55" cy="86" rx="32" ry="8" fill="none" stroke="#18ff8a" strokeOpacity=".38"/>
    <circle cx="88" cy="36" r="3" fill="#18ff8a" className="profile-orbit-dot"/>
  </svg>;
}

function HeroStat({label,value}:{label:string;value:string}) {
  return <div className="profile-stat">
    <p>{label}</p>
    <strong>{value}</strong>
  </div>;
}

function VipProgressCard({currentVip,nextVip,progress}:{currentVip:string;nextVip:string;progress:number}) {
  return <section className="profile-glass flex h-[108px] items-center gap-3 rounded-[22px] p-3.5">
    <VipHex/>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="text-[15px] font-black text-white">{currentVip}</p>
        <span className="text-[11px] font-bold text-slate-500">Next {nextVip}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/40">
        <div className="h-full rounded-full bg-gradient-to-r from-[#18ff8a] to-[#d8ff62] shadow-[0_0_16px_rgba(24,255,138,.42)]" style={{width:`${progress}%`}}/>
      </div>
      <p className="mt-2 text-[11px] font-bold text-slate-500">— / — VIP Points</p>
    </div>
    <div className="text-right">
      <p className="text-[18px] font-black text-[#18ff8a]">{progress}%</p>
      <ChevronRight size={18} className="ml-auto mt-2 text-slate-500"/>
    </div>
  </section>;
}

function VipHex() {
  return <svg width="54" height="54" viewBox="0 0 54 54" className="profile-vip-hex shrink-0" aria-hidden="true">
    <defs>
      <linearGradient id="vipHex" x1="9" y1="5" x2="45" y2="49">
        <stop stopColor="#fbf5ff"/>
        <stop offset=".45" stopColor="#b56cff"/>
        <stop offset="1" stopColor="#18ff8a"/>
      </linearGradient>
    </defs>
    <path d="M27 4 47 15.5v23L27 50 7 38.5v-23Z" fill="url(#vipHex)" fillOpacity=".2" stroke="url(#vipHex)" strokeWidth="1.5"/>
    <path d="M17 22h20l-10 14Z" fill="none" stroke="#f8fff9" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M20 18h14" stroke="#18ff8a" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}

function ProfileRow({icon:Icon,tone,title,subtitle,pill,pillTone="muted",onClick,danger=false,last=false}:{icon:IconType;tone:"green"|"purple"|"blue"|"yellow"|"gray"|"red";title:string;subtitle:string;pill?:string;pillTone?: "green" | "muted";onClick:()=>void;danger?:boolean;last?:boolean}) {
  return <button onClick={onClick} className={`profile-row ${last?"border-b-0":""}`}>
    <span className={`profile-row-icon profile-icon-${tone}`}><Icon size={18}/></span>
    <span className="min-w-0 flex-1 text-left">
      <span className={`block truncate text-[15px] font-bold ${danger?"text-[#ff4f6d]":"text-white"}`}>{title}</span>
      <span className="mt-0.5 block truncate text-[12px] text-slate-500">{subtitle}</span>
    </span>
    {pill&&<span className={`profile-row-pill ${pillTone==="green"?"profile-row-pill-green":""}`}>{pill}</span>}
    <ChevronRight size={18} className={danger?"text-[#ff4f6d]":"text-slate-600"}/>
  </button>;
}

function ProfilePanels(props:{activePanel:Panel;profile:Profile;name:string;setName:(value:string)=>void;country:string;setCountry:(value:string)=>void;language:string;setLanguage:(value:string)=>void;profileImageUrl:string;setProfileImageUrl:(value:string)=>void;savingProfile:boolean;saveProfile:(event:FormEvent)=>void;currentPassword:string;setCurrentPassword:(value:string)=>void;newPassword:string;setNewPassword:(value:string)=>void;confirmPassword:string;setConfirmPassword:(value:string)=>void;showPassword:boolean;setShowPassword:(value:boolean|((value:boolean)=>boolean))=>void;savingPassword:boolean;changePassword:(event:FormEvent)=>void;copyReferral:()=>void}) {
  if (!props.activePanel) return null;
  if (props.activePanel === "security") {
    return <form onSubmit={props.changePassword} className="profile-glass rounded-[22px] p-4">
      <SectionTitle icon={LockKeyhole} title="Security" />
      <div className="mt-4 space-y-3">
        <PasswordField label="Current Password" value={props.currentPassword} onChange={props.setCurrentPassword} visible={props.showPassword} toggle={() => props.setShowPassword(value => !value)} />
        <PasswordField label="New Password" value={props.newPassword} onChange={props.setNewPassword} visible={props.showPassword} toggle={() => props.setShowPassword(value => !value)} />
        <PasswordField label="Confirm Password" value={props.confirmPassword} onChange={props.setConfirmPassword} visible={props.showPassword} toggle={() => props.setShowPassword(value => !value)} />
      </div>
      <button disabled={props.savingPassword} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{props.savingPassword ? "Updating..." : "Change Password"}</button>
    </form>;
  }
  return <form onSubmit={props.saveProfile} className="profile-glass rounded-[22px] p-4">
    <SectionTitle icon={props.activePanel === "settings" ? Globe2 : UserRound} title={props.activePanel === "settings" ? "Settings" : "Account Information"} />
    <div className="mt-4 space-y-3">
      {props.activePanel === "account"&&<>
        <Field label="Full Name" value={props.name} onChange={props.setName} />
        <ReadOnly label="UID" value={props.profile.uid || "—"} />
        <ReadOnly label="Email" value={props.profile.email || "—"} />
        <ReadOnly label="Member Since" value={formatDate(props.profile.memberSince)} />
        <div className="rounded-2xl border border-white/[.08] bg-black/25 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Referral Link</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-200">{props.profile.referralLink || "—"}</p>
            <button type="button" onClick={props.copyReferral} className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-[#18ff8a]" aria-label="Copy referral link"><Copy size={16}/></button>
          </div>
        </div>
        <SearchableSelect label="Country" options={countryOptions} value={props.country} onChange={props.setCountry} placeholder="Search country" />
        <Field label="Profile Picture URL" value={props.profileImageUrl} onChange={props.setProfileImageUrl} placeholder="https://..." />
      </>}
      {props.activePanel === "settings"&&<SearchableSelect label="Language" options={languageOptions} value={props.language} onChange={props.setLanguage} placeholder="Search language" />}
    </div>
    <button disabled={props.savingProfile} className="mt-4 w-full rounded-2xl bg-[#18ff8a] py-3.5 text-sm font-black text-[#050608] disabled:opacity-60">{props.savingProfile ? "Saving..." : "Save Changes"}</button>
  </form>;
}

function SectionTitle({ icon: Icon, title }: { icon: IconType; title: string }) {
  return <div className="flex items-center gap-3">
    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#18ff8a]/10 text-[#18ff8a]"><Icon size={18}/></div>
    <h2 className="text-[18px] font-black">{title}</h2>
  </div>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/[.08] bg-black/25 p-3">
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
    <p className="mt-1 break-all text-sm font-bold text-slate-200">{value}</p>
  </div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block text-xs font-bold text-slate-400">
    {label}
    <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-2xl border border-white/[.08] bg-black/25 px-4 py-3 text-sm font-bold text-white outline-none focus:border-[#18ff8a]/50" />
  </label>;
}

function PasswordField({ label, value, onChange, visible, toggle }: { label: string; value: string; onChange: (value: string) => void; visible: boolean; toggle: () => void }) {
  return <label className="block text-xs font-bold text-slate-400">
    {label}
    <span className="mt-2 flex items-center rounded-2xl border border-white/[.08] bg-black/25 focus-within:border-[#18ff8a]/50">
      <input type={visible ? "text" : "password"} value={value} onChange={event => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-bold text-white outline-none" />
      <button type="button" onClick={toggle} className="grid h-11 w-11 place-items-center text-slate-400" aria-label={visible ? "Hide password" : "Show password"}>
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  </label>;
}
