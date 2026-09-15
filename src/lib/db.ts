// Server-only Postgres connection. Requires a database attached to the
// Vercel project (Storage tab → Connect Database → a Postgres provider,
// e.g. Neon) — see docs/client-access-setup.md.

import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export class DbConfigError extends Error {
  constructor() {
    super(
      "No database connection string configured (DATABASE_URL / POSTGRES_URL)"
    );
    this.name = "DbConfigError";
  }
}

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new DbConfigError();
  }

  pool = new Pool({ connectionString });
  // Lets Vercel's Fluid Compute runtime reuse/drain this pool correctly
  // across invocations instead of leaking connections per cold start.
  attachDatabasePool(pool);
  return pool;
}

async function ensureSchema(): Promise<void> {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS client_access (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      label TEXT NOT NULL,
      account_ids TEXT[] NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ
    )
  `);
  // Added after the table already existed in some deployments — CREATE
  // TABLE IF NOT EXISTS above won't add it retroactively, so it's a
  // separate, idempotent statement. Defaults to "nothing hidden" (same
  // filters/columns/sections a client already saw) for every existing row.
  await db.query(`
    ALTER TABLE client_access
    ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb
  `);

  // Client logins moved from one shared password per client (on client_access
  // itself) to one or more named logins per client, each individually
  // revocable. The column above stays (harmless, unused after migration) so
  // this is non-destructive; new client_access rows no longer need a value
  // for it.
  await db.query(`ALTER TABLE client_access ALTER COLUMN password_hash DROP NOT NULL`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS client_access_users (
      id TEXT PRIMARY KEY,
      client_access_id TEXT NOT NULL REFERENCES client_access(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ
    )
  `);
  // One-time backfill: every pre-existing client_access row had its own
  // password_hash directly. Carry that hash into a named user (named after
  // the client itself) so the client's existing password keeps working
  // unchanged after the split — safe to run on every boot since it only
  // touches clients that don't have a migrated user yet.
  await db.query(`
    INSERT INTO client_access_users (id, client_access_id, name, password_hash, created_at)
    SELECT ca.id || '-legacy', ca.id, ca.label, ca.password_hash, ca.created_at
    FROM client_access ca
    WHERE ca.password_hash IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM client_access_users u WHERE u.client_access_id = ca.id
      )
  `);

  // Named logins for the internal Legado team, replacing the single shared
  // ANALYTICS_DASHBOARD_PASSWORD for day-to-day use (that env var still
  // works too, as a bootstrap admin login that can't be locked out).
  await db.query(`
    CREATE TABLE IF NOT EXISTS internal_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ
    )
  `);

  // Admin-authored, named filter presets for the Relatórios tab — "filters"
  // holds a ReportFilters (period, compare, and account/campaign/ad set/
  // objective/status id lists, each `null` meaning "no restriction" rather
  // than a frozen list). Not security-sensitive like a login credential, so
  // deleting one is a real DELETE rather than a soft revoke.
  await db.query(`
    CREATE TABLE IF NOT EXISTS report_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      filters JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // ---------------------------------------------------------------------
  // Username-based login (replaces e-mail/shared-password login). Every
  // account — staff or client — gets a username, unique across the WHOLE
  // platform, not just within its own table. Two tables can't share a
  // single UNIQUE constraint in Postgres, so `usernames` is a thin registry
  // table whose PRIMARY KEY is the actual source of truth for global
  // uniqueness; the `username` column on each account table is a
  // denormalized copy kept in sync (and still individually indexed, for
  // fast case-insensitive login lookups without a join). Every write that
  // touches both goes through withTransaction() so they can never drift.
  // ---------------------------------------------------------------------
  await db.query(`
    CREATE TABLE IF NOT EXISTS usernames (
      username_lower TEXT PRIMARY KEY,
      owner_table TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS username TEXT`);
  await db.query(`ALTER TABLE internal_users ALTER COLUMN email DROP NOT NULL`);
  // The original bare UNIQUE constraint (email NOT NULL UNIQUE) is now too
  // strict since e-mail is optional — replaced with a partial unique index
  // that only applies when an e-mail is actually present.
  await db.query(`ALTER TABLE internal_users DROP CONSTRAINT IF EXISTS internal_users_email_key`);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS internal_users_email_unique_idx
    ON internal_users (lower(email)) WHERE email IS NOT NULL
  `);
  // Role taxonomy expanded from {admin, analyst} to 4 fixed profiles —
  // remapped below so every existing row keeps equivalent access
  // (old "admin" had full access including managing other users, which is
  // exactly what "administrador_geral" means now).
  await db.query(`UPDATE internal_users SET role = 'administrador_geral' WHERE role = 'admin'`);
  await db.query(`UPDATE internal_users SET role = 'analista' WHERE role = 'analyst'`);
  // Companies (Meta ad account ids) this staff member may access — same
  // representation client_access already uses for the same purpose, so
  // every data-scoping code path that already understands "a list of
  // allowed Meta account ids" needs no new logic to also understand staff
  // scoping. Ignored entirely for role = administrador_geral (always sees
  // every account, same as the old unconditional admin behavior).
  await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS account_ids TEXT[] NOT NULL DEFAULT '{}'`);
  // Same shape as client_access.permissions (hiddenFilters/hiddenColumns/
  // hiddenSections/disabledActions) — staff below administrador_geral can
  // now be restricted the same way a client can.
  await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb`);
  // Bumped on every password reset/change and on revoke — embedded in the
  // signed session token at login time; a mismatch against the current DB
  // value means the token was issued before a reset/revoke and is rejected
  // immediately, without waiting for its 12h expiry.
  await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`);
  await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false`);
  await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT`);
  await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false`);
  await db.query(`ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS totp_recovery_hashes TEXT[] NOT NULL DEFAULT '{}'`);

  await db.query(`ALTER TABLE client_access_users ADD COLUMN IF NOT EXISTS username TEXT`);
  await db.query(`ALTER TABLE client_access_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1`);
  await db.query(`ALTER TABLE client_access_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false`);
  // NULL = inherit the parent company's permissions (client_access.permissions,
  // the common case); set = this person's own override, entirely replacing
  // the company's permissions for them specifically.
  await db.query(`ALTER TABLE client_access_users ADD COLUMN IF NOT EXISTS permissions_override JSONB`);

  await migrateUsernamesAndRoles(db);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS internal_users_username_unique_idx ON internal_users (lower(username))
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS client_access_users_username_unique_idx ON client_access_users (lower(username))
  `);
  await db.query(`ALTER TABLE internal_users ALTER COLUMN username SET NOT NULL`);
  await db.query(`ALTER TABLE client_access_users ALTER COLUMN username SET NOT NULL`);

  // Append-only trail for every access-management action (user create,
  // permission/role/company change, password reset, revoke, session
  // termination, report generation/download, 2FA events). Never holds
  // passwords, tokens or TOTP secrets — see audit-log.ts.
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      actor_label TEXT NOT NULL,
      actor_kind TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      target_label TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC)`);
}

