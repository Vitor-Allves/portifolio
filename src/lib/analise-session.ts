// Signed, stateless session token for the /analise dashboard's login gate.
// Built on Web Crypto (not Node's `crypto` module) so the exact same code
// runs in both the middleware (edge runtime) and the login route (nodejs
// runtime) without a runtime-specific branch. The token carries the
// session's scope (admin = everything, or a client restricted to specific
// ad accounts) so the middleware can enforce admin-only routes without a
// database round trip on every request.

import type { SessionScope } from "./session-scope";

export const ANALISE_SESSION_COOKIE = "legado_analise_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

type TokenPayload = { exp: number; scope: SessionScope };

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

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Creates a signed `payload.signature` token. Throws if the secret env var is missing. */
export async function createSessionToken(scope: SessionScope): Promise<string> {
  const secret = requireSecret();
  const payload: TokenPayload = { exp: Date.now() + SESSION_TTL_MS, scope };
  const payloadB64 = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));

  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

/** Verifies signature + expiry and returns the session's scope, or null if invalid/expired/missing. */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionScope | null> {
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
    ) as TokenPayload;
    if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) return null;
    return payload.scope;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
