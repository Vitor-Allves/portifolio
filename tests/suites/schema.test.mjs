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
const LATEST = 12;

// Back to v7: undo exactly what v12 (índices), v11 (equipe), v10 (campos da entrega 2), v9 (Personalização) and v8 (Campanhas) added.
async function downgradeToV7(name) {
  await query(
    name,
    `DROP INDEX crm_events_created_idx; DROP INDEX crm_events_user_idx;
     ALTER TABLE internal_users DROP COLUMN crm_permissions, DROP COLUMN crm_job_title, DROP COLUMN crm_department;
     DROP TABLE crm_company_tags;
     ALTER TABLE crm_contacts DROP COLUMN temperature, DROP COLUMN service_interest, DROP COLUMN return_at, DROP COLUMN is_decision_maker;
     ALTER TABLE crm_companies DROP COLUMN legal_name, DROP COLUMN cnpj, DROP COLUMN state, DROP COLUMN address, DROP COLUMN owner_id, DROP COLUMN status;
     ALTER TABLE crm_deals DROP COLUMN service, DROP COLUMN negotiated_cents, DROP COLUMN source, DROP COLUMN temperature, DROP COLUMN won_reason, DROP COLUMN won_note;
     DROP TABLE crm_contact_tags; DROP TABLE crm_tags; DROP TABLE crm_options;
     ALTER TABLE crm_messages DROP COLUMN campaign_id;
     DROP TABLE crm_campaign_recipients; DROP TABLE crm_campaigns;
     DELETE FROM schema_migrations WHERE version IN (8, 9, 10, 11, 12);`
  );
}

const A = "crm_schema_fresh";
const B = "crm_schema_upgrade";
await freshDb(A);
await freshDb(B);

ok(migrate(A).version === LATEST, `empty database → v${LATEST}`);
const target = await structure(A);

ok(migrate(B).version === LATEST, `second database → v${LATEST}`);
await query(B, `INSERT INTO crm_contacts (id, phone, name, segment, source) VALUES ('keep-me', '5515999990000', 'Contato existente', 'Odontologia', 'bni')`);
await downgradeToV7(B);
await query(B, `INSERT INTO crm_deals (id, contact_id, title, value_cents, stage) VALUES ('keep-deal', 'keep-me', 'Negócio existente', 150000, 'proposta')`);
ok((await query(B, `SELECT max(version) AS v FROM schema_migrations`))[0].v === 7, "second database rolled back to v7");

// A preview must leave it at v7.
const preview = migrate(B, { VERCEL_ENV: "preview" });
ok(preview.allowed === false && preview.version === 7, "a Vercel preview doesn't change the structure");
ok((await query(B, `SELECT to_regclass('crm_campaigns') AS t`))[0].t === null, "…no campaign tables were created by the preview");

const optIn = migrate(B, { VERCEL_ENV: "preview", ALLOW_SCHEMA_MIGRATIONS: "1" });
ok(optIn.allowed === true && optIn.version === LATEST, "a preview with its own database can opt in");
await downgradeToV7(B);
ok(migrate(B, { VERCEL_ENV: "production" }).version === LATEST, `production upgrades v7 → v${LATEST}`);
ok((await structure(B)) === target, "upgraded structure is identical to a fresh one");
ok((await query(B, `SELECT name FROM crm_contacts WHERE id = 'keep-me'`))[0]?.name === "Contato existente", "existing rows survive the upgrade");
// v9 seeds: the lists that were in code, same codes; segments already in use become the list.
const sources = (await query(B, `SELECT id, label FROM crm_options WHERE kind = 'source' ORDER BY sort`)).map((r) => `${r.id}=${r.label}`).join(",");
ok(sources === "anuncio=Tráfego pago,bni=BNI,site=Site,evento=Evento,indicacao=Indicação,prospeccao_manual=Prospecção manual,outro=Outro", `origens seeded with the old codes (${sources})`);
ok((await query(B, `SELECT count(*)::int AS n FROM crm_options WHERE kind = 'segment' AND label = 'Odontologia'`))[0].n === 1, "segment in use became a list option");
ok((await query(B, `SELECT count(*)::int AS n FROM crm_tags`))[0].n === 14, "initial tags seeded");
// v10: new columns are optional; the opportunity's origin comes from its contact; nothing else is filled in.
const deal = (await query(B, `SELECT source, service, negotiated_cents, won_reason, value_cents, stage FROM crm_deals WHERE id = 'keep-deal'`))[0];
ok(deal.source === "bni" && deal.service === null && deal.negotiated_cents === null && deal.won_reason === null, "v10: deal origin backfilled from the contact, new fields empty");
ok(Number(deal.value_cents) === 150000 && deal.stage === "proposta", "v10: an existing deal keeps its value and stage (no stage requirement applied retroactively)");
const contact = (await query(B, `SELECT temperature, service_interest, return_at, is_decision_maker FROM crm_contacts WHERE id = 'keep-me'`))[0];
ok(contact.temperature === null && contact.service_interest === null && contact.return_at === null && contact.is_decision_maker === false, "v10: existing contact gets empty new fields");
ok((await query(B, `SELECT count(*)::int AS n FROM crm_companies WHERE status IS NOT NULL OR cnpj IS NOT NULL`))[0].n === 0, "v10: no company gets an invented status or CNPJ");
// v11: departments list seeded; nobody gets permission exceptions.
const departments = (await query(B, `SELECT label FROM crm_options WHERE kind = 'department' ORDER BY sort`)).map((r) => r.label).join(",");
ok(departments === "Comercial,Marketing,Operação,Atendimento,Diretoria", `v11: departments seeded (${departments})`);
ok((await query(B, `SELECT count(*)::int AS n FROM internal_users WHERE crm_permissions <> '{}'::jsonb`))[0].n === 0, "v11: no one starts with permission exceptions");

await admin(`DROP DATABASE IF EXISTS ${A} WITH (FORCE)`);
await admin(`DROP DATABASE IF EXISTS ${B} WITH (FORCE)`);
console.log("SCHEMA PASSED");
