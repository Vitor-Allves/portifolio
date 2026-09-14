// Server-only Postgres connection. Requires a database attached to the
// Vercel project (Storage tab → Connect Database → a Postgres provider,
// e.g. Neon) — see docs/client-access-setup.md.

import { Pool } from "pg";
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
