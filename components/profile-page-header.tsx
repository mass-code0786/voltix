"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

type ProfilePageHeaderProps = {
  title: string;
  icon?: LucideIcon;
  backHref?: string;
  onBack?: () => void;
  subtitle?: ReactNode;
  rightAction?: ReactNode;
  className?: string;
};

const backButtonClass = "grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/[.08] bg-black/25 text-[#18ff8a]";

export function ProfilePageHeader({
  title,
  icon: Icon,
  backHref = "/profile",
  onBack,
  subtitle,
  rightAction,
  className,
}: ProfilePageHeaderProps) {
  const backControl = onBack ? (
    <button type="button" onClick={onBack} className={backButtonClass} aria-label="Back to profile">
      <ArrowLeft size={20} />
    </button>
  ) : (
    <Link href={backHref} className={backButtonClass} aria-label="Back to profile">
      <ArrowLeft size={20} />
    </Link>
  );

  return (
    <header className={`profile-glass rounded-[22px] px-4 py-4${className ? ` ${className}` : ""}`}>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-3 sm:gap-4">
        {backControl}
        <div className="min-w-0 text-center">
          <h1 className="break-words text-2xl font-black leading-tight">{title}</h1>
          {subtitle && <div className="mt-1 text-sm leading-tight text-slate-500">{subtitle}</div>}
        </div>
        {rightAction ?? (Icon ? (
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]">
            <Icon size={20} />
          </div>
        ) : <span className="h-12 w-12" aria-hidden="true" />)}
      </div>
    </header>
  );
}
