"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { LucideProps } from "lucide-react";
import {
  Bell,
  Bot,
  Camera,
  CheckCircle2,
  ChevronRight,
  Copy,
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
  WalletCards,
  Zap,
} from "lucide-react";
import { AppHeader, BottomNav } from "@/components/design-system";
import { SearchableSelect } from "@/components/searchable-select";
import { buildReferralLink, getClientAppOrigin } from "@/lib/app-url";
import { clearMobileNativeSession, isVoltixNativeApp, nativeShareReferral } from "@/lib/mobile-native";
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
  kycStatus: "NOT_SUBMITTED" | "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
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
type NativePhoto = {
  webPath?: string;
  path?: string;
  dataUrl?: string;
  base64String?: string;
  format?: string;
};

const mobileTabs: { id: MobileNavTab; label: string; icon: IconType; section?: string }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "markets", label: "Markets", icon: LineChart },
  { id: "bitex", label: "AI Trade", icon: Zap },
  { id: "wallet", label: "Wallet", icon: Wallet, section: "overview" },
  { id: "profile", label: "Profile", icon: Settings },
];
const maxSourceProfilePhotoBytes = 25 * 1024 * 1024;
const maxProcessedProfilePhotoBytes = 1024 * 1024;
const profilePhotoSize = 512;
const allowedSourceProfilePhotoTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"];

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
  if (status === "PENDING" || status === "UNDER_REVIEW") return "Under Review";
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const kycTone = useMemo(() => {
    if (profile?.kycStatus === "APPROVED") return "border-[#18ff8a]/30 bg-[#18ff8a]/10 text-[#18ff8a]";
    if (profile?.kycStatus === "REJECTED") return "border-[#ff4f6d]/30 bg-[#ff4f6d]/10 text-[#ff4f6d]";
    if (profile?.kycStatus === "PENDING" || profile?.kycStatus === "UNDER_REVIEW") return "border-[#f6c85f]/30 bg-[#f6c85f]/10 text-[#f6c85f]";
    return "border-white/10 bg-white/[.05] text-slate-300";
  }, [profile?.kycStatus]);

  const totalBalance = Number(dashboard?.summary?.totalPortfolio ?? 0);
  const totalIncome = Number(dashboard?.summary?.totalIncome ?? 0);
  const referralIncome = Number(income?.incomes?.filter(row => ["DIRECT","LEVEL","BOT_COMMISSION"].includes(row.type ?? "")).reduce((sum,row)=>sum+Number(row.amount ?? 0),0) ?? 0);
  const teamSize = Number(team?.stats?.totalNetworkCount ?? dashboard?.team?.stats?.totalNetworkCount ?? 0);
  const currentVip = profile?.vipRank?.trim() || "—";
  const nextVip = currentVip.match(/\d+/) ? `VIP ${Number(currentVip.match(/\d+/)?.[0] ?? 0) + 1}` : "—";
  const vipProgress = 0;
  const displayProfile = useMemo(() => {
    if (!profile) return null;
    const fallback = buildReferralLink(profile.referralUid || profile.uid, getClientAppOrigin());
    const referralLink = profile.referralLink && !/^https?:\/\/localhost(?::\d+)?\b/i.test(profile.referralLink)
      ? profile.referralLink
      : fallback;
    return { ...profile, referralLink };
  }, [profile]);

  useEffect(() => {
    let active = true;
    fetch("/api/profile", { cache: "no-store", credentials: "include" })
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
      fetch("/api/dashboard", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch("/api/team", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch("/api/ai/subscription", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch("/api/notifications", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch("/api/income", { cache: "no-store", credentials: "include" }).then(r => r.ok ? r.json() : null),
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
      credentials: "include",
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

  const chooseProfilePhoto = async () => {
    setError("");
    setMessage("");
    if (uploadingPhoto) return;
    if (await isVoltixNativeApp()) {
      try {
        const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        const photo = await Camera.getPhoto({
          quality: 88,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Prompt,
          promptLabelHeader: "Profile Photo",
          promptLabelPhoto: "Choose from Gallery",
          promptLabelPicture: "Take Photo",
        });
        await uploadProfilePhoto(await fileFromNativePhoto(photo as NativePhoto));
        return;
      } catch (err) {
        if (err instanceof Error && /cancel/i.test(err.message)) return;
        fileInputRef.current?.click();
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const chooseBrowserProfilePhoto = async (file?: File) => {
    if (!file) return;
    await uploadProfilePhoto(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadProfilePhoto = async (file: File) => {
    setError("");
    setMessage("");
    const sourceType = normalizedImageType(file.type, file.name);
    if (!allowedSourceProfilePhotoTypes.includes(sourceType)) {
      setError("Unsupported image format. Please upload JPG, PNG, or WEBP.");
      return;
    }
    if (file.size > maxSourceProfilePhotoBytes) {
      setError("Image size is too large. Please upload a smaller photo.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const processedPhoto = await processProfilePhoto(file, sourceType);
      const form = new FormData();
      form.set("photo", processedPhoto);
      const response = await fetch("/api/profile/photo", { method: "POST", credentials: "include", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.profileImageUrl) {
        setError(profilePhotoApiError(data.error));
        return;
      }
      const nextUrl = String(data.profileImageUrl);
      setProfile(current => current ? { ...current, avatar: nextUrl, profileImageUrl: nextUrl } : current);
      setProfileImageUrl(nextUrl);
      notify("Profile photo updated");
    } catch (err) {
      setError(errorMessageFromUnknown(err));
    } finally {
      setUploadingPhoto(false);
    }
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
      credentials: "include",
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
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Logout failed");
      await clearMobileNativeSession().catch(() => null);
      setProfile(null);
      setDashboard(null);
      setTeam(null);
      setAi(null);
      setIncome(null);
      setUnreadNotifications(0);
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
    }
  };

  const copyUid = async () => {
    if (!profile?.uid) return;
    await navigator.clipboard?.writeText(profile.uid);
    notify("UID copied");
  };

  const copyReferral = async () => {
    if (!displayProfile?.referralLink) return;
    const shared = await nativeShareReferral(displayProfile.referralLink).catch(() => false);
    if (shared) {
      notify("Referral link shared");
      return;
    }
    await navigator.clipboard?.writeText(displayProfile.referralLink);
    notify("Referral link copied");
  };

  const navTo = (id: MobileNavTab, section?: string) => {
    if (id === "profile") return;
    if (id === "home") router.push("/dashboard");
    else if (id === "wallet") router.push(section && section !== "overview" ? `/dashboard?view=wallet&wallet=${section}` : "/dashboard?view=wallet");
    else router.push(`/dashboard?view=${id}`);
  };

  return (
    <main className="profile-page min-h-screen overflow-x-hidden text-white">
      <AppHeader
        title="Profile"
        subtitle="Account Center"
        initials={initials(profile?.fullName ?? "")}
        unreadNotifications={unreadNotifications}
        onNotifications={() => router.push("/dashboard?view=home")}
        onMenu={() => router.push("/")}
        onMenuButton={() => router.push("/")}
      />
      <div className="mx-auto w-full max-w-[420px] px-4 pb-40 pt-1 lg:max-w-3xl">
        {loading ? (
          <div className="profile-glass mt-1 rounded-[22px] p-5 text-sm text-slate-400">Loading profile...</div>
        ) : displayProfile ? (
          <div className="space-y-3">
            <ProfileHero
              profile={displayProfile}
              initialsText={initials(displayProfile.fullName)}
              kycTone={kycTone}
              totalBalance={totalBalance}
              totalIncome={totalIncome}
              referralIncome={referralIncome}
              teamSize={teamSize}
              copyUid={copyUid}
              uploadPhoto={chooseProfilePhoto}
              uploadingPhoto={uploadingPhoto}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={event => chooseBrowserProfilePhoto(event.target.files?.[0]).catch(err => setError(errorMessageFromUnknown(err)))}
            />

            <VipProgressCard currentVip={currentVip} nextVip={nextVip} progress={vipProgress} />

            <section>
              <div className="profile-menu-card">
                <ProfileRow icon={UserRound} tone="green" title="Account Information" subtitle="Name, email, country and profile details" onClick={() => router.push("/profile/account")} />
                <ProfileRow icon={ShieldCheck} tone="green" title="KYC Verification" subtitle="Identity verification status" pill={kycLabel(displayProfile.kycStatus)} pillTone={displayProfile.kycStatus === "APPROVED" ? "green" : "muted"} onClick={() => router.push("/kyc")} />
                <ProfileRow icon={LockKeyhole} tone="purple" title="Security" subtitle="Password and account access" onClick={() => router.push("/profile/security")} />
                <ProfileRow icon={WalletCards} tone="blue" title="Bind Your Wallet" subtitle="Connect your external crypto wallet" onClick={() => router.push("/profile/bind-wallet")} />
                <ProfileRow icon={Network} tone="yellow" title="Referral & Team" subtitle="Referral link and network overview" onClick={() => router.push("/profile/referral-team")} />
                <ProfileRow icon={Crown} tone="purple" title="VIP & Benefits" subtitle={`Current level ${currentVip}`} onClick={() => router.push("/profile/vip-benefits")} />
                <ProfileRow icon={Bot} tone="green" title="AI Subscription" subtitle="AI trading membership" pill={ai?.subscription?.active ? "Active" : "Inactive"} pillTone={ai?.subscription?.active ? "green" : "muted"} onClick={() => router.push("/profile/ai-subscription")} />
                <ProfileRow icon={Bell} tone="yellow" title="Notifications" subtitle={`${unreadNotifications} unread`} onClick={() => router.push("/profile/notifications")} />
                <ProfileRow icon={Settings} tone="gray" title="Settings" subtitle="Language and preferences" onClick={() => router.push("/profile/settings")} />
                <ProfileRow icon={Headphones} tone="blue" title="Support Center" subtitle="Help, tickets and account support" onClick={() => router.push("/profile/support")} />
                <ProfileRow icon={LogOut} tone="red" title="Logout" subtitle="End this session" onClick={logout} danger last />
              </div>
            </section>

            <ProfilePanels
              activePanel={activePanel}
              profile={displayProfile}
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

function ProfileHero({profile,initialsText,kycTone,totalBalance,totalIncome,referralIncome,teamSize,copyUid,uploadPhoto,uploadingPhoto}:{profile:Profile;initialsText:string;kycTone:string;totalBalance:number;totalIncome:number;referralIncome:number;teamSize:number;copyUid:()=>void;uploadPhoto:()=>void;uploadingPhoto:boolean}) {
  const photoUrl = profile.profileImageUrl || profile.avatar;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [photoUrl]);
  return (
    <section className="profile-hero-card">
      <div className="profile-hero-main">
        <button type="button" onClick={uploadPhoto} disabled={uploadingPhoto} className="profile-avatar" aria-label="Upload profile photo">
          <span className="profile-avatar-frame">
            {photoUrl && !imageFailed ? <img src={photoUrl} alt={profile.fullName || "Profile"} onError={() => setImageFailed(true)} /> : <span>{initialsText}</span>}
          </span>
          <span className="profile-camera"><Camera size={13}/></span>
        </button>
        <div className="profile-identity">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="profile-name">{profile.fullName || "—"}</h1>
            {profile.kycStatus === "APPROVED" && <CheckCircle2 size={16} className="shrink-0 text-[#18ff8a] drop-shadow-[0_0_10px_rgba(24,255,138,.55)]"/>}
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

function mimeFromFormat(format?: string) {
  const normalized = format?.toLowerCase();
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  if (normalized === "heic") return "image/heic";
  if (normalized === "heif") return "image/heif";
  return "image/jpeg";
}

function extensionFromMime(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  return "jpg";
}

async function fileFromNativePhoto(photo: NativePhoto) {
  if (photo.dataUrl) {
    const blob = dataUrlToBlob(photo.dataUrl);
    return new File([blob], `profile-photo.${extensionFromMime(blob.type || mimeFromFormat(photo.format))}`, { type: blob.type || mimeFromFormat(photo.format) });
  }
  if (photo.base64String) {
    const type = mimeFromFormat(photo.format);
    const blob = base64ToBlob(photo.base64String, type);
    return new File([blob], `profile-photo.${extensionFromMime(type)}`, { type });
  }
  const uri = photo.webPath || photo.path;
  if (!uri) throw new Error("Could not process this image. Please try another photo.");
  const source = photo.webPath ? uri : await nativePathToWebPath(uri);
  const response = await fetch(source);
  if (!response.ok) throw new Error("Could not process this image. Please try another photo.");
  const blob = await response.blob();
  const type = blob.type || mimeFromFormat(photo.format);
  return new File([blob], `profile-photo.${extensionFromMime(type)}`, { type });
}

async function nativePathToWebPath(pathValue: string) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.convertFileSrc(pathValue);
  } catch {
    return pathValue;
  }
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error("Could not process this image. Please try another photo.");
  const type = match[1] || "image/jpeg";
  const payload = match[3] || "";
  if (match[2]) return base64ToBlob(payload, type);
  return new Blob([decodeURIComponent(payload)], { type });
}

function base64ToBlob(base64: string, type: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function normalizedImageType(type: string, name = "") {
  const normalized = type.toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (normalized) return normalized;
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "";
}

async function processProfilePhoto(file: File, sourceType: string) {
  let loaded: Awaited<ReturnType<typeof loadImageForCanvas>> | null = null;
  try {
    loaded = await loadImageForCanvas(file);
  } catch {
    if (sourceType === "image/heic" || sourceType === "image/heif") {
      throw new Error("Unsupported image format. Please upload JPG, PNG, or WEBP.");
    }
    throw new Error("Could not process this image. Please try another photo.");
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = profilePhotoSize;
    canvas.height = profilePhotoSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not process this image. Please try another photo.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, profilePhotoSize, profilePhotoSize);
    const cropSize = Math.min(loaded.width, loaded.height);
    const cropX = Math.max(0, (loaded.width - cropSize) / 2);
    const cropY = Math.max(0, (loaded.height - cropSize) / 2);
    context.drawImage(loaded.image, cropX, cropY, cropSize, cropSize, 0, 0, profilePhotoSize, profilePhotoSize);

    for (const quality of [0.86, 0.78, 0.7, 0.62, 0.54]) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (blob.size <= maxProcessedProfilePhotoBytes) {
        return new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
      }
    }
    throw new Error("Image size is too large. Please upload a smaller photo.");
  } finally {
    loaded.cleanup();
  }
}

async function loadImageForCanvas(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch {
      // Fall through to HTMLImageElement decoding for WebViews that lack full bitmap support.
    }
  }

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not process this image. Please try another photo."));
  });
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error("Could not process this image. Please try another photo.");
  return blob;
}

function profilePhotoApiError(error: unknown) {
  if (typeof error !== "string") return "Could not process this image. Please try another photo.";
  if (/too large|size/i.test(error)) return "Image size is too large. Please upload a smaller photo.";
  if (/unsupported|format|png|jpg|jpeg|webp|heic/i.test(error)) return "Unsupported image format. Please upload JPG, PNG, or WEBP.";
  if (/process|image|photo/i.test(error)) return "Could not process this image. Please try another photo.";
  return error;
}

function errorMessageFromUnknown(error: unknown) {
  if (!(error instanceof Error)) return "Could not process this image. Please try another photo.";
  return profilePhotoApiError(error.message);
}

function VoltixVMark() {
  return <svg width="110" height="110" viewBox="0 0 115 115" className="profile-v-svg shrink-0" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="profileVoltixVFront" x1="32" y1="23" x2="75" y2="78" gradientUnits="userSpaceOnUse">
        <stop stopColor="#9CFFD9" />
        <stop offset=".48" stopColor="#1EFF88" />
        <stop offset="1" stopColor="#00B86B" />
      </linearGradient>
      <linearGradient id="profileVoltixVHighlight" x1="34" y1="25" x2="48" y2="74" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F3FFF9" stopOpacity=".95" />
        <stop offset=".55" stopColor="#9CFFD9" stopOpacity=".62" />
        <stop offset="1" stopColor="#1EFF88" stopOpacity=".08" />
      </linearGradient>
      <linearGradient id="profileVoltixGlass" x1="42" y1="30" x2="73" y2="67" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFFFFF" stopOpacity=".7" />
        <stop offset=".45" stopColor="#CFFFF0" stopOpacity=".16" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="profileVoltixPlatformGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(58 91) rotate(90) scale(17 42)">
        <stop stopColor="#1EFF88" stopOpacity=".42" />
        <stop offset=".62" stopColor="#00B86B" stopOpacity=".14" />
        <stop offset="1" stopColor="#00B86B" stopOpacity="0" />
      </radialGradient>
      <filter id="profileVoltixSoftGlow" x="11" y="8" width="93" height="88" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation="3.4" result="blur" />
        <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.117 0 0 0 0 1 0 0 0 0 0.533 0 0 0 .78 0" />
        <feBlend in="SourceGraphic" mode="screen" />
      </filter>
      <filter id="profileVoltixPlatformBlur" x="10" y="72" width="96" height="37" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
    </defs>
    <g className="profile-v-pulse" filter="url(#profileVoltixPlatformBlur)">
      <ellipse cx="58" cy="92" rx="38" ry="10" fill="url(#profileVoltixPlatformGlow)" />
    </g>
    <g>
      <ellipse cx="58" cy="88" rx="34" ry="10" fill="#06110D" stroke="#0D5E40" strokeOpacity=".7" />
      <g className="profile-v-ring"><ellipse cx="58" cy="88" rx="42" ry="12" stroke="#1EFF88" strokeOpacity=".5" strokeWidth="1.3" strokeDasharray="24 15" /></g>
      <g className="profile-v-ring-slow"><ellipse cx="58" cy="88" rx="31" ry="8" stroke="#9CFFD9" strokeOpacity=".42" strokeWidth="1" strokeDasharray="12 11" /></g>
      <ellipse cx="58" cy="88" rx="23" ry="5.8" stroke="#00B86B" strokeOpacity=".55" strokeWidth="1.1" />
      <ellipse cx="58" cy="88" rx="15" ry="3.8" fill="#020806" stroke="#123E2F" />
    </g>
    <g className="profile-v-pulse" opacity=".9" filter="url(#profileVoltixSoftGlow)">
      <path d="M30 22L52 76L58 88L64 76L85 22L71 22L58 58L45 22H30Z" fill="#1EFF88" opacity=".32" />
    </g>
    <g className="profile-v-float">
      <path d="M43 25H29L52 79L58 91L64 79L86 25H72L58 62L43 25Z" fill="url(#profileVoltixVFront)" />
      <path d="M72 25H86L64 79L58 91L58 62L72 25Z" fill="#006B43" opacity=".92" />
      <path d="M43 25H29L52 79L58 91L58 62L43 25Z" fill="url(#profileVoltixVFront)" />
      <path d="M35 28L53.5 72.5L57.8 81.3L61.4 73L75.7 28" stroke="#F4FFF9" strokeOpacity=".64" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 30L54 65L58 72L62 65L76 30H71L58 61L45 30H40Z" fill="url(#profileVoltixGlass)" opacity=".78" />
      <path d="M58 62L72 25H78L61 69L58 75V62Z" fill="#003B2A" opacity=".35" />
      <path d="M29 25L43 25L58 62V71L50 57L34 25H29Z" fill="url(#profileVoltixVHighlight)" opacity=".72" />
      <path d="M43 25H29L52 79L58 91L64 79L86 25H72L58 62L43 25Z" stroke="#9CFFD9" strokeOpacity=".34" strokeWidth="1" strokeLinejoin="round" />
    </g>
    <g fill="#9CFFD9">
      <circle className="profile-v-particle" cx="23" cy="45" r="1.4" opacity=".38" />
      <circle className="profile-v-particle" cx="91" cy="47" r="1.2" opacity=".32" />
      <circle className="profile-v-particle" cx="82" cy="73" r="1" opacity=".3" />
      <circle className="profile-v-particle" cx="35" cy="78" r="1.1" opacity=".26" />
    </g>
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
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[15px] font-black text-white">{currentVip}</p>
          <p className="text-[10px] font-bold text-slate-500">Current Level</p>
        </div>
        <div>
          <p className="text-[15px] font-black text-white">{nextVip}</p>
          <p className="text-[10px] font-bold text-slate-500">Next Level</p>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/40">
        <div className="h-full rounded-full bg-gradient-to-r from-[#18ff8a] to-[#00c96b] shadow-[0_0_16px_rgba(24,255,138,.42)]" style={{width:`${progress}%`}}/>
      </div>
      <p className="mt-2 text-center text-[11px] font-bold text-slate-500">— / — VIP Points</p>
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
