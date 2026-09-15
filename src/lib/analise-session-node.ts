// Node.js-runtime counterpart to analise-session.ts. That file targets the
// Edge Runtime (src/proxy.ts) via the global Web Crypto API, which Node.js
// only guarantees unflagged from v19+ — this project's Vercel Node.js
// version isn't guaranteed to track that (it's a separate project setting
// from the `engines.node` in package.json), so anything that always runs
// as a Node.js Route Handler or Server Component uses Node's classic
// `crypto` module instead, which has worked the same way since Node 15.
//
// Both files sign/verify with plain HMAC-SHA256 over the same payload and
// base64url encoding, so a token created by one is valid to the other —
// there is exactly one token format, just two ways of computing it.
//
// The session token itself only ever carries a thin identifier (kind,
// userId, sessionVersion) — never role, accountIds, permissions or a
// display name. Every protected Node route re-fetches those fresh from the
// database via auth-context.ts on every single request, which is what
// makes a permission/role/company change (or a revoke) take effect
// immediately, even for a session that was already open when the change
// was made. The Edge middleware only ever sees this same thin payload, and
// only uses it to decide "is there a plausible session at all" — it is a
// fast, unauthoritative first pass, never the source of truth.

import { createHmac, timingSafeEqual } from "crypto";

export const ANALISE_SESSION_COOKIE = "legado_analise_session";
export const ANALISE_PENDING_COOKIE = "legado_analise_pending";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

// Short-lived — covers only the gap between "password verified" and
// "TOTP code (or 2FA enrollment) confirmed" for an administrador_geral
// login. Never grants any data access on its own (see auth-context.ts).
const PENDING_TTL_MS = 5 * 60 * 1000; // 5min
export const PENDING_MAX_AGE_SECONDS = PENDING_TTL_MS / 1000;

export type SessionKind = "staff" | "client";

export type SessionTokenPayload = {
  exp: number;
  kind: SessionKind;
  userId: string;
  sessionVersion: number;
};

export type PendingStage = "enroll" | "verify";

export type PendingTokenPayload = {
  exp: number;
  userId: string;
  stage: PendingStage;
};

function requireSecret(): string {
  const secret = process.env.ANALYTICS_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ANALYTICS_SESSION_SECRET is not configured (must be set to a long random string)"
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", requireSecret()).update(payload).digest("base64url");
}

function encode<T>(payload: T): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

function decode<T extends { exp: number }>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return null;

  try {
    const expected = Buffer.from(sign(payloadB64));
    const actual = Buffer.from(signatureB64);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as T;
    if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Creates a signed, thin session token. Throws if the secret env var is missing. */
export function createSessionToken(kind: SessionKind, userId: string, sessionVersion: number): string {
  return encode<SessionTokenPayload>({ exp: Date.now() + SESSION_TTL_MS, kind, userId, sessionVersion });
}

/** Verifies signature + expiry and returns the thin payload, or null if invalid/expired/missing. Callers needing the actual role/accountIds/permissions must hydrate via auth-context.ts — never trust a cached copy. */
export function verifySessionToken(token: string | undefined | null): SessionTokenPayload | null {
  return decode<SessionTokenPayload>(token);
}

/** Creates the short-lived token that bridges "password verified" and "2FA confirmed" for an administrador_geral login. Never accepted by any data-serving route. */
export function createPendingToken(userId: string, stage: PendingStage): string {
  return encode<PendingTokenPayload>({ exp: Date.now() + PENDING_TTL_MS, userId, stage });
}

export function verifyPendingToken(token: string | undefined | null): PendingTokenPayload | null {
  return decode<PendingTokenPayload>(token);
}
