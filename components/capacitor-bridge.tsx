"use client";

import { useEffect, useState } from "react";
import { getMobileSessionTokenWithBiometric, getNativePlatform, hapticImpact, isVoltixNativeApp, mobileFetchHeaders, savePushToken } from "@/lib/mobile-native";

const VOLTIX_STATUS_BAR_COLOR = "#050b08";
const refreshRoutes = ["/dashboard", "/profile"];
type CapacitorNetwork = typeof import("@capacitor/network").Network;

export function CapacitorBridge() {
  const [offline, setOffline] = useState(false);
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    let startupTasksDone = false;

    async function configureNativeShell() {
      const [{ Capacitor }, { App }, { StatusBar, Style }, { SplashScreen }, { Keyboard, KeyboardResize, KeyboardStyle }, { Network }] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/app"),
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
        import("@capacitor/keyboard"),
        import("@capacitor/network"),
      ]);

      if (!Capacitor.isNativePlatform()) return;
      setBooting(true);
      document.documentElement.classList.add("voltix-capacitor");
      document.body.classList.add("voltix-capacitor");

      await Promise.allSettled([
        StatusBar.setStyle({ style: Style.Dark }),
        StatusBar.setBackgroundColor({ color: VOLTIX_STATUS_BAR_COLOR }),
        StatusBar.setOverlaysWebView({ overlay: false }),
        Keyboard.setResizeMode({ mode: KeyboardResize.Body }),
        Keyboard.setStyle({ style: KeyboardStyle.Dark }),
      ]);

      const runStartupTasks = async () => {
        if (startupTasksDone) return;
        startupTasksDone = true;
        await Promise.allSettled([restoreMobileSession(), registerPushNotifications(), checkForAppUpdate()]);
      };
      const refreshConnectivity = async () => {
        const reachable = await isNativeOnline(Network);
        if (!disposed) setOffline(!reachable);
        return reachable;
      };
      const reconnectHandler = () => {
        setBooting(true);
        refreshConnectivity()
          .then(async reachable => {
            if (reachable) await runStartupTasks();
          })
          .finally(() => {
            if (!disposed) setBooting(false);
          });
      };
      const backListener = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
          return;
        }
        App.exitApp();
      });
      const urlListener = await App.addListener("appUrlOpen", ({ url }) => handleDeepLink(url));
      const networkListener = await Network.addListener("networkStatusChange", status => {
        if (!status.connected) {
          setOffline(true);
          return;
        }
        reconnectHandler();
      });
      const clickHandler = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button,a,[role='button']")) hapticImpact("light").catch(() => null);
      };
      const refreshCleanup = installPullToRefresh();
      document.addEventListener("click", clickHandler, { passive: true });
      window.addEventListener("voltix:native-reconnect", reconnectHandler);

      try {
        const reachable = await refreshConnectivity();
        if (reachable) await runStartupTasks();
      } finally {
        await SplashScreen.hide().catch(() => null);
        if (!disposed) setBooting(false);
      }

      cleanup = () => {
        disposed = true;
        backListener.remove();
        urlListener.remove();
        networkListener.remove();
        document.removeEventListener("click", clickHandler);
        window.removeEventListener("voltix:native-reconnect", reconnectHandler);
        refreshCleanup();
        document.documentElement.classList.remove("voltix-capacitor");
        document.body.classList.remove("voltix-capacitor");
      };
    }

    configureNativeShell().catch(() => {
      setBooting(false);
      cleanup = undefined;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  if (offline) return <OfflineScreen retry={() => window.dispatchEvent(new CustomEvent("voltix:native-reconnect"))} />;
  if (booting) return <VoltixNativeLoader />;
  return null;
}

async function isNativeOnline(Network: CapacitorNetwork) {
  const status = await Network.getStatus().catch(() => ({ connected: true }));
  if (!status.connected) return false;
  return canReachApi();
}

async function canReachApi() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("/api/health", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function restoreMobileSession() {
  const me = await fetch("/api/me", { credentials: "include", cache: "no-store" }).then(response => response.ok ? response.json() : null).catch(() => null);
  if (me?.authenticated) return;
  const token = await getMobileSessionTokenWithBiometric("Unlock Voltix");
  if (!token) return;
  const response = await fetch("/api/auth/mobile-session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await mobileFetchHeaders()) },
    body: JSON.stringify({ token }),
  });
  if (response.ok && !window.location.pathname.startsWith("/dashboard")) window.location.replace("/dashboard");
}

async function registerPushNotifications() {
  if (!(await isVoltixNativeApp())) return;
  const me = await fetch("/api/me", { credentials: "include", cache: "no-store" }).then(response => response.ok ? response.json() : null).catch(() => null);
  if (!me?.authenticated) return;
  const [{ PushNotifications }, platform] = await Promise.all([import("@capacitor/push-notifications"), getNativePlatform()]);
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return;
  await PushNotifications.register();
  const registrationListener = await PushNotifications.addListener("registration", async token => {
    await savePushToken(token.value);
    await fetch("/api/mobile/push-token", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.value, platform }),
    }).catch(() => null);
    registrationListener.remove();
  });
}

