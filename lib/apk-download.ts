const DEFAULT_ANDROID_APK_PATH = "/downloads/voltix.apk";
const APK_CACHE_VERSION = "20260711-icon2";

export function voltixApkDownloadHref() {
  const href = process.env.NEXT_PUBLIC_ANDROID_APK_URL || DEFAULT_ANDROID_APK_PATH;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}v=${APK_CACHE_VERSION}`;
}
