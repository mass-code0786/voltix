"use client";

import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import { Bell, ChevronRight, Menu, Search } from "lucide-react";
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
  onMenuButton?: () => void;
  onNotifications: () => void;
  onMenu: () => void;
};

export function AppHeader({ title, subtitle, compactBrand = true, initials, unreadNotifications = 0, onMenuButton, onNotifications, onMenu }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-[72px] bg-[#060a08]/72 px-5 backdrop-blur-2xl lg:border-b lg:border-white/[.06]">
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
    <nav className="fixed inset-x-0 bottom-3 z-50 px-4 lg:hidden">
      <div className="mx-auto flex h-[66px] max-w-[390px] items-center justify-around rounded-full border border-white/[.18] bg-black/70 px-2 shadow-[0_-14px_42px_rgba(0,0,0,.48),0_0_26px_rgba(24,255,138,.14),inset_0_1px_0_rgba(255,255,255,.09)] backdrop-blur-2xl">
        {items.map(({ id, label, icon: Icon, section }) => {
          const active = activeId === id && (!section || activeSection === section);
          const center = label.toLowerCase().includes("ai");
          return (
            <button key={`${id}-${section ?? label}`} onClick={() => onSelect(id, section)} aria-current={active ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-black transition ${active ? "text-[#18ff8a]" : "text-slate-500"}`}>
              <span className={`${center ? "-mt-7 h-14 w-14 rounded-full border-[#18ff8a]/40 bg-[radial-gradient(circle_at_35%_25%,#f4fff9,#18ff8a_45%,#036b41)] text-[#050608] shadow-[0_0_28px_rgba(24,255,138,.58)]" : `h-7 w-8 rounded-2xl ${active ? "border-[#18ff8a]/25 bg-[#18ff8a]/10 shadow-[0_0_20px_rgba(24,255,138,.16)]" : "border-transparent bg-transparent"}`} grid place-items-center border transition`}>
                {center ? <span className="text-lg font-black">V</span> : <Icon size={19} strokeWidth={active ? 2.5 : 1.9} />}
              </span>
              <span className={`truncate ${center ? "-mt-1" : ""}`}>{labelFor(id)}</span>
            </button>
          );
        })}
      </div>
    </nav>
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
    <div className="grid place-items-center px-5 py-10 text-center text-xs text-slate-500">
      {Icon && <span className="mb-3 grid h-11 w-11 place-items-center rounded-2xl border border-line bg-white/[.035] text-lime"><Icon size={18} /></span>}
      {title}
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
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-lime/10 text-lime transition group-hover:shadow-[0_0_20px_rgba(184,242,59,.18)]"><Icon size={18} /></span>
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
    <GlassCard className="relative overflow-hidden rounded-[28px] p-5 sm:p-7">
      <div className="absolute right-0 -top-20 h-56 w-56 rounded-full border-[34px] border-lime/[.035]" />
      <div className="absolute bottom-0 right-8 h-24 w-24 rounded-full bg-lime/[.06] blur-3xl" />
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
