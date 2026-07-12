"use client";

const biometricServer = "voltix-mobile-session";
const fcmTokenKey = "voltix:fcm-token";
const biometricLockPreferenceKey = "voltix:biometric-lock-enabled";
export const biometricForegroundUnlockKey = "voltix:biometric-foreground-unlocked";

export async function isVoltixNativeApp() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function getNativePlatform() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
}

export async function mobileFetchHeaders(): Promise<Record<string, string>> {
  return (await isVoltixNativeApp()) ? { "x-voltix-capacitor": "1" } : {};
}

export async function offerBiometricEnrollment(sessionToken?: string) {
  if (!sessionToken || !(await isVoltixNativeApp())) return;
  const available = await isBiometricAvailable();
  if (!available) return;
  if (!window.confirm("Enable biometric login?")) return;
  await storeMobileSessionToken(sessionToken);
  await setBiometricLockEnabled(true);
  window.sessionStorage.setItem(biometricForegroundUnlockKey, "true");
}

export async function isBiometricLockEnabled() {
  if (!(await isVoltixNativeApp())) return false;
  const { Preferences } = await import("@capacitor/preferences");
  const result = await Preferences.get({ key: biometricLockPreferenceKey });
  return result.value === "true";
}

export async function setBiometricLockEnabled(enabled: boolean) {
  if (!(await isNativePluginAvailable("Preferences"))) return;
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key: biometricLockPreferenceKey, value: String(enabled) });
}

export async function storeMobileSessionToken(sessionToken: string) {
  const { NativeBiometric } = await import("capacitor-native-biometric");
  await NativeBiometric.setCredentials({
    username: "voltix",
    password: sessionToken,
    server: biometricServer,
  });
}

export async function getMobileSessionTokenWithBiometric(reason = "Unlock Voltix") {
  if (!(await isVoltixNativeApp()) || !(await isBiometricAvailable())) return null;
  const { NativeBiometric } = await import("capacitor-native-biometric");
  await NativeBiometric.verifyIdentity({
    title: "Voltix",
    subtitle: "Biometric Login",
    description: reason,
    reason,
    negativeButtonText: "Use password",
    useFallback: true,
    maxAttempts: 3,
  });
  const credentials = await NativeBiometric.getCredentials({ server: biometricServer });
  return credentials.password || null;
}

export async function clearMobileNativeSession() {
  try {
    window.sessionStorage.removeItem(biometricForegroundUnlockKey);
  } catch {
    // Session storage is optional in restricted WebViews and browser modes.
  }
  await Promise.allSettled([
    deleteBiometricSession(),
    deletePushToken(),
    setBiometricLockEnabled(false),
  ]);
}

export async function deleteBiometricSession() {
  if (!(await isNativePluginAvailable("NativeBiometric"))) return;
  try {
    const { NativeBiometric } = await import("capacitor-native-biometric");
    await NativeBiometric.deleteCredentials({ server: biometricServer });
  } catch {
    return;
  }
}

export async function isBiometricAvailable() {
  try {
    if (!(await isVoltixNativeApp())) return false;
    const { NativeBiometric } = await import("capacitor-native-biometric");
    const result = await NativeBiometric.isAvailable({ useFallback: true });
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function requestMobileTransactionToken(action: "p2p" | "withdrawal") {
  const sessionToken = await getMobileSessionTokenWithBiometric(action === "p2p" ? "Confirm P2P transfer" : "Confirm withdrawal request");
  if (!sessionToken) return null;
  const response = await fetch("/api/mobile/transaction-token", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(await mobileFetchHeaders()) },
    body: JSON.stringify({ action }),
  });
  const data = await response.json().catch(() => ({}));
  return response.ok && typeof data.token === "string" ? data.token : null;
}

export async function nativeShareReferral(link: string) {
  if (!(await isVoltixNativeApp())) return false;
  const { Share } = await import("@capacitor/share");
  await Share.share({
    title: "Voltix",
    text: `Join Voltix with my referral link: ${link}`,
    url: link,
    dialogTitle: "Share Voltix referral",
  });
  return true;
}

export async function hapticImpact(style: "light" | "medium" | "heavy" = "light") {
  if (!(await isVoltixNativeApp())) return;
  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  await Haptics.impact({ style: style === "heavy" ? ImpactStyle.Heavy : style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
}

export async function hapticNotification(type: "success" | "warning" | "error") {
  if (!(await isVoltixNativeApp())) return;
  const { Haptics, NotificationType } = await import("@capacitor/haptics");
  await Haptics.notification({ type: type === "success" ? NotificationType.Success : type === "warning" ? NotificationType.Warning : NotificationType.Error });
}

export async function savePushToken(token: string) {
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key: fcmTokenKey, value: token });
}

export async function getSavedPushToken() {
  const { Preferences } = await import("@capacitor/preferences");
  const result = await Preferences.get({ key: fcmTokenKey });
  return result.value;
}

async function deletePushToken() {
  if (!(await isNativePluginAvailable("Preferences"))) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: fcmTokenKey });
  } catch {
    return;
  }
}

async function isNativePluginAvailable(pluginName: string) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(pluginName);
  } catch {
    return false;
  }
}
