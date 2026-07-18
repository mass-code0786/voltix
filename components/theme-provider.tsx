"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePreference = "dark" | "aqua" | "system";
type ResolvedTheme = "dark" | "aqua";

const STORAGE_KEY = "voltix-theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "aqua" : "dark";
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = preference === "system" ? systemTheme() : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved === "aqua" ? "light" : "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "aqua" ? "#effaff" : "#050807");
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial: ThemePreference = stored === "aqua" || stored === "system" || stored === "dark" ? stored : "dark";
    setPreferenceState(initial);
    setResolvedTheme(applyTheme(initial));
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => preference === "system" && setResolvedTheme(applyTheme("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    setPreferenceState(next);
    setResolvedTheme(applyTheme(next));
  }, []);

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}

export const themeBootstrapScript = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}');if(p!=='aqua'&&p!=='system'&&p!=='dark')p='dark';var t=p==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'aqua':'dark'):p;var e=document.documentElement;e.dataset.theme=t;e.dataset.themePreference=p;e.style.colorScheme=t==='aqua'?'light':'dark';}catch(e){document.documentElement.dataset.theme='dark'}})();`;
