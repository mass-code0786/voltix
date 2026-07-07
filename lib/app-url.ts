const PRODUCTION_APP_URL = "https://voltix.zenithsoftech.com";

function cleanOrigin(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function getServerAppOrigin() {
  return cleanOrigin(process.env.NEXT_PUBLIC_APP_URL) || cleanOrigin(process.env.APP_URL) || PRODUCTION_APP_URL;
}

export function getClientAppOrigin() {
  return cleanOrigin(process.env.NEXT_PUBLIC_APP_URL) || (typeof window !== "undefined" ? window.location.origin : PRODUCTION_APP_URL);
}

export function buildReferralLink(uid: string | null | undefined, origin = getServerAppOrigin()) {
  if (!uid) return null;
  return `${origin.replace(/\/+$/, "")}/join/${encodeURIComponent(uid)}`;
}
