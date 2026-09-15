// Edge-runtime counterpart to analise-session-node.ts, used only by
// src/proxy.ts for a fast, unauthoritative first-pass check ("is there a
// plausible session cookie at all"). Built on Web Crypto (not Node's
// `crypto` module) so it can run in the Edge runtime, which can't reach
// Postgres — the actual authoritative check (role, accountIds,
// permissions, revoked/session_version, must-change-password) always
// happens Node-side, per request, via auth-context.ts. See
// analise-session-node.ts for the full rationale; both files sign/verify
// the exact same thin token format.

import type { SessionTokenPayload } from "./analise-session-node";

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

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Verifies signature + expiry and returns the thin payload, or null if invalid/expired/missing. Never authoritative on its own — see module doc comment. */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionTokenPayload | null> {
  if (!token) return null;
  const [payloadB64, signatureB64] = token.split(".");
  if (!payloadB64 || !signatureB64) return null;

  try {
    const secret = requireSecret();
    const key = await getHmacKey(secret);
    // Uint8Array.from()'s TS type widens to Uint8Array<ArrayBufferLike>,
    // which SubtleCrypto's BufferSource type doesn't accept — the buffer
    // is always a plain ArrayBuffer at runtime (TextEncoder/atob never
    // produce a SharedArrayBuffer), so this cast is safe.
    const signature = base64UrlToBytes(signatureB64) as unknown as BufferSource;
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadB64))
    ) as SessionTokenPayload;
    if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
