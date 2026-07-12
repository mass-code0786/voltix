"use client";

import { useEffect, useRef, useState } from "react";
import { biometricForegroundUnlockKey, clearMobileNativeSession, getMobileSessionTokenWithBiometric, getNativePlatform, hapticImpact, isBiometricAvailable, isBiometricLockEnabled, savePushToken } from "@/lib/mobile-native";

const VOLTIX_STATUS_BAR_COLOR = "#050b08";
const refreshRoutes = ["/dashboard", "/profile"];
type CapacitorNetwork = typeof import("@capacitor/network").Network;
type StartupAuthState = "initializing" | "unauthenticated" | "authenticated_locked" | "authenticated_unlocked";
const AUTH_STARTUP_TIMEOUT_MS = 9000;
// Diagnostic build: biometric code remains available for explicit user actions,
// but must never run as part of app startup or resume.
const AUTOMATIC_BIOMETRIC_UNLOCK_ENABLED = false;

export function CapacitorBridge() {
  const [offline, setOffline] = useState(false);
  const [booting, setBooting] = useState(false);
  const [authState, setAuthState] = useState<StartupAuthState>("initializing");
  const [unlockMessage, setUnlockMessage] = useState("");
  const authStateRef = useRef<StartupAuthState>("initializing");
  const promptInProgress = useRef(false);
  const attemptedForCurrentResume = useRef(false);

  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

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

      if (disposed || !Capacitor.isNativePlatform()) return;
      setBooting(true);
      document.documentElement.classList.add("voltix-capacitor");
      document.body.classList.add("voltix-capacitor");

      await Promise.all([
        safeStartupPluginCall(Capacitor, "StatusBar", "set style", () => StatusBar.setStyle({ style: Style.Dark })),
        safeStartupPluginCall(Capacitor, "StatusBar", "set background", () => StatusBar.setBackgroundColor({ color: VOLTIX_STATUS_BAR_COLOR })),
        safeStartupPluginCall(Capacitor, "StatusBar", "set overlay", () => StatusBar.setOverlaysWebView({ overlay: false })),
        safeStartupPluginCall(Capacitor, "Keyboard", "set resize mode", () => Keyboard.setResizeMode({ mode: KeyboardResize.Body })),
        safeStartupPluginCall(Capacitor, "Keyboard", "set style", () => Keyboard.setStyle({ style: KeyboardStyle.Dark })),
      ]);
      if (disposed) return;

      const requestAppUnlock = async () => {
        if (disposed || promptInProgress.current || attemptedForCurrentResume.current) return;
        promptInProgress.current = true;
        attemptedForCurrentResume.current = true;
        setUnlockMessage("");
        try {
          const token = await getMobileSessionTokenWithBiometric("Unlock Voltix");
          if (!token) throw new Error("Biometric session unavailable");
          if (!disposed) {
            window.sessionStorage.setItem(biometricForegroundUnlockKey, "true");
            setAuthState("authenticated_unlocked");
          }
        } catch {
          if (!disposed) {
            setAuthState("authenticated_locked");
            setUnlockMessage("Fingerprint was cancelled or could not be verified.");
          }
        } finally {
          promptInProgress.current = false;
        }
      };
      const initializeAuth = async () => {
        setAuthState("initializing");
        const me = await fetchWithTimeout("/api/me", AUTH_STARTUP_TIMEOUT_MS);
        if (!me?.authenticated || !me.user) {
          setAuthState("unauthenticated");
          if (!window.location.pathname.startsWith("/auth")) {
            window.location.replace("/auth?mode=login&returnTo=%2Fdashboard");
          }
          return;
        }
        if (!AUTOMATIC_BIOMETRIC_UNLOCK_ENABLED) {
          setAuthState("authenticated_unlocked");
          return;
        }
        const biometricEnabled = await isBiometricLockEnabled().catch(() => false);
        const alreadyUnlockedThisForeground = window.sessionStorage.getItem(biometricForegroundUnlockKey) === "true";
        if (!biometricEnabled || alreadyUnlockedThisForeground) {
          setAuthState("authenticated_unlocked");
          return;
        }
        const capable = await isBiometricAvailable().catch(() => false);
        setAuthState("authenticated_locked");
        if (!capable) {
          setUnlockMessage("Biometric unlock is unavailable on this device. Use account login instead.");
          return;
        }
        await requestAppUnlock();
      };
      const runStartupTasks = async () => {
        if (startupTasksDone) return;
        startupTasksDone = true;
        await initializeAuth();
        if (disposed) return;
        await Promise.allSettled([registerPushNotifications(), checkForAppUpdate()]);
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
      const appPluginAvailable = Capacitor.isPluginAvailable("App");
      const networkPluginAvailable = Capacitor.isPluginAvailable("Network");
      const backListener = appPluginAvailable ? await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
            return;
          }
          console.warn("[Voltix diagnostic] Back at root ignored; automatic app exit is disabled.");
        }).catch(error => {
          console.warn("[Voltix diagnostic] App back-button listener skipped.", error);
          return undefined;
        }) : undefined;
      const urlListener = appPluginAvailable ? await App.addListener("appUrlOpen", ({ url }) => handleDeepLink(url)).catch(error => {
        console.warn("[Voltix diagnostic] App URL listener skipped.", error);
        return undefined;
      }) : undefined;
      const stateListener = appPluginAvailable ? await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            attemptedForCurrentResume.current = false;
            return;
          }
          if (!AUTOMATIC_BIOMETRIC_UNLOCK_ENABLED) return;
          if (authStateRef.current !== "authenticated_unlocked") return;
          isBiometricLockEnabled().then(async enabled => {
            if (!enabled || disposed) return;
            setAuthState("authenticated_locked");
            await requestAppUnlock();
          }).catch(() => null);
        }).catch(error => {
          console.warn("[Voltix diagnostic] App state listener skipped.", error);
          return undefined;
        }) : undefined;
      const networkListener = networkPluginAvailable ? await Network.addListener("networkStatusChange", status => {
          if (!status.connected) {
            setOffline(true);
            return;
          }
          reconnectHandler();
        }).catch(error => {
          console.warn("[Voltix diagnostic] Network listener skipped.", error);
          return undefined;
        }) : undefined;
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
        await safeStartupPluginCall(Capacitor, "SplashScreen", "hide", () => SplashScreen.hide());
        if (!disposed) setBooting(false);
      }

      cleanup = () => {
        disposed = true;
        backListener?.remove().catch(() => null);
        urlListener?.remove().catch(() => null);
        stateListener?.remove().catch(() => null);
        networkListener?.remove().catch(() => null);
        document.removeEventListener("click", clickHandler);
        window.removeEventListener("voltix:native-reconnect", reconnectHandler);
        refreshCleanup();
        document.documentElement.classList.remove("voltix-capacitor");
        document.body.classList.remove("voltix-capacitor");
      };
    }

    configureNativeShell().catch(error => {
      console.warn("[Voltix diagnostic] Native shell startup plugin failed; continuing without it.", error);
      setBooting(false);
      cleanup = undefined;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  const retryUnlock = async () => {
    if (promptInProgress.current) return;
    attemptedForCurrentResume.current = false;
    setUnlockMessage("");
    if (!(await isBiometricAvailable().catch(() => false))) {
      setUnlockMessage("Biometric unlock is unavailable on this device. Use account login instead.");
      return;
    }
    promptInProgress.current = true;
    attemptedForCurrentResume.current = true;
    try {
      const token = await getMobileSessionTokenWithBiometric("Unlock Voltix");
      if (!token) throw new Error("Biometric session unavailable");
      window.sessionStorage.setItem(biometricForegroundUnlockKey, "true");
      setAuthState("authenticated_unlocked");
    } catch {
      setUnlockMessage("Fingerprint was cancelled or could not be verified.");
    } finally {
      promptInProgress.current = false;
    }
  };
  const useAccountLogin = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
    await clearMobileNativeSession().catch(() => null);
    setAuthState("unauthenticated");
    window.location.replace("/auth?mode=login&returnTo=%2Fdashboard");
  };

  if (offline) return <OfflineScreen retry={() => window.dispatchEvent(new CustomEvent("voltix:native-reconnect"))} />;
  if (authState === "authenticated_locked") return <UnlockScreen message={unlockMessage} retry={retryUnlock} useLogin={useAccountLogin} />;
  if (booting) return <VoltixNativeLoader />;
  return null;
}

