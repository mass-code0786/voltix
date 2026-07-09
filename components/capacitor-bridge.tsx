"use client";

import { useEffect } from "react";

const VOLTIX_STATUS_BAR_COLOR = "#050807";

export function CapacitorBridge() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function configureNativeShell() {
      const [{ Capacitor }, { App }, { StatusBar, Style }, { SplashScreen }, { Keyboard, KeyboardResize, KeyboardStyle }] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/app"),
        import("@capacitor/status-bar"),
        import("@capacitor/splash-screen"),
        import("@capacitor/keyboard"),
      ]);

      if (!Capacitor.isNativePlatform()) return;

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

      cleanup = () => {
        backListener.remove();
      };
    }

    configureNativeShell().catch(() => {
      cleanup = undefined;
    });

    return () => cleanup?.();
  }, []);

  return null;
}
