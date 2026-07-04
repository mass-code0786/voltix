"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
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
  const selected = options.find(option => option.value === value) ?? options[0];
  const filtered = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return clean ? options.filter(option => option.search.includes(clean)).slice(0, 80) : options.slice(0, 80);
  }, [options, query]);

  return (
    <label className={`block text-xs font-bold text-slate-400 ${className}`}>
      {label}
      <div className="mt-2 rounded-2xl border border-line bg-ink p-2 focus-within:border-lime/50">
        <div className="flex items-center gap-2 rounded-xl bg-white/[.04] px-3 py-2">
          <Search size={16} className="shrink-0 text-slate-500" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={selected?.label || placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-500"
          />
        </div>
        <div className="mt-2 max-h-56 overflow-y-auto pr-1">
          {filtered.map(option => (
            <button
              type="button"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setQuery("");
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
    </label>
  );
}