async function isNativeOnline(Network: CapacitorNetwork) {
  const status = await Network.getStatus().catch(() => ({ connected: true }));
  if (!status.connected) return false;
  return canReachApi();
}

type CapacitorRuntime = typeof import("@capacitor/core").Capacitor;

async function safeStartupPluginCall(
  Capacitor: CapacitorRuntime,
  pluginName: string,
  operation: string,
  call: () => Promise<unknown>,
) {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable(pluginName)) return;
  try {
    await call();
  } catch (error) {
    console.warn(`[Voltix diagnostic] Optional ${pluginName} startup operation (${operation}) skipped.`, error);
  }
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

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store", signal: controller.signal });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function registerPushNotifications() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("PushNotifications")) return;
    const me = await fetch("/api/me", { credentials: "include", cache: "no-store" }).then(response => response.ok ? response.json() : null).catch(() => null);
    if (!me?.authenticated) return;
    const [{ PushNotifications }, platform] = await Promise.all([import("@capacitor/push-notifications"), getNativePlatform()]);
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return;
    await PushNotifications.register();
    const registrationListener = await PushNotifications.addListener("registration", async token => {
      await savePushToken(token.value).catch(error => console.warn("[Voltix diagnostic] Push token storage skipped.", error));
      await fetch("/api/mobile/push-token", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.value, platform }),
      }).catch(() => null);
      registrationListener.remove();
    });
  } catch (error) {
    console.warn("[Voltix diagnostic] Optional PushNotifications startup skipped.", error);
  }
}

async function checkForAppUpdate() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("App")) return;
    const [{ App }, platform] = await Promise.all([import("@capacitor/app"), getNativePlatform()]);
    const info = await App.getInfo();
    const response = await fetch(`/api/mobile/version?platform=${encodeURIComponent(platform)}&version=${encodeURIComponent(info.version)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!data.updateAvailable || !data.updateUrl) return;
    const shouldUpdate = data.forceUpdate || window.confirm("A new Voltix update is available. Install now?");
    if (shouldUpdate) window.location.href = data.updateUrl;
  } catch (error) {
    console.warn("[Voltix diagnostic] Optional App update startup check skipped.", error);
  }
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

function UnlockScreen({ message, retry, useLogin }: { message: string; retry: () => void; useLogin: () => void }) {
  return <div className="voltix-native-overlay" role="dialog" aria-modal="true" aria-label="Unlock Voltix"><div className="voltix-offline-card"><div className="voltix-native-loader small"><VoltixVLogo /></div><h2>Unlock Voltix</h2><p>{message || "Confirm your fingerprint to continue."}</p><button onClick={retry}>Try fingerprint again</button><button className="voltix-unlock-login" onClick={useLogin}>Use account login instead</button></div></div>;
}

function VoltixVLogo() {
  return <img src="/apk-icon.png" alt="" className="voltix-native-v" draggable={false} />;
}
