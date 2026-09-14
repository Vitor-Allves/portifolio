import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { isRateLimited } from "@/lib/rate-limit";
import {
  ANALISE_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "@/lib/analise-session-node";
import { matchClientPassword } from "@/lib/client-access";
import { matchInternalUser } from "@/lib/internal-users";
import type { SessionScope } from "@/lib/session-scope";

export const runtime = "nodejs";

const GENERIC_ERROR = "Não foi possível entrar. Tente novamente em instantes.";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — pad instead of leaking
  // "wrong length" via an early return.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function resolveScope(email: string | null, password: string): Promise<SessionScope | null> {
  // An email means "I'm on the Legado team" — look up a named internal
  // login and stop there; it never falls through to the client/legacy
  // checks below, so a mistyped team email can't accidentally match a
  // client's password.
  if (email) {
    try {
      const match = await matchInternalUser(email, password);
      if (match) {
        return { kind: "admin", role: match.role, userId: match.id, userName: match.name };
      }
    } catch (err) {
      console.error("[analise/login] internal user lookup failed", err);
    }
    return null;
  }

  const adminPassword = process.env.ANALYTICS_DASHBOARD_PASSWORD;
  if (adminPassword && safeEqual(password, adminPassword)) {
    return { kind: "admin", role: "admin" };
  }

  // Client credentials live in Postgres (see docs/client-access-setup.md).
  // Not configuring that database yet is a valid state — it just means no
  // client logins exist, not a login-system-wide failure.
  try {
    const match = await matchClientPassword(password);
    if (match) {
      return {
        kind: "client",
        accountIds: match.accountIds,
        label: match.label,
        permissions: match.permissions,
        userId: match.userId,
        userName: match.userName,
      };
    }
  } catch (err) {
    console.error("[analise/login] client credential lookup failed", err);
  }

  return null;
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  if (isRateLimited(`analise-login:${key}`)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  let password: unknown;
  let email: unknown;
  try {
    const body = (await req.json()) as { password?: unknown; email?: unknown };
    password = body.password;
    email = body.email;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }
  const cleanEmail = typeof email === "string" && email.trim().length > 0 ? email.trim() : null;

  const scope = await resolveScope(cleanEmail, password);
  if (!scope) {
    return NextResponse.json(
      { error: cleanEmail ? "E-mail ou senha incorretos." : "Senha incorreta." },
      { status: 401 }
    );
  }

  let token: string;
  try {
    token = createSessionToken(scope);
  } catch (err) {
    console.error("[analise/login] failed to create session token", err);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ANALISE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