async function checkForAppUpdate() {
  if (!(await isVoltixNativeApp())) return;
  const [{ App }, platform] = await Promise.all([import("@capacitor/app"), getNativePlatform()]);
  const info = await App.getInfo().catch(() => ({ version: "1.0" }));
  const response = await fetch(`/api/mobile/version?platform=${encodeURIComponent(platform)}&version=${encodeURIComponent(info.version)}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!data.updateAvailable || !data.updateUrl) return;
  const shouldUpdate = data.forceUpdate || window.confirm("A new Voltix update is available. Install now?");
  if (shouldUpdate) window.location.href = data.updateUrl;
}

function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "voltix.zenithsoftech.com") return;
    const joinMatch = parsed.pathname.match(/^\/join\/([^/?#]+)/);
    if (joinMatch?.[1]) {
      window.location.href = `/auth?mode=register&referralCode=${encodeURIComponent(joinMatch[1])}&referralLocked=1&returnTo=${encodeURIComponent("/dashboard")}`;
      return;
    }
    window.location.href = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return;
  }
}

function installPullToRefresh() {
  let startY = 0;
  let pulling = false;
  const onTouchStart = (event: TouchEvent) => {
    if (!refreshRoutes.some(route => window.location.pathname.startsWith(route)) || window.scrollY > 0) return;
    startY = event.touches[0]?.clientY ?? 0;
    pulling = true;
  };
  const onTouchEnd = (event: TouchEvent) => {
    if (!pulling) return;
    const endY = event.changedTouches[0]?.clientY ?? 0;
    pulling = false;
    if (endY - startY > 85) window.dispatchEvent(new CustomEvent("voltix:native-refresh"));
  };
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  return () => {
    document.removeEventListener("touchstart", onTouchStart);
    document.removeEventListener("touchend", onTouchEnd);
  };
}

function VoltixNativeLoader() {
  return <div className="voltix-native-overlay" aria-live="polite"><div className="voltix-native-loader"><VoltixVLogo /></div></div>;
}

function OfflineScreen({ retry }: { retry: () => void }) {
  return <div className="voltix-native-overlay" role="alertdialog" aria-modal="true" aria-label="No Internet Connection"><div className="voltix-offline-card"><div className="voltix-native-loader small"><VoltixVLogo /></div><h2>No Internet Connection</h2><p>Please check your connection and try again.</p><button onClick={retry}>Retry</button></div></div>;
}

function VoltixVLogo() {
  return <svg viewBox="0 0 120 120" className="voltix-native-v" aria-hidden="true">
    <defs>
      <linearGradient id="voltixNativeV" x1="26" y1="18" x2="91" y2="104" gradientUnits="userSpaceOnUse">
        <stop stopColor="#ecfff7" />
        <stop offset=".36" stopColor="#18ff8a" />
        <stop offset="1" stopColor="#00b86b" />
      </linearGradient>
      <radialGradient id="voltixNativeGlow" cx="50%" cy="52%" r="58%">
        <stop stopColor="#18ff8a" stopOpacity=".76" />
        <stop offset="1" stopColor="#18ff8a" stopOpacity="0" />
      </radialGradient>
    </defs>
    <ellipse cx="60" cy="92" rx="40" ry="16" fill="url(#voltixNativeGlow)" opacity=".72" />
    <path d="M29 20h17l14 39 14-39h19L66 92l-6 12-6-12L29 20Z" fill="url(#voltixNativeV)" />
    <path d="M45 28 60 70l15-42" fill="none" stroke="#f3fff9" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".64" />
    <path d="M29 20h17l14 39 14-39h19L66 92l-6 12-6-12L29 20Z" fill="none" stroke="#9cffd9" strokeOpacity=".46" strokeWidth="2" strokeLinejoin="round" />
  </svg>;
}
