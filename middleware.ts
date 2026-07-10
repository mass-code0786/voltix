import { NextResponse, type NextRequest } from "next/server";

const unsafeMethods = new Set(["POST", "PATCH", "DELETE", "PUT"]);
const csrfExemptPrefixes = [
  "/api/webhooks/nowpayments",
  "/api/scheduler/income",
  "/api/scheduler/ai-auto-trade",
  "/api/scheduler/copy-trade-settlement",
];
const safeAuthEndpoints = new Set(["/api/auth/logout"]);
const productionOrigin = "https://voltix.zenithsoftech.com";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && unsafeMethods.has(request.method) && !isCsrfExempt(request.nextUrl.pathname)) {
    const response = validateOrigin(request);
    if (response) return withSecurityHeaders(response);
  }
  return withSecurityHeaders(NextResponse.next());
}

function validateOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const source = origin || referer;
  if (!source) return NextResponse.json({ error: "Origin header is required" }, { status: 403 });

  const allowed = allowedOrigins(request);
  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  if (!allowed.has(parsed.origin)) {
    return NextResponse.json({ error: "Cross-site request rejected" }, { status: 403 });
  }
  return null;
}

function allowedOrigins(request: NextRequest) {
  const values = new Set<string>();
  values.add(request.nextUrl.origin);
  values.add(productionOrigin);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (appUrl) {
    try {
      values.add(new URL(appUrl).origin);
    } catch {
      null;
    }
  }
  return values;
}

function isCsrfExempt(pathname: string) {
  if (safeAuthEndpoints.has(pathname)) return true;
  return csrfExemptPrefixes.some(prefix => pathname.startsWith(prefix));
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.binance.com wss://stream.binance.com:9443 https://api.nowpayments.io https://*.tradingview.com wss://*.tradingview.com",
    "frame-src https://www.tradingview.com https://s.tradingview.com https://www.tradingview-widget.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "));
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
