// Node.js-runtime counterpart to analise-session.ts. That file targets the
// Edge Runtime (src/proxy.ts) via the global Web Crypto API, which Node.js
// only guarantees unflagged from v19+ — this project's Vercel Node.js
// version isn't guaranteed to track that (it's a separate project setting
// from the `engines.node` in package.json), so anything that always runs
// as a Node.js Route Handler or Server Component (the login route, and the
// dashboard page's defense-in-depth check) uses Node's classic `crypto`
// module instead, which has worked the same way since Node 15.
//
// Both files sign/verify with plain HMAC-SHA256 over the same payload and
// base64url encoding, so a token created by one is valid to the other —
// there is exactly one token format, just two ways of computing it.

import { createHmac, timingSafeEqual } from "crypto";

export const ANALISE_SESSION_COOKIE = "legado_analise_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

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

/** Creates a signed `expiresAt.signature` token. Throws if the secret env var is missing. */
export function createSessionToken(): string {
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

/** Verifies signature + expiry. Never throws — any problem (including a missing secret) is "not valid". */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [expiresAtRaw, signatureB64] = token.split(".");
  if (!expiresAtRaw || !signatureB64) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  try {
    const expected = Buffer.from(sign(expiresAtRaw));
    const actual = Buffer.from(signatureB64);
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
