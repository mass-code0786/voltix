"use client";

import { useEffect, useState } from "react";
import { getMobileSessionTokenWithBiometric, getNativePlatform, hapticImpact, isVoltixNativeApp, mobileFetchHeaders, savePushToken } from "@/lib/mobile-native";

const VOLTIX_STATUS_BAR_COLOR = "#050807";
const refreshRoutes = ["/dashboard", "/profile"];

export function CapacitorBridge() {
  const [offline, setOffline] = useState(false);
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

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

      await Promise.allSettled([
        StatusBar.setStyle({ style: Style.Dark }),
        StatusBar.setBackgroundColor({ color: VOLTIX_STATUS_BAR_COLOR }),
        StatusBar.setOverlaysWebView({ overlay: false }),
        SplashScreen.hide(),
        Keyboard.setResizeMode({ mode: KeyboardResize.Body }),
        Keyboard.setStyle({ style: KeyboardStyle.Dark }),
      ]);

      const backListener = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
          return;
        }
        App.exitApp();
      });
      const urlListener = await App.addListener("appUrlOpen", ({ url }) => handleDeepLink(url));
      const networkStatus = await Network.getStatus();
      setOffline(!networkStatus.connected);
      const networkListener = await Network.addListener("networkStatusChange", status => {
        setOffline(!status.connected);
        if (status.connected) window.dispatchEvent(new CustomEvent("voltix:native-reconnect"));
      });
      const clickHandler = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button,a,[role='button']")) hapticImpact("light").catch(() => null);
      };
      const refreshCleanup = installPullToRefresh();
      document.addEventListener("click", clickHandler, { passive: true });

      await Promise.allSettled([restoreMobileSession(), registerPushNotifications(), checkForAppUpdate()]);
      setBooting(false);

      cleanup = () => {
        backListener.remove();
        urlListener.remove();
        networkListener.remove();
        document.removeEventListener("click", clickHandler);
        refreshCleanup();
      };
    }

    configureNativeShell().catch(() => {
      setBooting(false);
      cleanup = undefined;
    });

    return () => cleanup?.();
  }, []);

  if (offline) return <OfflineScreen retry={() => window.dispatchEvent(new CustomEvent("voltix:native-reconnect"))} />;
  if (booting) return <VoltixNativeLoader />;
  return null;
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
  return <div className="voltix-native-overlay" aria-live="polite"><div className="voltix-native-loader"><span>V</span></div></div>;
}

function OfflineScreen({ retry }: { retry: () => void }) {
  return <div className="voltix-native-overlay" role="alertdialog" aria-modal="true" aria-label="No Internet Connection"><div className="voltix-offline-card"><div className="voltix-native-loader small"><span>V</span></div><h2>No Internet Connection</h2><p>Please check your connection and try again.</p><button onClick={retry}>Retry</button></div></div>;
}
