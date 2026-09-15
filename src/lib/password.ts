// Server-only. Shared password hashing for every login table (client_access_users,
// internal_users). New hashes use Argon2id (OWASP-recommended, via the `argon2`
// native binding — memory-hard, tuned against GPU/ASIC cracking far better than
// scrypt's default cost params). Hashes created before this migration are in the
// legacy "salt:hash" scrypt-hex format; verifyPassword still accepts them so
// existing accounts never lose access, and needsRehash() tells the caller to
// transparently re-hash to Argon2id right after a successful legacy verify —
// never on a failed attempt, and never by touching a password the operator
// didn't just prove they know.

import argon2 from "argon2";
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const SCRYPT_KEY_LENGTH = 64;

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

// Argon2's own encoded hash strings always start with "$argon2" (e.g.
// "$argon2id$v=19$m=65536,t=3,p=4$..."); the legacy format never does
// (it's `${16-byte hex salt}:${64-byte hex derived key}`, no "$" at all).
function isLegacyScryptHash(stored: string): boolean {
  return !stored.startsWith("$argon2");
}

async function verifyLegacyScrypt(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derived = (await scryptAsync(password, salt, SCRYPT_KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isLegacyScryptHash(stored)) return verifyLegacyScrypt(password, stored);
  try {
    return await argon2.verify(stored, password);
  } catch {
    // Malformed/foreign hash string — never throw out of an auth check.
    return false;
  }
}

/** True when `stored` is still the legacy scrypt format. Callers re-hash to Argon2id with the just-verified plaintext and persist it immediately after a successful verifyPassword() — never on a failed attempt. */
export function needsRehash(stored: string): boolean {
  return isLegacyScryptHash(stored);
}

/** Random opaque credential — used both for admin-generated passwords and recovery/temporary tokens. Never user-chosen, never logged. */
export function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

// A real Argon2id hash of a random, never-reused value — computed once
// lazily and cached. Login lookups run verifyPassword() against this when
// no account matches the submitted username, so a nonexistent username
// costs the same wall-clock time as a wrong password on a real one, rather
// than returning early and leaking which case occurred via timing.
let dummyHashPromise: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise;
}
