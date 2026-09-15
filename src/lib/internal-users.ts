// Server-only. Named logins for the internal Legado team — username +
// password, four fixed roles (see StaffRole). Passwords are never stored
// or returned in plaintext after creation/reset. E-mail is optional and
// never used for login, invites, or password recovery — purely an
// optional contact field.

import { randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import { hashPassword, verifyPassword, needsRehash, dummyPasswordHash } from "./password";
import { normalizeUsername } from "./username";
import { claimUsernameTx, renameUsernameTx } from "./username-registry";
import type { StaffRole } from "./session-scope";
import type { InternalUserSummary } from "./internal-users-types";
import { EMPTY_PERMISSIONS, sanitizePermissions, type ClientPermissions } from "./client-permissions";

export type { InternalUserSummary };

export type InternalUserMatch = {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  passwordHash: string;
  sessionVersion: number;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  totpSecretEnc: string | null;
  totpRecoveryHashes: string[];
};

function mapRow(r: {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: StaffRole;
  account_ids: string[];
  permissions: unknown;
  totp_enabled: boolean;
  must_change_password: boolean;
  created_at: string;
}): InternalUserSummary {
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    email: r.email,
    role: r.role,
    accountIds: r.account_ids,
    permissions: sanitizePermissions(r.permissions),
    totpEnabled: r.totp_enabled,
    mustChangePassword: r.must_change_password,
    createdAt: r.created_at,
  };
}

export async function listInternalUsers(): Promise<InternalUserSummary[]> {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT id, name, username, email, role, account_ids, permissions, totp_enabled, must_change_password, created_at
     FROM internal_users WHERE revoked_at IS NULL ORDER BY created_at ASC`
  );
  return rows.map(mapRow);
}

export async function getInternalUserSummary(id: string): Promise<InternalUserSummary | null> {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT id, name, username, email, role, account_ids, permissions, totp_enabled, must_change_password, created_at
     FROM internal_users WHERE id = $1 AND revoked_at IS NULL`,
    [id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Active (non-revoked) administrador_geral count — used to block revoking/demoting the last one. */
export async function countActiveFullAdmins(excludingId?: string): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM internal_users
     WHERE role = 'administrador_geral' AND revoked_at IS NULL AND id <> COALESCE($1, '')`,
    [excludingId ?? null]
  );
  return Number(rows[0]?.count ?? "0");
}

export type CreateInternalUserInput = {
  name: string;
  username: string;
  password: string;
  role: StaffRole;
  accountIds: string[];
  permissions?: ClientPermissions;
  email?: string | null;
};

/** Creates a new team login with an admin-chosen initial password. must_change_password is always true — the account is ready to authenticate immediately, but can't reach any data until that first change is done (see auth-context.ts's hasDataAccess). */
export async function createInternalUser(input: CreateInternalUserInput): Promise<{ id: string }> {
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error("Nome é obrigatório.");
  const cleanEmail = input.email?.trim() || null;
  if (cleanEmail && !cleanEmail.includes("@")) throw new Error("E-mail inválido.");

  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  const permissions = sanitizePermissions(input.permissions ?? EMPTY_PERMISSIONS);

  await withTransaction(async (client) => {
    const username = await claimUsernameTx(client, input.username, "internal_users", id);
    await client.query(
      `INSERT INTO internal_users (id, name, username, email, password_hash, role, account_ids, permissions, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      [id, cleanName, username, cleanEmail, passwordHash, input.role, input.accountIds, JSON.stringify(permissions)]
    );
  });

  return { id };
}

export type UpdateInternalUserInput = {
  name?: string;
  username?: string;
  role?: StaffRole;
  accountIds?: string[];
  permissions?: ClientPermissions;
  email?: string | null;
};

/** Updates profile fields; never touches the password. Caller is responsible for the "no self-elevation / last-admin" business rules — this function only performs the write. */
export async function updateInternalUser(id: string, input: UpdateInternalUserInput): Promise<void> {
  const db = await getDb();
  const { rows } = await db.query<{ username: string }>(`SELECT username FROM internal_users WHERE id = $1`, [id]);
  if (!rows[0]) throw new Error("Usuário não encontrado.");

  await withTransaction(async (client) => {
    if (input.username && normalizeUsername(input.username) !== normalizeUsername(rows[0].username)) {
      await renameUsernameTx(client, rows[0].username, input.username, "internal_users", id);
      await client.query(`UPDATE internal_users SET username = $1 WHERE id = $2`, [normalizeUsername(input.username), id]);
    }
    if (input.name !== undefined) {
      await client.query(`UPDATE internal_users SET name = $1 WHERE id = $2`, [input.name.trim(), id]);
    }
    if (input.email !== undefined) {
      await client.query(`UPDATE internal_users SET email = $1 WHERE id = $2`, [input.email?.trim() || null, id]);
    }
    if (input.role !== undefined) {
      await client.query(`UPDATE internal_users SET role = $1 WHERE id = $2`, [input.role, id]);
    }
    if (input.accountIds !== undefined) {
      await client.query(`UPDATE internal_users SET account_ids = $1 WHERE id = $2`, [input.accountIds, id]);
    }
    if (input.permissions !== undefined) {
      await client.query(`UPDATE internal_users SET permissions = $1 WHERE id = $2`, [
        JSON.stringify(sanitizePermissions(input.permissions)),
        id,
      ]);
    }
  });
}

