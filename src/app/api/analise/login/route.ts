import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { isRateLimited } from "@/lib/rate-limit";
import {
  ANALISE_SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from "@/lib/analise-session";

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

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  if (isRateLimited(`analise-login:${key}`)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um minuto e tente novamente." },
      { status: 429 }
    );
  }

  const expectedPassword = process.env.ANALYTICS_DASHBOARD_PASSWORD;
  if (!expectedPassword) {
    console.error("[analise/login] ANALYTICS_DASHBOARD_PASSWORD is not configured");
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  let password: unknown;
  try {
    const body = (await req.json()) as { password?: unknown };
    password = body.password;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (typeof password !== "string" || !safeEqual(password, expectedPassword)) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionToken();
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
