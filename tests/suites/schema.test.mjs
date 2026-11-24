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
async function query(name, q, params = []) {
  const c = new pg.Client({ connectionString: dbUrl(name) });
  await c.connect();
  try {
    return (params.length ? await c.query(q, params) : await c.query(q)).rows;
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
const LATEST = 19;

// The task types v9 seeded (the rest of DEFAULT_OPTIONS.task_kind came with v13).
const V9_TASK_KINDS = ["ligacao", "reuniao", "whatsapp", "email", "tarefa"];

// Back to v18: undo exactly what v19 (metas) added.
async function downgradeToV18(name) {
  await query(name, `DROP TABLE crm_goals; DELETE FROM schema_migrations WHERE version = 19;`);
}

// Back to v17: undo exactly what v19 and v18 (acompanhamento mensal) added.
async function downgradeToV17(name) {
  await downgradeToV18(name);
  await query(name, `ALTER TABLE crm_notifications DROP COLUMN client_id; DROP TABLE crm_client_reports; DELETE FROM schema_migrations WHERE version = 18;`);
}

// Back to v16: undo exactly what v18 and v17 (clientes ativos) added.
async function downgradeToV16(name) {
  await downgradeToV17(name);
  await query(name, `DROP TABLE crm_client_events; DROP TABLE crm_contracts; DROP TABLE crm_clients; DELETE FROM schema_migrations WHERE version = 17;`);
}

// Back to v15: undo exactly what v17 and v16 (públicos salvos) added.
async function downgradeToV15(name) {
  await downgradeToV16(name);
  await query(name, `DROP TABLE crm_campaign_audiences; DELETE FROM schema_migrations WHERE version = 16;`);
}

// Back to v14: undo exactly what v16 and v15 (conversas) added.
async function downgradeToV14(name) {
  await downgradeToV15(name);
  await query(
    name,
    `DROP INDEX crm_contacts_attendant_idx; DROP INDEX crm_messages_created_idx;
     ALTER TABLE crm_contacts DROP COLUMN attendant_id, DROP COLUMN attendant_since;
     DELETE FROM crm_contact_tags WHERE tag_id IN (SELECT id FROM crm_tags WHERE category = 'atendimento');
     DELETE FROM crm_tags WHERE category = 'atendimento';
     DELETE FROM schema_migrations WHERE version = 15;`
  );
}

// Back to v13: undo exactly what v15 and v14 (automações) added.
async function downgradeToV13(name) {
  await downgradeToV14(name);
  await query(name, `DROP TABLE crm_notifications; DROP TABLE crm_automation_runs; DROP TABLE crm_automations; DELETE FROM schema_migrations WHERE version = 14;`);
}

// Back to v12: undo exactly what v14 and v13 (tarefas e agenda) added.
async function downgradeToV12(name) {
  await downgradeToV13(name);
  await query(
    name,
    `DROP TABLE crm_task_events;
     DROP INDEX crm_tasks_company_idx; DROP INDEX crm_tasks_owner_due_idx; DROP INDEX crm_tasks_remind_idx;
     ALTER TABLE crm_tasks DROP COLUMN company_id, DROP COLUMN description, DROP COLUMN priority, DROP COLUMN status,
       DROP COLUMN remind_minutes, DROP COLUMN remind_at, DROP COLUMN reminder_dismissed_at;
     ALTER TABLE crm_tasks ALTER COLUMN contact_id SET NOT NULL;
     ALTER TABLE crm_options DROP COLUMN color;
     DELETE FROM crm_options WHERE kind = 'priority' OR (kind = 'task_kind' AND NOT (id = ANY('{${V9_TASK_KINDS.join(",")}}')));
     DELETE FROM schema_migrations WHERE version = 13;`
  );
}

// Back to v7: undo exactly what v14 (automações), v13 (tarefas), v12 (índices), v11 (equipe), v10 (campos da entrega 2), v9 (Personalização) and v8 (Campanhas) added.
async function downgradeToV7(name) {
  await downgradeToV12(name);
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
ok((await query(B, `SELECT count(*)::int AS n FROM crm_tags`))[0].n === 19, "initial tags seeded (with the v15 Atendimento ones)");
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

// v13 (Fase 3): from a v12 database that already has tasks and a reordered list of types.
await downgradeToV12(B);
ok((await query(B, `SELECT max(version) AS v FROM schema_migrations`))[0].v === 12, "back at v12");
await query(
  B,
  `INSERT INTO crm_tasks (id, contact_id, kind, title, due_at, all_day) VALUES ('t-open', 'keep-me', 'ligacao', 'Ligar', now() + interval '1 day', false);
   INSERT INTO crm_tasks (id, contact_id, kind, title, done_at, result) VALUES ('t-done', 'keep-me', 'email', 'Mandar proposta', now(), 'Enviada');
   INSERT INTO crm_tasks (id, contact_id, kind, title, canceled_at) VALUES ('t-cancel', 'keep-me', 'reuniao', 'Reunião', now());
   UPDATE crm_options SET sort = 0 WHERE kind = 'task_kind' AND id = 'tarefa';
   UPDATE crm_options SET sort = 4 WHERE kind = 'task_kind' AND id = 'ligacao';`
);
const kindsBefore = (await query(B, `SELECT id, sort FROM crm_options WHERE kind = 'task_kind' ORDER BY id`)).map((r) => `${r.id}:${r.sort}`).join(",");
ok(migrate(B, { VERCEL_ENV: "production" }).version === LATEST, `production upgrades v12 → v${LATEST}`);
ok((await structure(B)) === target, "…structure identical to a fresh one");
const statuses = (await query(B, `SELECT id, status, priority, description, remind_at FROM crm_tasks WHERE id LIKE 't-%' ORDER BY id`));
ok(
  statuses.map((r) => `${r.id}=${r.status}`).join(",") === "t-cancel=cancelada,t-done=concluida,t-open=pendente",
  `v13: status comes from what was recorded (${statuses.map((r) => `${r.id}=${r.status}`).join(",")})`
);
ok(statuses.every((r) => r.priority === "media" && r.description === null && r.remind_at === null), "v13: existing tasks get the default priority, no description, no reminder");
ok((await query(B, `SELECT result FROM crm_tasks WHERE id = 't-done'`))[0].result === "Enviada", "v13: a finished task keeps its result");
const kindsAfter = (await query(B, `SELECT id, sort FROM crm_options WHERE kind = 'task_kind' AND id = ANY($1) ORDER BY id`, [V9_TASK_KINDS])).map((r) => `${r.id}:${r.sort}`).join(",");
ok(kindsAfter === kindsBefore, "v13: the team's order of the existing task types is kept");
const added = await query(B, `SELECT id, label, sort, color FROM crm_options WHERE kind = 'task_kind' AND NOT (id = ANY($1)) ORDER BY sort`, [V9_TASK_KINDS]);
ok(
  added.map((r) => r.label).join(",") === "Primeiro contato,Follow-up,Preparação de proposta,Envio de proposta,Retorno comercial,Acompanhamento de cliente,Atividade interna",
  `v13: the spec's task types join the list (${added.map((r) => r.label).join(",")})`
);
ok(added.every((r) => r.sort > 4), "…after the existing ones");
ok((await query(B, `SELECT count(*)::int AS n FROM crm_options WHERE kind = 'task_kind' AND color IS NULL`))[0].n === 0, "v13: every task type has a color");
const priorities = (await query(B, `SELECT id, label, locked, color FROM crm_options WHERE kind = 'priority' ORDER BY sort`)).map((r) => `${r.label}${r.locked ? "*" : ""}:${r.color}`).join(",");
ok(priorities === "Alta:vermelho,Média*:amarelo,Baixa:cinza", `v13: priorities seeded, Média is the fallback (${priorities})`);
ok((await query(B, `SELECT count(*)::int AS n FROM crm_options WHERE kind NOT IN ('task_kind', 'priority') AND color IS NOT NULL`))[0].n === 0, "v13: other lists get no color");
// v14 (Fase 3, entrega 2): the ten automations, every one off — nothing changes until an Administrador turns one on.
const autos = await query(B, `SELECT id, status FROM crm_automations ORDER BY id`);
ok(autos.length === 10 && autos.every((r) => r.status === "desativada"), `v14: ten automations, all desativadas (${autos.map((r) => r.status).join(",")})`);
ok((await query(B, `SELECT (SELECT count(*) FROM crm_automation_runs) + (SELECT count(*) FROM crm_notifications) AS n`))[0].n === "0", "v14: no runs and no notices yet");
// v15 (Fase 4, entrega 1): Atendimento tags; no conversation starts with someone attending it.
const attendanceTags = (await query(B, `SELECT label FROM crm_tags WHERE category = 'atendimento' ORDER BY sort`)).map((r) => r.label).join(",");
ok(attendanceTags === "Aguardando cliente,Dúvida,Suporte,Reclamação,Urgente", `v15: Atendimento tags seeded (${attendanceTags})`);
ok((await query(B, `SELECT count(*)::int AS n FROM crm_contacts WHERE attendant_id IS NOT NULL`))[0].n === 0, "v15: nobody is attending any conversation yet");
// v16 (Fase 4, entrega 2): saved audiences start empty.
ok((await query(B, `SELECT count(*)::int AS n FROM crm_campaign_audiences`))[0].n === 0, "v16: no saved audiences yet");
// v17 (Fase 5, entrega 1): clientes ativos start empty — nothing becomes a client by itself.
ok((await query(B, `SELECT (SELECT count(*) FROM crm_clients) + (SELECT count(*) FROM crm_contracts) + (SELECT count(*) FROM crm_client_events) AS n`))[0].n === "0", "v17: no clients, contracts or history yet");
// v18 (Fase 5, entrega 2): no monthly acompanhamento yet.
ok((await query(B, `SELECT count(*)::int AS n FROM crm_client_reports`))[0].n === 0, "v18: no acompanhamento yet");
// v19 (Fase 6, entrega 2): no goals until an Administrador or Gestor sets them.
ok((await query(B, `SELECT count(*)::int AS n FROM crm_goals`))[0].n === 0, "v19: no goals yet");

await admin(`DROP DATABASE IF EXISTS ${A} WITH (FORCE)`);
await admin(`DROP DATABASE IF EXISTS ${B} WITH (FORCE)`);
console.log("SCHEMA PASSED");