/** Ends every open session for this account immediately and blocks new logins, while preserving the row (and its audit history) for the record. */
export async function revokeInternalUser(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE internal_users SET revoked_at = now(), session_version = session_version + 1 WHERE id = $1`, [id]);
}

/** Administrative reset: sets a new password chosen or generated by an administrador_geral, invalidates every existing session for the account, and forces a change on next login. Never returns or logs the password. */
export async function resetInternalUserPassword(id: string, newPassword: string): Promise<void> {
  const db = await getDb();
  const passwordHash = await hashPassword(newPassword);
  await db.query(
    `UPDATE internal_users SET password_hash = $1, must_change_password = true, session_version = session_version + 1 WHERE id = $2`,
    [passwordHash, id]
  );
}

/** Self-service change (forced first-access change, or voluntary). Bumps session_version to invalidate every other open session for the account — the caller must re-issue a fresh token for the session performing the change. */
export async function changeOwnInternalPassword(id: string, newPassword: string): Promise<number> {
  const db = await getDb();
  const passwordHash = await hashPassword(newPassword);
  const { rows } = await db.query<{ session_version: number }>(
    `UPDATE internal_users SET password_hash = $1, must_change_password = false, session_version = session_version + 1
     WHERE id = $2 RETURNING session_version`,
    [passwordHash, id]
  );
  return rows[0].session_version;
}

/** Checks a submitted username+password against active team logins. Case-insensitive on the username; the password check itself uses a constant-time comparison inside verifyPassword regardless of match. Transparently upgrades a legacy scrypt hash to argon2id on a successful verify. */
export async function matchInternalUser(username: string, password: string): Promise<InternalUserMatch | null> {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) return null;

  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    name: string;
    username: string;
    password_hash: string;
    role: StaffRole;
    session_version: number;
    must_change_password: boolean;
    totp_enabled: boolean;
    totp_secret_enc: string | null;
    totp_recovery_hashes: string[];
  }>(
    `SELECT id, name, username, password_hash, role, session_version, must_change_password,
            totp_enabled, totp_secret_enc, totp_recovery_hashes
     FROM internal_users WHERE lower(username) = $1 AND revoked_at IS NULL`,
    [cleanUsername]
  );
  const row = rows[0];
  if (!row) {
    // Still run a hash comparison against a dummy so a nonexistent username
    // isn't distinguishable from a wrong password by response time.
    await verifyPassword(password, await dummyPasswordHash());
    return null;
  }
  if (!(await verifyPassword(password, row.password_hash))) return null;

  if (needsRehash(row.password_hash)) {
    hashPassword(password)
      .then((h) => db.query(`UPDATE internal_users SET password_hash = $1 WHERE id = $2`, [h, row.id]))
      .catch((err) => console.error("[internal-users] legacy hash upgrade failed", err));
  }

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    passwordHash: row.password_hash,
    sessionVersion: row.session_version,
    mustChangePassword: row.must_change_password,
    totpEnabled: row.totp_enabled,
    totpSecretEnc: row.totp_secret_enc,
    totpRecoveryHashes: row.totp_recovery_hashes,
  };
}

/** Re-authentication check: verifies a password against exactly this account's current hash, by id (not username lookup) — used by the "confirm your own password" step before a sensitive admin action (e.g. resetting a colleague's password). */
export async function verifyInternalUserPassword(id: string, password: string): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ password_hash: string }>(`SELECT password_hash FROM internal_users WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row) {
    await verifyPassword(password, await dummyPasswordHash());
    return false;
  }
  return verifyPassword(password, row.password_hash);
}

// --- TOTP (2FA) state --------------------------------------------------

export async function setTotpEnrollment(id: string, secretEnc: string, recoveryHashes: string[]): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE internal_users SET totp_secret_enc = $1, totp_recovery_hashes = $2, totp_enabled = false WHERE id = $3`,
    [secretEnc, recoveryHashes, id]
  );
}

export async function confirmTotpEnrollment(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE internal_users SET totp_enabled = true WHERE id = $1`, [id]);
}

/** Administrative reset of a colleague's 2FA — clears the current secret/recovery codes and disables 2FA, forcing them through enrollment again on next login. Restricted to administrador_geral by the calling route. */
export async function resetTotp(id: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE internal_users SET totp_secret_enc = NULL, totp_recovery_hashes = '{}', totp_enabled = false, session_version = session_version + 1 WHERE id = $1`,
    [id]
  );
}

export async function consumeRecoveryCode(id: string, hashes: string[]): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE internal_users SET totp_recovery_hashes = $1 WHERE id = $2`, [hashes, id]);
}
