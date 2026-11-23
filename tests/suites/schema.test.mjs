// Database structure (no server needed):
// - a database created from scratch and one upgraded from v7 end identical;
// - existing rows survive the upgrade;
// - a Vercel preview never changes the structure (it shares the production
//   database), unless ALLOW_SCHEMA_MIGRATIONS=1.
import { spawnSync } from "node:child_process";
import pg from "pg";
import { ok } from "../lib/helpers.mjs";

const url = new URL(process.env.DATABASE_URL);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const dbUrl = (name) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};

async function admin(q) {
  const c = new pg.Client({ connectionString: adminUrl.toString() });
  await c.connect();
  try {
    await c.query(q);
  } finally {
    await c.end();
  }
}
async function freshDb(name) {
  await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin(`CREATE DATABASE ${name}`);
}
async function query(name, q) {
  const c = new pg.Client({ connectionString: dbUrl(name) });
  await c.connect();
  try {
    return (await c.query(q)).rows;
  } finally {
    await c.end();
  }
}
function migrate(name, extraEnv = {}) {
  const env = { ...process.env, DATABASE_URL: dbUrl(name), ...extraEnv };
  if (!("VERCEL_ENV" in extraEnv)) delete env.VERCEL_ENV;
  const r = spawnSync("npx", ["tsx", "tests/lib/migrate.ts"], { env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`migrate failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim().split("\n").pop());
}
async function structure(name) {
  const cols = await query(
    name,
    `SELECT table_name, column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2`
  );
  const idx = await query(name, `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`);
  const cons = await query(name, `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1`);
  return JSON.stringify({ cols, idx, cons });
}
// Back to v7: undo exactly what v8 added.
async function downgradeToV7(name) {
  await query(
    name,
    `ALTER TABLE crm_messages DROP COLUMN campaign_id;
     DROP TABLE crm_campaign_recipients; DROP TABLE crm_campaigns;
     DELETE FROM schema_migrations WHERE version = 8;`
  );
}

const A = "crm_schema_fresh";
const B = "crm_schema_upgrade";
await freshDb(A);
await freshDb(B);

ok(migrate(A).version === 8, "empty database → v8");
const target = await structure(A);

ok(migrate(B).version === 8, "second database → v8");
await query(B, `INSERT INTO crm_contacts (id, phone, name) VALUES ('keep-me', '5515999990000', 'Contato existente')`);
await downgradeToV7(B);
ok((await query(B, `SELECT max(version) AS v FROM schema_migrations`))[0].v === 7, "second database rolled back to v7");

// A preview must leave it at v7.
const preview = migrate(B, { VERCEL_ENV: "preview" });
ok(preview.allowed === false && preview.version === 7, "a Vercel preview doesn't change the structure");
ok((await query(B, `SELECT to_regclass('crm_campaigns') AS t`))[0].t === null, "…no campaign tables were created by the preview");

const optIn = migrate(B, { VERCEL_ENV: "preview", ALLOW_SCHEMA_MIGRATIONS: "1" });
ok(optIn.allowed === true && optIn.version === 8, "a preview with its own database can opt in");
await downgradeToV7(B);
ok(migrate(B, { VERCEL_ENV: "production" }).version === 8, "production upgrades v7 → v8");
ok((await structure(B)) === target, "upgraded structure is identical to a fresh one");
ok((await query(B, `SELECT name FROM crm_contacts WHERE id = 'keep-me'`))[0]?.name === "Contato existente", "existing rows survive the upgrade");

await admin(`DROP DATABASE IF EXISTS ${A} WITH (FORCE)`);
await admin(`DROP DATABASE IF EXISTS ${B} WITH (FORCE)`);
console.log("SCHEMA PASSED");
