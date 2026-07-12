"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { SelectOption } from "@/lib/profile-options";

export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Search",
  className = "",
}: {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find(option => option.value === value) ?? options[0];
  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return clean ? options.filter(option => option.search.includes(clean)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className={`relative block text-xs font-bold text-slate-400 ${className}`}>
      <p>{label}</p>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setQuery("");
          setOpen(current => !current);
        }}
        className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-line bg-ink px-4 py-3 text-left outline-none transition-colors hover:border-lime/30 focus:border-lime/50"
      >
        <Search size={16} className="shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{selected?.label || placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-line bg-[#08100d] p-2 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-2 rounded-xl bg-white/[.04] px-3 py-2 focus-within:ring-1 focus-within:ring-lime/40">
          <Search size={16} className="shrink-0 text-slate-500" />
          <input
            ref={searchRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-500"
          />
          </div>
          <div role="listbox" aria-label={label} className="mt-2 max-h-48 overflow-y-auto overscroll-contain pr-1">
          {filtered.map(option => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setQuery("");
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-bold ${option.value === value ? "bg-lime text-ink" : "text-slate-200 hover:bg-white/[.05]"}`}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && <Check size={16} className="shrink-0" />}
            </button>
          ))}
          {!filtered.length && <p className="px-3 py-4 text-center text-xs text-slate-500">No matches</p>}
          </div>
        </div>
      )}
    </div>
  );
}
