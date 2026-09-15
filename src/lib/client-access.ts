// Server-only. Manages client (company) access, stored in Postgres (see
// src/lib/db.ts). A client_access row is the company — label, ad accounts,
// default permissions; each client_access_users row is one named person's
// login under it (username + password), sharing the company's account
// scope and, unless overridden per-person, its permissions too. The two
// concepts are deliberately kept as separate tables/APIs so "the company"
// and "the people who access it" are never conflated in the admin UI.
// Passwords are never stored or returned in plaintext after creation/reset.

import { randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import { hashPassword, verifyPassword, needsRehash, dummyPasswordHash } from "./password";
import { normalizeUsername } from "./username";
import { claimUsernameTx, renameUsernameTx } from "./username-registry";
import type { ClientAccessSummary, ClientAccessUserSummary } from "./client-access-types";
import { EMPTY_PERMISSIONS, sanitizePermissions, type ClientPermissions } from "./client-permissions";

export type { ClientAccessSummary };

function stripDiacritics(value: string): string {
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

export type ClientUserMatch = {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  sessionVersion: number;
  mustChangePassword: boolean;
  clientAccessId: string;
  label: string;
  accountIds: string[];
  permissions: ClientPermissions;
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
    username: string;
    permissions_override: unknown;
    must_change_password: boolean;
    created_at: string;
  }>(
    `SELECT id, client_access_id, name, username, permissions_override, must_change_password, created_at
     FROM client_access_users
     WHERE revoked_at IS NULL
     ORDER BY created_at ASC`
  );

  const companyPermissions = new Map(clientRows.map((r) => [r.id, sanitizePermissions(r.permissions)]));
  const usersByClient = new Map<string, ClientAccessUserSummary[]>();
  for (const u of userRows) {
    const list = usersByClient.get(u.client_access_id) ?? [];
    const hasOverride = u.permissions_override !== null && u.permissions_override !== undefined;
    list.push({
      id: u.id,
      name: u.name,
      username: u.username,
      hasPermissionsOverride: hasOverride,
      permissions: hasOverride ? sanitizePermissions(u.permissions_override) : (companyPermissions.get(u.client_access_id) ?? EMPTY_PERMISSIONS),
      mustChangePassword: u.must_change_password,
      createdAt: u.created_at,
    });
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

/** Creates a new company (no login of its own — see createClientUser for the people under it). */
export async function createClientAccess(
  label: string,
  accountIds: string[],
  permissions: ClientPermissions = EMPTY_PERMISSIONS
): Promise<{ id: string }> {
  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error("Informe o nome da empresa.");
  if (accountIds.length === 0) throw new Error("Selecione ao menos uma conta de anúncios.");

  const db = await getDb();
  const id = randomUUID();
  const cleanPermissions = sanitizePermissions(permissions);

  await db.query(
    `INSERT INTO client_access (id, slug, label, account_ids, permissions)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, slugify(cleanLabel), cleanLabel, accountIds, JSON.stringify(cleanPermissions)]
  );

  return { id };
}

export type UpdateClientAccessInput = {
  label?: string;
  accountIds?: string[];
  permissions?: ClientPermissions;
};

export async function updateClientAccess(id: string, input: UpdateClientAccessInput): Promise<void> {
  const db = await getDb();
  if (input.label !== undefined) {
    const cleanLabel = input.label.trim();
    if (!cleanLabel) throw new Error("Informe o nome da empresa.");
    await db.query(`UPDATE client_access SET label = $1, slug = $2 WHERE id = $3`, [cleanLabel, slugify(cleanLabel), id]);
  }
  if (input.accountIds !== undefined) {
    if (input.accountIds.length === 0) throw new Error("Selecione ao menos uma conta de anúncios.");
    await db.query(`UPDATE client_access SET account_ids = $1 WHERE id = $2`, [input.accountIds, id]);
  }
  if (input.permissions !== undefined) {
    await db.query(`UPDATE client_access SET permissions = $1 WHERE id = $2`, [
      JSON.stringify(sanitizePermissions(input.permissions)),
      id,
    ]);
  }
}

/** Revokes the company — every person under it immediately loses access (auth-context.ts rejects on client_access.revoked_at), without needing to touch each person's row. History is preserved. */
export async function revokeClientAccess(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE client_access SET revoked_at = now() WHERE id = $1`, [id]);
}

export type CreateClientUserInput = {
  name: string;
  username: string;
  password: string;
  permissionsOverride?: ClientPermissions | null;
};

/** Adds a new named login under an existing company, with an admin-chosen initial password. must_change_password is always true. */
export async function createClientUser(
  clientAccessId: string,
  input: CreateClientUserInput
): Promise<{ id: string }> {
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error("Informe o nome da pessoa.");

  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  const override = input.permissionsOverride ? sanitizePermissions(input.permissionsOverride) : null;

  await withTransaction(async (client) => {
    const username = await claimUsernameTx(client, input.username, "client_access_users", id);
    await client.query(
      `INSERT INTO client_access_users (id, client_access_id, name, username, password_hash, permissions_override, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,true)`,
      [id, clientAccessId, cleanName, username, passwordHash, override ? JSON.stringify(override) : null]
    );
  });

  return { id };
}

export type UpdateClientUserInput = {
  name?: string;
  username?: string;
  /** Pass null to clear the override and inherit the company's permissions again; omit to leave unchanged. */
  permissionsOverride?: ClientPermissions | null;
};

export async function updateClientUser(clientAccessId: string, userId: string, input: UpdateClientUserInput): Promise<void> {
  const db = await getDb();
  const { rows } = await db.query<{ username: string }>(
    `SELECT username FROM client_access_users WHERE id = $1 AND client_access_id = $2`,
    [userId, clientAccessId]
  );
  if (!rows[0]) throw new Error("Usuário não encontrado.");

  await withTransaction(async (client) => {
    if (input.username && normalizeUsername(input.username) !== normalizeUsername(rows[0].username)) {
      await renameUsernameTx(client, rows[0].username, input.username, "client_access_users", userId);
      await client.query(`UPDATE client_access_users SET username = $1 WHERE id = $2`, [normalizeUsername(input.username), userId]);
    }
    if (input.name !== undefined) {
      await client.query(`UPDATE client_access_users SET name = $1 WHERE id = $2`, [input.name.trim(), userId]);
    }
    if (input.permissionsOverride !== undefined) {
      await client.query(`UPDATE client_access_users SET permissions_override = $1 WHERE id = $2`, [
        input.permissionsOverride ? JSON.stringify(sanitizePermissions(input.permissionsOverride)) : null,
        userId,
      ]);
    }
  });
}

/** Revokes one named login under a company without affecting anyone else under it. */
export async function revokeClientUser(clientAccessId: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE client_access_users SET revoked_at = now(), session_version = session_version + 1 WHERE id = $1 AND client_access_id = $2`,
    [userId, clientAccessId]
  );
}

/** Administrative reset: sets a new password, invalidates every existing session for the account, and forces a change on next login. */
export async function resetClientUserPassword(clientAccessId: string, userId: string, newPassword: string): Promise<void> {
  const db = await getDb();
  const passwordHash = await hashPassword(newPassword);
  await db.query(
    `UPDATE client_access_users SET password_hash = $1, must_change_password = true, session_version = session_version + 1
     WHERE id = $2 AND client_access_id = $3`,
    [passwordHash, userId, clientAccessId]
  );
}

/** Self-service change (forced first-access change, or voluntary). Bumps session_version to invalidate every other open session for the account. */
export async function changeOwnClientPassword(userId: string, newPassword: string): Promise<number> {
  const db = await getDb();
  const passwordHash = await hashPassword(newPassword);
  const { rows } = await db.query<{ session_version: number }>(
    `UPDATE client_access_users SET password_hash = $1, must_change_password = false, session_version = session_version + 1
     WHERE id = $2 RETURNING session_version`,
    [passwordHash, userId]
  );
  return rows[0].session_version;
}

/** Re-authentication check: verifies a password against exactly this account's current hash, by id. */
export async function verifyClientUserPassword(id: string, password: string): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ password_hash: string }>(`SELECT password_hash FROM client_access_users WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) {
    await verifyPassword(password, await dummyPasswordHash());
    return false;
  }
  return verifyPassword(password, row.password_hash);
}

/** Checks a submitted username+password against every active client login (indexed lookup by username, not a full scan). Case-insensitive on the username. Transparently upgrades a legacy scrypt hash to argon2id on a successful verify. */
export async function matchClientUser(username: string, password: string): Promise<ClientUserMatch | null> {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) return null;

  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    name: string;
    username: string;
    password_hash: string;
    session_version: number;
    must_change_password: boolean;
    permissions_override: unknown;
    client_id: string;
    label: string;
    account_ids: string[];
    permissions: unknown;
  }>(
    `SELECT u.id, u.name, u.username, u.password_hash, u.session_version, u.must_change_password, u.permissions_override,
            c.id AS client_id, c.label, c.account_ids, c.permissions
     FROM client_access_users u
     JOIN client_access c ON c.id = u.client_access_id
     WHERE lower(u.username) = $1 AND u.revoked_at IS NULL AND c.revoked_at IS NULL`,
    [cleanUsername]
  );
  const row = rows[0];
  if (!row) {
    await verifyPassword(password, await dummyPasswordHash());
    return null;
  }
  if (!(await verifyPassword(password, row.password_hash))) return null;

  if (needsRehash(row.password_hash)) {
    hashPassword(password)
      .then((h) => db.query(`UPDATE client_access_users SET password_hash = $1 WHERE id = $2`, [h, row.id]))
      .catch((err) => console.error("[client-access] legacy hash upgrade failed", err));
  }

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    passwordHash: row.password_hash,
    sessionVersion: row.session_version,
    mustChangePassword: row.must_change_password,
    clientAccessId: row.client_id,
    label: row.label,
    accountIds: row.account_ids,
    permissions: sanitizePermissions(row.permissions_override ?? row.permissions),
  };
}
