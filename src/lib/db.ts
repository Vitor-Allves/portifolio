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
