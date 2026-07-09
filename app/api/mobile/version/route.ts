import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = (url.searchParams.get("platform") || "android").toLowerCase();
  const currentVersion = url.searchParams.get("version") || "";
  const latestVersion = platform === "ios" ? process.env.MOBILE_IOS_LATEST_VERSION : process.env.MOBILE_ANDROID_LATEST_VERSION;
  const updateUrl = platform === "ios" ? process.env.MOBILE_IOS_UPDATE_URL : process.env.MOBILE_ANDROID_UPDATE_URL;
  const forceUpdate = (platform === "ios" ? process.env.MOBILE_IOS_FORCE_UPDATE : process.env.MOBILE_ANDROID_FORCE_UPDATE) === "true";
  const updateAvailable = Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0);

  return NextResponse.json({
    platform,
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    updateAvailable,
    forceUpdate,
    updateUrl: updateUrl || null,
  });
}

function compareVersions(a: string, b: string) {
  const left = a.split(".").map(value => Number.parseInt(value, 10) || 0);
  const right = b.split(".").map(value => Number.parseInt(value, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
