"use client";

import { useCallback, useEffect, useState } from "react";
import {
  interfacePreferenceCookie,
  interfacePreferenceStorageKey,
  parseInterfacePreference,
  type InterfacePreference,
} from "@/lib/interface-preference";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function cookiePreference() {
  const value = document.cookie.split("; ").find(entry => entry.startsWith(`${interfacePreferenceCookie}=`))?.split("=")[1];
  return value === "clean" || value === "current" ? value : null;
}

function persist(preference: InterfacePreference) {
  localStorage.setItem(interfacePreferenceStorageKey, preference);
  document.cookie = `${interfacePreferenceCookie}=${preference}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function useInterfacePreference() {
  const [preference, setPreferenceState] = useState<InterfacePreference>("current");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cookie = cookiePreference();
    const stored = localStorage.getItem(interfacePreferenceStorageKey);
    const resolved = cookie ?? parseInterfacePreference(stored);
    persist(resolved);
    setPreferenceState(resolved);
    setReady(true);
  }, []);

  const setPreference = useCallback((next: InterfacePreference) => {
    const safe = parseInterfacePreference(next);
    persist(safe);
    setPreferenceState(safe);
  }, []);

  return { preference, setPreference, ready };
}
