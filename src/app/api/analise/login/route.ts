import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { isRateLimited } from "@/lib/rate-limit";
import {
  ANALISE_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "@/lib/analise-session-node";
import { matchClientPassword } from "@/lib/client-access";
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

async function resolveScope(password: string): Promise<SessionScope | null> {
  const adminPassword = process.env.ANALYTICS_DASHBOARD_PASSWORD;
  if (adminPassword && safeEqual(password, adminPassword)) {
    return { kind: "admin" };
  }

  // Client credentials live in Postgres (see docs/client-access-setup.md).
  // Not configuring that database yet is a valid state — it just means no
  // client logins exist, not a login-system-wide failure.
  try {
    const match = await matchClientPassword(password);
    if (match) {
      return { kind: "client", accountIds: match.accountIds, label: match.label };
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
  try {
    const body = (await req.json()) as { password?: unknown };
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (typeof password !== "string" || password.length === 0) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const scope = await resolveScope(password);
  if (!scope) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
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
