import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session";

export async function proxy(req: NextRequest) {
  // Normalize away trailing slashes (this project runs with trailingSlash: true)
  // so the login-page exemption below matches regardless of how it was requested.
  const pathname = req.nextUrl.pathname.replace(/\/$/, "") || "/";

  // The login page and its API route must stay reachable without a session.
  if (pathname === "/analise/login" || pathname === "/api/analise/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(ANALISE_SESSION_COOKIE)?.value;
  const valid = await verifySessionToken(token);

  if (valid) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const loginUrl = new URL("/analise/login/", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/analise/:path*", "/api/analise/:path*", "/api/meta-ads/:path*"],
};
