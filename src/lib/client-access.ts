// Server-only. Manages per-client login credentials, each scoped to a
// subset of Meta ad accounts, stored in Postgres (see src/lib/db.ts).
// Passwords are never stored or returned in plaintext after creation.

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { getDb } from "./db";
import type { ClientAccessSummary } from "./client-access-types";
import { EMPTY_PERMISSIONS, sanitizePermissions, type ClientPermissions } from "./client-permissions";

export type { ClientAccessSummary };

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function stripDiacritics(value: string): string {
  // Decompose (á -> a + combining acute accent) then drop every combining
  // mark (Unicode block U+0300-U+036F), leaving plain ASCII letters.
  return value
    .normalize("NFD")
    .split("")
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
}

function slugify(label: string): string {
  return (
    stripDiacritics(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cliente"
  );
}

function generatePassword(): string {
  return randomBytes(15).toString("base64url");
}

export type ClientAccessMatch = {
  id: string;
  label: string;
  accountIds: string[];
  permissions: ClientPermissions;
};

export async function listClientAccess(): Promise<ClientAccessSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    slug: string;
    label: string;
    account_ids: string[];
    permissions: unknown;
    created_at: string;
  }>(
    `SELECT id, slug, label, account_ids, permissions, created_at
     FROM client_access
     WHERE revoked_at IS NULL
     ORDER BY created_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    label: r.label,
    accountIds: r.account_ids,
    permissions: sanitizePermissions(r.permissions),
    createdAt: r.created_at,
  }));
}

/** Creates a new client credential and returns the plaintext password — shown once, never stored. */
export async function createClientAccess(
  label: string,
  accountIds: string[],
  permissions: ClientPermissions = EMPTY_PERMISSIONS
): Promise<{ id: string; password: string }> {
  if (!label.trim()) throw new Error("Label is required");
  if (accountIds.length === 0) throw new Error("At least one account is required");

  const db = await getDb();
  const id = randomUUID();
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const cleanPermissions = sanitizePermissions(permissions);

  await db.query(
    `INSERT INTO client_access (id, slug, label, account_ids, password_hash, permissions)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, slugify(label), label.trim(), accountIds, passwordHash, JSON.stringify(cleanPermissions)]
  );

  return { id, password };
}

export async function revokeClientAccess(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE client_access SET revoked_at = now() WHERE id = $1`, [id]);
}

/** Checks a submitted password against every active client credential. Small N — a full scan is fine. */
export async function matchClientPassword(
  password: string
): Promise<ClientAccessMatch | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    label: string;
    account_ids: string[];
    password_hash: string;
    permissions: unknown;
  }>(
    `SELECT id, label, account_ids, password_hash, permissions
     FROM client_access
     WHERE revoked_at IS NULL`
  );

  for (const row of rows) {
    if (await verifyPassword(password, row.password_hash)) {
      return {
        id: row.id,
        label: row.label,
        accountIds: row.account_ids,
        permissions: sanitizePermissions(row.permissions),
      };
    }
  }
  return null;
}
