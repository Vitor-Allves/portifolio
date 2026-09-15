// Server-only. Encrypts TOTP secrets at rest (AES-256-GCM) so a database leak
// alone never exposes usable 2FA seeds. The AES key is derived from the
// already-required ANALYTICS_SESSION_SECRET via scrypt, rather than adding a
// second required env var — one secret to provision, not two, and it's
// already mandated to be a long random string.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const KDF_CONTEXT = "legado-totp-secret-v1";

function deriveKey(): Buffer {
  const secret = process.env.ANALYTICS_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("ANALYTICS_SESSION_SECRET is not configured (must be a long random string)");
  }
  return scryptSync(secret, KDF_CONTEXT, 32);
}

/** Returns "ivBase64.tagBase64.ciphertextBase64". */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  const key = deriveKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
