"use client";

import { useEffect, useRef, useState } from "react";

type TransactionPinInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
};

const pinLength = 6;

export function TransactionPinInput({ label, value, onChange, autoFocus = false, disabled = false }: TransactionPinInputProps) {
  const [visible, setVisible] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: pinLength }, (_, index) => value[index] ?? "");

  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => inputs.current[0]?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  const setPin = (next: string, focusIndex?: number) => {
    onChange(cleanPin(next));
    if (focusIndex !== undefined) window.setTimeout(() => inputs.current[focusIndex]?.focus(), 0);
  };

  const changeDigit = (index: number, raw: string) => {
    const clean = cleanPin(raw);
    if (clean.length > 1) {
      setPin(clean, Math.min(clean.length, pinLength) - 1);
      return;
    }
    const next = digits.slice();
    next[index] = clean;
    setPin(next.join(""), clean && index < pinLength - 1 ? index + 1 : index);
  };

  const keyDown = (index: number, key: string) => {
    if (key !== "Backspace") return;
    if (digits[index]) {
      const next = digits.slice();
      next[index] = "";
      setPin(next.join(""), index);
      return;
    }
    if (index > 0) {
      const next = digits.slice();
      next[index - 1] = "";
      setPin(next.join(""), index - 1);
    }
  };

  const pastePin = (index: number, text: string) => {
    const clean = cleanPin(text);
    if (!clean) return;
    if (clean.length === pinLength) {
      setPin(clean, pinLength - 1);
      return;
    }
    const next = digits.slice();
    clean.split("").forEach((digit, offset) => {
      if (index + offset < pinLength) next[index + offset] = digit;
    });
    setPin(next.join(""), Math.min(index + clean.length, pinLength - 1));
  };

  return <div>
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs font-bold text-slate-400">{label}</label>
      <button type="button" onClick={() => setVisible(current => !current)} className="rounded-lg border border-[#18ff8a]/20 bg-[#18ff8a]/10 px-2.5 py-1 text-[10px] font-black text-[#18ff8a]">
        {visible ? "Hide" : "Show"}
      </button>
    </div>
    <div className="mt-2 grid grid-cols-6 gap-1.5 min-[390px]:gap-2">
      {digits.map((digit, index) => <input
        key={index}
        ref={element => { inputs.current[index] = element; }}
        value={digit ? visible ? digit : "●" : ""}
        disabled={disabled}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete={index === 0 ? "one-time-code" : "off"}
        aria-label={`${label} digit ${index + 1}`}
        maxLength={1}
        onChange={event => changeDigit(index, event.target.value)}
        onKeyDown={event => keyDown(index, event.key)}
        onPaste={event => {
          event.preventDefault();
          pastePin(index, event.clipboardData.getData("text"));
        }}
        onFocus={event => event.target.select()}
        className="aspect-square min-w-0 rounded-xl border border-white/[.08] bg-black/25 text-center text-lg font-black text-white outline-none transition focus:border-[#18ff8a] focus:bg-[#18ff8a]/10 focus:shadow-[0_0_18px_rgba(24,255,138,.24)] disabled:opacity-50"
      />)}
    </div>
  </div>;
}

function cleanPin(value: string) {
  return value.replace(/\D/g, "").slice(0, pinLength);
}
