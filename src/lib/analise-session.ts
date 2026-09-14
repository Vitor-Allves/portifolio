// Signed, stateless session token for the /analise dashboard's shared-password
// gate. Built on Web Crypto (not Node's `crypto` module) so the exact same
// code runs in both the middleware (edge runtime) and the login route
// (nodejs runtime) without a runtime-specific branch.

export const ANALISE_SESSION_COOKIE = "legado_analise_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

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

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Creates a signed `expiresAt.signature` token. Throws if the secret env var is missing. */
export async function createSessionToken(): Promise<string> {
  const secret = requireSecret();
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(expiresAt)
  );
  return `${expiresAt}.${toBase64Url(signature)}`;
}

/** Verifies signature + expiry. Never throws — any problem (including a missing secret) is "not valid". */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expiresAtRaw, signatureB64] = token.split(".");
  if (!expiresAtRaw || !signatureB64) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  try {
    const secret = requireSecret();
    const key = await getHmacKey(secret);
    // Uint8Array.from()'s TS type widens to Uint8Array<ArrayBufferLike>,
    // which SubtleCrypto's BufferSource type doesn't accept — the buffer
    // is always a plain ArrayBuffer at runtime (TextEncoder/atob never
    // produce a SharedArrayBuffer), so this cast is safe.
    const signature = fromBase64Url(signatureB64) as unknown as BufferSource;
    return await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(expiresAtRaw)
    );
  } catch {
    return false;
  }
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
