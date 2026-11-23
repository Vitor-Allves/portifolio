// Runs the app's own schema setup (getDb → ensureSchema) against
// DATABASE_URL and prints the resulting schema version. Used by
// tests/suites/schema.test.mjs, one process per run (getDb caches).
import { getDb, schemaChangesAllowed } from "../../src/lib/db";

(async () => {
  const db = await getDb();
  const { rows } = await db
    .query<{ v: number | null }>(`SELECT max(version) AS v FROM schema_migrations`)
    .catch(() => ({ rows: [{ v: null }] }));
  console.log(JSON.stringify({ version: rows[0]?.v ?? null, allowed: schemaChangesAllowed() }));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