function slugifyUsernameCandidate(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  const withLetter = /^[a-z]/.test(base) ? base : `u${base}`;
  return withLetter.length >= 3 ? withLetter : `${withLetter}usr`;
}

/**
 * One-time (per-row) backfill: assigns a unique username to every
 * pre-existing internal_users/client_access_users row that doesn't have one
 * yet, registers it in the global `usernames` table, and remaps the old
 * 2-value role column. Existing password hashes are left completely
 * untouched — this never resets anyone's password, only adds a login name
 * to accounts that could previously only log in by e-mail (staff) or a
 * shared per-client password (clients). Safe to run on every boot: rows
 * that already have a username are skipped entirely (`WHERE username IS
 * NULL`), and candidate generation re-checks the registry table for every
 * single insert, so re-running after a partial failure just resumes.
 */
async function migrateUsernamesAndRoles(db: Pool): Promise<void> {
  const taken = new Set<string>();
  {
    const { rows } = await db.query<{ username_lower: string }>(`SELECT username_lower FROM usernames`);
    for (const r of rows) taken.add(r.username_lower);
  }

  async function claimUsername(base: string, ownerTable: string, ownerId: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    taken.add(candidate);
    await db.query(
      `INSERT INTO usernames (username_lower, owner_table, owner_id) VALUES ($1,$2,$3)
       ON CONFLICT (username_lower) DO NOTHING`,
      [candidate, ownerTable, ownerId]
    );
    return candidate;
  }

  const { rows: staffRows } = await db.query<{ id: string; name: string; email: string | null }>(
    `SELECT id, name, email FROM internal_users WHERE username IS NULL`
  );
  for (const row of staffRows) {
    const emailLocalPart = row.email?.split("@")[0] ?? "";
    const base = slugifyUsernameCandidate(emailLocalPart || row.name);
    const username = await claimUsername(base, "internal_users", row.id);
    await db.query(`UPDATE internal_users SET username = $1 WHERE id = $2`, [username, row.id]);
  }

  const { rows: clientUserRows } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM client_access_users WHERE username IS NULL`
  );
  for (const row of clientUserRows) {
    const base = slugifyUsernameCandidate(row.name);
    const username = await claimUsername(base, "client_access_users", row.id);
    await db.query(`UPDATE client_access_users SET username = $1 WHERE id = $2`, [username, row.id]);
  }
}

/** Runs schema setup once per warm instance, then returns the pool. */
export async function getDb(): Promise<Pool> {
  const db = getPool();
  if (!schemaReady) {
    schemaReady = ensureSchema().catch((err) => {
      schemaReady = null; // let the next call retry instead of caching a failure
      throw err;
    });
  }
  await schemaReady;
  return db;
}

/**
 * Runs `fn` inside a single BEGIN/COMMIT client transaction, rolling back on
 * any thrown error. Required whenever a write touches more than one table
 * that must never drift apart — chiefly the `usernames` registry plus
 * `internal_users`/`client_access_users` (claim-or-rename a username and
 * write the owning row atomically), and revoke/reset flows that bump
 * `session_version` together with other account fields.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await getDb();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
