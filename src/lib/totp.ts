// Server-only. TOTP (RFC 6238) two-factor auth for administrador geral logins
// — no e-mail dependency, compatible with any standard authenticator app
// (Google Authenticator, Authy, 1Password, etc). Secrets are encrypted at
// rest via secret-crypto.ts; recovery codes are stored only as SHA-256
// hashes (they're high-entropy random tokens already, not user-chosen
// secrets, so a fast hash — not a slow KDF — is the right tool here, same
// reasoning as hashing a session token).

import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { randomBytes, createHash } from "crypto";
import { encryptSecret, decryptSecret } from "./secret-crypto";

const ISSUER = "Legado Intelligence";
const RECOVERY_CODE_COUNT = 10;

export type TotpEnrollment = {
  /** Persist this (not-yet-enabled) — only flip totp_enabled=true after confirmEnrollment succeeds. */
  secretEnc: string;
  otpauthUri: string;
  qrDataUrl: string;
  /** Shown to the operator exactly once — never persisted in plaintext. */
  recoveryCodes: string[];
  /** Persist these alongside secretEnc. */
  recoveryCodeHashes: string[];
};

function buildTotp(secret: Secret, label: string): TOTP {
  return new TOTP({ issuer: ISSUER, label, algorithm: "SHA1", digits: 6, period: 30, secret });
}

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex"); // 10 lowercase hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export async function startTotpEnrollment(username: string): Promise<TotpEnrollment> {
  const secret = new Secret({ size: 20 });
  const totp = buildTotp(secret, username);
  const otpauthUri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 240 });
  const { codes, hashes } = generateRecoveryCodes();
  return {
    secretEnc: encryptSecret(secret.base32),
    otpauthUri,
    qrDataUrl,
    recoveryCodes: codes,
    recoveryCodeHashes: hashes,
  };
}

/** Window of 1 tolerates ±30s clock drift, matching the standard authenticator-app UX. */
export function verifyTotpCode(secretEnc: string, token: string): boolean {
  const cleaned = token.trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  let base32: string;
  try {
    base32 = decryptSecret(secretEnc);
  } catch {
    return false;
  }
  const secret = Secret.fromBase32(base32);
  const totp = buildTotp(secret, "verify");
  return totp.validate({ token: cleaned, window: 1 }) !== null;
}

/** Returns the index of the matched hash (for the caller to remove — single use) or -1. */
export function verifyRecoveryCode(candidate: string, hashes: string[]): number {
  const h = hashRecoveryCode(candidate);
  return hashes.indexOf(h);
}
