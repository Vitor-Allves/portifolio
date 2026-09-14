import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session";
import { isFullAdmin } from "@/lib/session-scope";

function isAdminOnlyPath(pathname: string): boolean {
  return pathname === "/analise/admin" || pathname.startsWith("/api/analise/admin");
}

export async function proxy(req: NextRequest) {
  // Normalize away trailing slashes (this project runs with trailingSlash: true)
  // so the login-page exemption below matches regardless of how it was requested.
  const pathname = req.nextUrl.pathname.replace(/\/$/, "") || "/";

  // The login page and its API route must stay reachable without a session.
  if (pathname === "/analise/login" || pathname === "/api/analise/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(ANALISE_SESSION_COOKIE)?.value;
  const scope = await verifySessionToken(token);

  if (!scope) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const loginUrl = new URL("/analise/login/", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!isFullAdmin(scope) && isAdminOnlyPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/analise/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/analise/:path*", "/api/analise/:path*", "/api/meta-ads/:path*"],
};
