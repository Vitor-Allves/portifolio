// Server-only. Named logins for the internal Legado team, stored in
// Postgres (see src/lib/db.ts). Each has a role controlling whether it can
// reach the admin panel ("admin") or only view dashboards ("analyst").
// Passwords are never stored or returned in plaintext after creation.

import { randomUUID } from "crypto";
import { getDb } from "./db";
import { hashPassword, verifyPassword, generatePassword } from "./password";
import type { InternalRole } from "./session-scope";
import type { InternalUserSummary } from "./internal-users-types";

export type { InternalUserSummary };

export type InternalUserMatch = {
  id: string;
  name: string;
  role: InternalRole;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505"
  );
}

export async function listInternalUsers(): Promise<InternalUserSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    name: string;
    email: string;
    role: InternalRole;
    created_at: string;
  }>(`SELECT id, name, email, role, created_at FROM internal_users WHERE revoked_at IS NULL ORDER BY created_at ASC`);
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at }));
}

/** Creates a new team login, returning the plaintext password — shown once, never stored. */
export async function createInternalUser(
  name: string,
  email: string,
  role: InternalRole
): Promise<{ id: string; password: string }> {
  const cleanName = name.trim();
  const cleanEmail = normalizeEmail(email);
  if (!cleanName) throw new Error("Name is required");
  if (!cleanEmail || !cleanEmail.includes("@")) throw new Error("Valid email is required");

  const db = await getDb();
  const id = randomUUID();
  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  try {
    await db.query(
      `INSERT INTO internal_users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
      [id, cleanName, cleanEmail, passwordHash, role]
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("Já existe um usuário com esse e-mail.");
    throw err;
  }

  return { id, password };
}

export async function revokeInternalUser(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE internal_users SET revoked_at = now() WHERE id = $1`, [id]);
}

/** Checks a submitted email+password against active team logins. */
export async function matchInternalUser(email: string, password: string): Promise<InternalUserMatch | null> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string; password_hash: string; role: InternalRole }>(
    `SELECT id, name, password_hash, role FROM internal_users WHERE email = $1 AND revoked_at IS NULL`,
    [cleanEmail]
  );
  const row = rows[0];
  if (!row) return null;
  if (!(await verifyPassword(password, row.password_hash))) return null;
  return { id: row.id, name: row.name, role: row.role };
}
