import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import {
  ANALISE_SESSION_COOKIE,
  ANALISE_PENDING_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  PENDING_MAX_AGE_SECONDS,
  createSessionToken,
  createPendingToken,
} from "@/lib/analise-session-node";
import { matchInternalUser } from "@/lib/internal-users";
import { matchClientUser } from "@/lib/client-access";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

// Deliberately the same message for "no such user" and "wrong password" —
// per the brief, the login form must never reveal which one was wrong.
const GENERIC_ERROR = "Usuário ou senha inválidos.";

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(ANALISE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  res.cookies.delete(ANALISE_PENDING_COOKIE);
}

function setPendingCookie(res: NextResponse, token: string) {
  res.cookies.set(ANALISE_PENDING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_MAX_AGE_SECONDS,
  });
}

/**
 * Username + password login — no e-mail involved. administrador_geral
 * accounts never get a full session directly from this route: they get a
 * short-lived "pending" cookie and a `stage` telling the frontend whether
 * to collect a TOTP code (`verify`, already enrolled) or walk through 2FA
 * enrollment first (`enroll`, first login) — see
 * /api/analise/login/totp and /api/analise/2fa/enroll/*. Every other role,
 * and every client login, gets a full session immediately.
 */
export async function POST(req: NextRequest) {
  const key = clientKey(req);
  if (isRateLimited(`analise-login:ip:${key}`)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  let username: unknown;
  let password: unknown;
  try {
    const body = (await req.json()) as { username?: unknown; password?: unknown };
    username = body.username;
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }
  const cleanUsername = username.trim();

  // Also throttled per-username, independent of IP, so a distributed
  // attempt against one account is still limited.
  if (isRateLimited(`analise-login:user:${cleanUsername.toLowerCase()}`)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  try {
    const staffMatch = await matchInternalUser(cleanUsername, password);
    if (staffMatch) {
      if (staffMatch.role === "administrador_geral") {
        const stage = staffMatch.totpEnabled ? "verify" : "enroll";
        const pending = createPendingToken(staffMatch.id, stage);
        const res = NextResponse.json({ ok: true, stage });
        setPendingCookie(res, pending);
        return res;
      }
      const token = createSessionToken("staff", staffMatch.id, staffMatch.sessionVersion);
      const res = NextResponse.json({ ok: true, stage: "done" });
      setSessionCookie(res, token);
      return res;
    }

    const clientMatch = await matchClientUser(cleanUsername, password);
    if (clientMatch) {
      const token = createSessionToken("client", clientMatch.id, clientMatch.sessionVersion);
      const res = NextResponse.json({ ok: true, stage: "done" });
      setSessionCookie(res, token);
      return res;
    }
  } catch (err) {
    console.error("[analise/login] credential lookup failed", err);
    return NextResponse.json(
      { error: "Não foi possível entrar. Tente novamente em instantes." },
      { status: 503 }
    );
  }

  await writeAudit({
    actorUserId: null,
    actorLabel: cleanUsername,
    actorKind: "system",
    action: "auth.login_failed",
    targetType: "login",
    targetLabel: cleanUsername,
  });
  return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
}
