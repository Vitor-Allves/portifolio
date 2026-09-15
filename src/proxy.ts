import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session";

// Public routes: the login page itself, and every step of the
// username/password + 2FA login flow (all Node-runtime routes that must
// stay reachable without an existing session).
const PUBLIC_PATHS = new Set([
  "/analise/login",
  "/api/analise/login",
  "/api/analise/login/totp",
  "/api/analise/2fa/enroll/start",
  "/api/analise/2fa/enroll/confirm",
  "/api/analise/bootstrap-admin",
]);

/**
 * Fast, unauthoritative first pass only: is there a syntactically valid,
 * unexpired session cookie at all. It deliberately does NOT decide role,
 * company scope, permissions, revocation or forced-password-change state —
 * the Edge runtime can't reach Postgres, and every one of those can change
 * between token issuance and this request. Every Node-runtime page/route
 * re-verifies all of that itself, fresh, on every request via
 * src/lib/auth-context.ts — that is the actual authorization boundary.
 */
export async function proxy(req: NextRequest) {
  // Normalize away trailing slashes (this project runs with trailingSlash: true)
  // so the public-path exemptions above match regardless of how it was requested.
  const pathname = req.nextUrl.pathname.replace(/\/$/, "") || "/";

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ANALISE_SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token);

  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const loginUrl = new URL("/analise/login/", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/analise/:path*", "/api/analise/:path*", "/api/meta-ads/:path*"],
};
