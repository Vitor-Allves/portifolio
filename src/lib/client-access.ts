// Server-only. Manages client logins, stored in Postgres (see src/lib/db.ts).
// A client_access row is the organization (label, ad accounts, permissions);
// each client_access_users row is one named person's login under it, sharing
// the org's account/permission scope but individually revocable. Passwords
// are never stored or returned in plaintext after creation.

import { randomUUID } from "crypto";
import { getDb } from "./db";
import { hashPassword, verifyPassword, generatePassword } from "./password";
import type { ClientAccessSummary, ClientAccessUserSummary } from "./client-access-types";
import { EMPTY_PERMISSIONS, sanitizePermissions, type ClientPermissions } from "./client-permissions";

export type { ClientAccessSummary };

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

export type ClientAccessMatch = {
  id: string;
  label: string;
  accountIds: string[];
  permissions: ClientPermissions;
  userId: string;
  userName: string;
};

export async function listClientAccess(): Promise<ClientAccessSummary[]> {
  const db = await getDb();
  const { rows: clientRows } = await db.query<{
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

  const { rows: userRows } = await db.query<{
    id: string;
    client_access_id: string;
    name: string;
    created_at: string;
  }>(
    `SELECT id, client_access_id, name, created_at
     FROM client_access_users
     WHERE revoked_at IS NULL
     ORDER BY created_at ASC`
  );
  const usersByClient = new Map<string, ClientAccessUserSummary[]>();
  for (const u of userRows) {
    const list = usersByClient.get(u.client_access_id) ?? [];
    list.push({ id: u.id, name: u.name, createdAt: u.created_at });
    usersByClient.set(u.client_access_id, list);
  }

  return clientRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    label: r.label,
    accountIds: r.account_ids,
    permissions: sanitizePermissions(r.permissions),
    createdAt: r.created_at,
    users: usersByClient.get(r.id) ?? [],
  }));
}

/** Creates a new client and its first named login, returning the plaintext password — shown once, never stored. */
export async function createClientAccess(
  label: string,
  accountIds: string[],
  permissions: ClientPermissions = EMPTY_PERMISSIONS,
  firstUserName?: string
): Promise<{ id: string; userId: string; userName: string; password: string }> {
  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error("Label is required");
  if (accountIds.length === 0) throw new Error("At least one account is required");

  const db = await getDb();
  const id = randomUUID();
  const cleanPermissions = sanitizePermissions(permissions);

  await db.query(
    `INSERT INTO client_access (id, slug, label, account_ids, permissions)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, slugify(cleanLabel), cleanLabel, accountIds, JSON.stringify(cleanPermissions)]
  );

  const { id: userId, name: userName, password } = await createClientUser(
    id,
    firstUserName?.trim() || cleanLabel
  );

  return { id, userId, userName, password };
}

export async function revokeClientAccess(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE client_access SET revoked_at = now() WHERE id = $1`, [id]);
}

/** Adds a new named login under an existing client, returning the plaintext password — shown once, never stored. */
export async function createClientUser(
  clientAccessId: string,
  name: string
): Promise<{ id: string; name: string; password: string }> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Name is required");

  const db = await getDb();
  const id = randomUUID();
  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  await db.query(
    `INSERT INTO client_access_users (id, client_access_id, name, password_hash)
     VALUES ($1, $2, $3, $4)`,
    [id, clientAccessId, cleanName, passwordHash]
  );

  return { id, name: cleanName, password };
}

/** Revokes one named login without affecting anyone else under the same client. */
export async function revokeClientUser(clientAccessId: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE client_access_users SET revoked_at = now() WHERE id = $1 AND client_access_id = $2`,
    [userId, clientAccessId]
  );
}

/** Checks a submitted password against every active client login. Small N — a full scan is fine. */
export async function matchClientPassword(password: string): Promise<ClientAccessMatch | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    user_id: string;
    user_name: string;
    password_hash: string;
    client_id: string;
    label: string;
    account_ids: string[];
    permissions: unknown;
  }>(
    `SELECT u.id AS user_id, u.name AS user_name, u.password_hash,
            c.id AS client_id, c.label, c.account_ids, c.permissions
     FROM client_access_users u
     JOIN client_access c ON c.id = u.client_access_id
     WHERE u.revoked_at IS NULL AND c.revoked_at IS NULL`
  );

  for (const row of rows) {
    if (await verifyPassword(password, row.password_hash)) {
      return {
        id: row.client_id,
        label: row.label,
        accountIds: row.account_ids,
        permissions: sanitizePermissions(row.permissions),
        userId: row.user_id,
        userName: row.user_name,
      };
    }
  }
  return null;
}
