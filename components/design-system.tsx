"use client";

import type { ComponentType, ReactNode } from "react";
import { useId, type InputHTMLAttributes } from "react";
import type { LucideProps } from "lucide-react";
import { ArrowLeft, Bell, ChevronRight, Menu, Search } from "lucide-react";
import { CoinMark } from "./coin-mark";
import { Sparkline } from "./sparkline";
import { compact } from "@/lib/format";
import { currencyConfigForCountry, formatLocalCurrency } from "@/lib/local-currency";

type IconType = ComponentType<LucideProps>;

type NavItem<T extends string> = {
  id: T;
  label: string;
  icon: IconType;
  section?: string;
};

type HeaderProps = {
  title: string;
  subtitle?: string;
  compactBrand?: boolean;
  initials: string;
  unreadNotifications?: number;
  variant?: "default" | "ai";
  onBack?: () => void;
  onMenuButton?: () => void;
  onNotifications: () => void;
  onMenu: () => void;
};

export function AppHeader({ title, subtitle, compactBrand = true, initials, unreadNotifications = 0, variant = "default", onBack, onMenuButton, onNotifications, onMenu }: HeaderProps) {
  if (variant === "ai") {
    return (
      <header className="voltix-app-header sticky top-0 z-30 h-[62px] bg-[#050807]/82 px-4 backdrop-blur-2xl lg:border-b lg:border-white/[.06]">
        <div className="mx-auto flex h-[72px] max-w-[420px] items-center justify-between gap-3 lg:max-w-6xl">
          <div className="flex min-w-0 items-center gap-2.5">
            <button onClick={onBack} className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full border border-white/[.1] bg-white/[.045] text-white shadow-[0_0_24px_rgba(24,255,138,.12),inset_0_1px_0_rgba(255,255,255,.08)]" aria-label="Back">
              <ArrowLeft size={20} />
            </button>
            <img src="/logo.png" alt="VOLTIX" className="block h-[35px] w-auto max-w-none object-contain opacity-100 mix-blend-normal filter-none transform-none" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={onNotifications} className="relative grid h-[42px] w-[42px] place-items-center rounded-full border border-white/[.1] bg-white/[.045] text-slate-200 shadow-[0_0_24px_rgba(24,255,138,.14),inset_0_1px_0_rgba(255,255,255,.08)]" aria-label="Notifications">
              <Bell size={19} />
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border border-[#050807] bg-[#18ff8a] shadow-[0_0_10px_rgba(24,255,138,.7)]" />
              {unreadNotifications > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#18ff8a] px-1 text-[10px] font-black text-[#050608]">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
            </button>
            <button onClick={onMenuButton ?? onMenu} className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[13px] font-black text-[#18ff8a] shadow-[0_0_28px_rgba(24,255,138,.18),inset_0_1px_0_rgba(255,255,255,.1)]" aria-label="Open profile menu">
              {initials}
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="voltix-app-header sticky top-0 z-30 h-[62px] bg-[#060a08]/72 px-5 backdrop-blur-2xl lg:border-b lg:border-white/[.06]">
      <div className="mx-auto flex h-[72px] max-w-[420px] items-center justify-between gap-3 lg:max-w-6xl">
        <div className="flex h-[48px] w-fit shrink-0 items-center justify-start">
          <img src="/logo.png" alt="VOLTIX" className="block h-[21px] w-auto max-w-none object-contain opacity-100 mix-blend-normal filter-none transform-none" />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={onNotifications} className="relative grid h-9 w-9 place-items-center rounded-full border border-white/[.08] bg-white/[.045] text-slate-200 shadow-[0_0_24px_rgba(24,255,138,.1),inset_0_1px_0_rgba(255,255,255,.08)]" aria-label="Notifications">
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-[#060a08] bg-[#18ff8a] shadow-[0_0_10px_rgba(24,255,138,.7)]" />
            {unreadNotifications > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#18ff8a] px-1 text-[10px] font-black text-[#050608] shadow-[0_0_18px_rgba(24,255,138,.42)]">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}
          </button>
          <button onClick={onMenuButton ?? onMenu} className="grid h-9 w-9 shrink-0 place-items-center rounded-[14px] border border-white/[.08] bg-white/[.035] text-white shadow-[0_10px_28px_rgba(0,0,0,.28),inset_0_1px_0_rgba(255,255,255,.08)]" aria-label="Open menu">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </header>
  );
}

type BottomNavProps<T extends string> = {
  items: NavItem<T>[];
  activeId: T;
  activeSection?: string;
  labelFor: (id: T) => string;
  onSelect: (id: T, section?: string) => void;
};

export function BottomNav<T extends string>({ items, activeId, activeSection, labelFor, onSelect }: BottomNavProps<T>) {
  return (
    <nav className="voltix-bottom-nav fixed bottom-3 left-4 right-4 z-50 mx-auto max-w-[430px] lg:hidden">
      <div className="relative mx-auto flex h-[66px] w-full max-w-full items-center justify-around rounded-full border border-white/[.12] bg-[rgba(5,8,7,0.88)] px-2 shadow-[0_-14px_42px_rgba(0,0,0,.48),0_0_26px_rgba(24,255,138,.14),inset_0_1px_0_rgba(255,255,255,.09)] backdrop-blur-2xl">
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 z-0 h-14 w-14 -translate-x-1/2 -translate-y-7 rounded-full bg-[rgba(5,8,7,0.88)] shadow-[0_0_14px_rgba(24,255,138,0.18),inset_0_1px_0_rgba(255,255,255,.09)] backdrop-blur-2xl" />
        {items.map(({ id, label, icon: Icon, section }) => {
          const active = activeId === id && (!section || activeSection === section);
          const center = label.toLowerCase().includes("ai");
          return (
            <button key={`${id}-${section ?? label}`} onClick={() => onSelect(id, section)} aria-current={active ? "page" : undefined} className={`relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-black transition ${active ? "text-[#18ff8a]" : "text-slate-500"}`}>
              <span className={`${center ? "-mt-7 h-14 w-14 rounded-full border-2 border-[#18ff8a] bg-[radial-gradient(circle_at_35%_24%,rgba(24,255,138,0.18),rgba(5,12,10,0.92)_68%)] shadow-[0_0_14px_rgba(24,255,138,0.35),0_0_28px_rgba(24,255,138,0.18),inset_0_0_14px_rgba(24,255,138,0.12)]" : `h-7 w-8 rounded-2xl ${active ? "border-[#18ff8a]/25 bg-[#18ff8a]/10 shadow-[0_0_20px_rgba(24,255,138,.16)]" : "border-transparent bg-transparent"}`} grid place-items-center border transition`}>
                {center ? <VoltixNavLogoMark /> : <Icon size={19} strokeWidth={active ? 2.5 : 1.9} />}
              </span>
              <span className={`truncate ${center ? "-mt-1" : ""}`}>{labelFor(id)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function VoltixNavLogoMark() {
  const id = useId().replace(/:/g, "");
  const frontId = `${id}-front`;
  const highlightId = `${id}-highlight`;
  const glassId = `${id}-glass`;
  const glowId = `${id}-glow`;

  return (
    <svg aria-hidden="true" className="h-9 w-9 drop-shadow-[0_0_8px_rgba(24,255,138,0.55)]" viewBox="0 0 115 115" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={frontId} x1="32" y1="23" x2="75" y2="78" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9CFFD9" />
          <stop offset=".48" stopColor="#1EFF88" />
          <stop offset="1" stopColor="#00B86B" />
        </linearGradient>
        <linearGradient id={highlightId} x1="34" y1="25" x2="48" y2="74" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F3FFF9" stopOpacity=".95" />
          <stop offset=".55" stopColor="#9CFFD9" stopOpacity=".62" />
          <stop offset="1" stopColor="#1EFF88" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id={glassId} x1="42" y1="30" x2="73" y2="67" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity=".7" />
          <stop offset=".45" stopColor="#CFFFF0" stopOpacity=".16" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="11" y="8" width="93" height="88" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="3.4" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.117 0 0 0 0 1 0 0 0 0 0.533 0 0 0 .78 0" />
          <feBlend in="SourceGraphic" mode="screen" />
        </filter>
      </defs>
      <g filter={`url(#${glowId})`}>
        <path d="M30 22L52 76L58 88L64 76L85 22L71 22L58 58L45 22H30Z" fill="#1EFF88" opacity=".32" />
      </g>
      <path d="M43 25H29L52 79L58 91L64 79L86 25H72L58 62L43 25Z" fill={`url(#${frontId})`} />
      <path d="M72 25H86L64 79L58 91L58 62L72 25Z" fill="#006B43" opacity=".92" />
      <path d="M43 25H29L52 79L58 91L58 62L43 25Z" fill={`url(#${frontId})`} />
      <path d="M35 28L53.5 72.5L57.8 81.3L61.4 73L75.7 28" stroke="#F4FFF9" strokeOpacity=".64" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 30L54 65L58 72L62 65L76 30H71L58 61L45 30H40Z" fill={`url(#${glassId})`} opacity=".78" />
      <path d="M58 62L72 25H78L61 69L58 75V62Z" fill="#003B2A" opacity=".35" />
      <path d="M29 25L43 25L58 62V71L50 57L34 25H29Z" fill={`url(#${highlightId})`} opacity=".72" />
      <path d="M43 25H29L52 79L58 91L64 79L86 25H72L58 62L43 25Z" stroke="#9CFFD9" strokeOpacity=".34" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

export function GlassCard({ children, className = "", as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={`glass-panel card-3d ${className}`}>{children}</Tag>;
}

export function NeonButton({ children, onClick, className = "", type = "button" }: { children: ReactNode; onClick?: () => void; className?: string; type?: "button" | "submit" }) {
  return <button type={type} onClick={onClick} className={`neon-button ${className}`}>{children}</button>;
}

export function StatCard({ label, value, trend, icon: Icon }: { label: string; value: string; trend?: string; icon?: IconType }) {
  return (
    <GlassCard as="div" className="rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
          <p className="mt-2 truncate text-lg font-black text-white">{value}</p>
          {trend && <p className="mt-1 text-xs font-bold text-mint">{trend}</p>}
        </div>
        {Icon && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-lime/10 text-lime"><Icon size={18} /></span>}
      </div>
    </GlassCard>
  );
}

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-1.5 pt-3">
      <h2 className="text-[14px] font-black text-white">{title}</h2>
      {actionLabel && <button onClick={onAction} className="text-[10px] font-black text-lime">{actionLabel}</button>}
    </div>
  );
}

export function EmptyState({ title, icon: Icon }: { title: string; icon?: IconType }) {
  return (
    <div className="premium-empty-state">
      <svg viewBox="0 0 96 72" aria-hidden="true">
        <defs><radialGradient id="emptyGlow" cx="50%" cy="65%" r="55%"><stop stopColor="#18ff8a" stopOpacity=".38"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient></defs>
        <ellipse cx="48" cy="58" rx="34" ry="10" fill="url(#emptyGlow)"/>
        <ellipse cx="48" cy="54" rx="29" ry="8" fill="#06110d" stroke="#18ff8a" strokeOpacity=".38" strokeDasharray="18 10"/>
        <path d="M34 18h28l10 10v18H24V28l10-10Z" fill="rgba(24,255,138,.08)" stroke="#18ff8a" strokeOpacity=".35"/>
        <path d="M36 34h24M40 43h16" stroke="#9cffd9" strokeOpacity=".45" strokeLinecap="round"/>
      </svg>
      {Icon && <span><Icon size={18} /></span>}
      <p>{title}</p>
    </div>
  );
}

export function StatusBadge({ children, tone = "live" }: { children: ReactNode; tone?: "live" | "muted" | "danger" }) {
  const style = tone === "danger" ? "border-danger/20 bg-danger/10 text-danger" : tone === "muted" ? "border-white/10 bg-white/[.04] text-slate-400" : "border-lime/20 bg-lime/10 text-lime";
  return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${style}`}>{children}</span>;
}

export function ActionTile({ icon: Icon, label, onClick }: { icon: IconType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-2xl border border-white/[.06] bg-white/[.045] px-2 py-3 text-center text-xs font-bold text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] transition hover:border-lime/25 hover:bg-lime/[.07]">
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-lime/10 text-lime transition group-hover:shadow-[0_0_20px_rgba(24,255,138,.35)]"><Icon size={18} /></span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

type CoinRowProps = {
  coin: {
    symbol: string;
    name: string;
    color: string;
    price: number;
    change: number;
    spark: number[];
    localLogoPath?: string | null;
    volume?: number;
    live?: boolean;
  };
  action?: () => void;
  localCurrency?: ReturnType<typeof currencyConfigForCountry>;
};

export function CoinRow({ coin, action, localCurrency = currencyConfigForCountry() }: CoinRowProps) {
  const shown = coin.price < .001 ? coin.price.toFixed(8) : coin.price < 1 ? coin.price.toFixed(4) : coin.price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <CoinMark symbol={coin.symbol} color={coin.color} logoPath={coin.localLogoPath} />
        <div className="min-w-0">
          <div className="truncate font-bold text-white">{coin.symbol}<span className="ml-1.5 text-[10px] font-normal text-slate-500">/USDT</span></div>
          <p className="mt-1 truncate text-xs text-slate-500">{coin.name}</p>
          <p className="mt-1 text-[9px] text-slate-600">24h vol {coin.live && coin.volume !== undefined ? compact(coin.volume) : "--"}</p>
        </div>
      </div>
      <div className="hidden sm:block"><Sparkline data={coin.spark} positive={coin.change >= 0} /></div>
      <div className="min-w-[88px] text-right">
        <p className="text-sm font-black text-white">{coin.live ? `$${shown}` : "--"}</p>
        {coin.live && <p className="mt-1 text-[11px] text-slate-500">{formatLocalCurrency(coin.price, localCurrency)}</p>}
        <p className={`mt-1 text-xs font-black ${coin.change >= 0 ? "text-mint" : "text-danger"}`}>{coin.live ? `${coin.change >= 0 ? "+" : ""}${coin.change.toFixed(2)}%` : "Live"}</p>
      </div>
    </>
  );

  if (action) {
    return <button onClick={action} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[.025]">{content}</button>;
  }

  return <div className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-4">{content}</div>;
}

export function PageHero({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return (
    <GlassCard className="premium-page-hero">
      <svg viewBox="0 0 180 126" aria-hidden="true">
        <defs><radialGradient id="pageHeroGlow" cx="50%" cy="65%" r="58%"><stop stopColor="#18ff8a" stopOpacity=".42"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient></defs>
        <ellipse cx="128" cy="100" rx="44" ry="13" fill="url(#pageHeroGlow)"/>
        <ellipse cx="128" cy="96" rx="39" ry="10" fill="#06110d" stroke="#18ff8a" strokeOpacity=".35" strokeDasharray="22 12"/>
        <path d="M112 35h-12l21 48 7 13 7-13 21-48h-12l-16 38-16-38Z" fill="#18ff8a" fillOpacity=".28" stroke="#9cffd9" strokeOpacity=".42"/>
      </svg>
      <div className="relative">
        {eyebrow && <p className="mb-2 text-[10px] font-black uppercase tracking-[.18em] text-lime">{eyebrow}</p>}
        <h2 className="max-w-xl text-2xl font-black tracking-tight text-white sm:text-4xl">{title}</h2>
        {description && <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </GlassCard>
  );
}

export function PremiumSearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="premium-input w-full py-3.5 pl-11 pr-4 text-sm" />
    </div>
  );
}

export function RowChevron() {
  return <ChevronRight size={18} className="text-slate-600" />;
}

/* Theme-token primitives for new screens. Existing exports remain compatible. */
export const PageHeader = AppHeader;
export const BottomNavigation = BottomNav;

export function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`theme-section-card ${className}`}>{children}</section>;
}

export function BalanceCard({ label, value, children, className = "" }: { label: string; value: string; children?: ReactNode; className?: string }) {
  return <section className={`theme-balance-card ${className}`}><p>{label}</p><strong>{value}</strong>{children}</section>;
}

export function ActionButton({ children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`theme-action-button ${className}`} {...props}>{children}</button>;
}

export function ListRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`theme-list-row ${className}`}>{children}</div>;
}

export function FormField({ label, className = "", ...props }: { label: string; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className={`theme-form-field ${className}`}><span>{label}</span><input {...props} /></label>;
}

export function Modal({ children, open, onClose, label = "Dialog" }: { children: ReactNode; open: boolean; onClose: () => void; label?: string }) {
  if (!open) return null;
  return <div className="theme-modal-overlay" role="presentation" onMouseDown={onClose}><section className="theme-modal" role="dialog" aria-modal="true" aria-label={label} onMouseDown={event=>event.stopPropagation()}>{children}</section></div>;
}

export function BottomSheet({ children, open, onClose, label = "Bottom sheet" }: { children: ReactNode; open: boolean; onClose: () => void; label?: string }) {
  if (!open) return null;
  return <div className="theme-modal-overlay theme-sheet-overlay" role="presentation" onMouseDown={onClose}><section className="theme-bottom-sheet" role="dialog" aria-modal="true" aria-label={label} onMouseDown={event=>event.stopPropagation()}><i aria-hidden="true" />{children}</section></div>;
}

export function Tabs<T extends string>({ items, value, onChange }: { items: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <div className="theme-tabs" role="tablist">{items.map(item=><button key={item.value} role="tab" aria-selected={item.value===value} onClick={()=>onChange(item.value)}>{item.label}</button>)}</div>;
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const bounded=Math.max(0,Math.min(100,value));
  return <div className="theme-progress" aria-label={label} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}><span style={{width:`${bounded}%`}} /></div>;
}
