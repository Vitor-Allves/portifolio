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
const LATEST = 27;

// The task types v9 seeded (the rest of DEFAULT_OPTIONS.task_kind came with v13).
const V9_TASK_KINDS = ["ligacao", "reuniao", "whatsapp", "email", "tarefa"];

// The closing reasons v21 added, and the v9 names of the ones it renamed.
const V21_REASONS = ["preco", "desistencia", "sem_interesse", "contato_invalido", "desqualificado", "duplicado", "retornar", "aguardando_decisao", "aguardando_orcamento", "retomar_data"];
const V9_REASON_LABELS = { sem_orcamento: "Sem orçamento", concorrente: "Escolheu outra empresa", sem_resposta: "Parou de responder", sem_perfil: "Sem perfil para o serviço", adiou: "Adiou o projeto", outro: "Outro" };

// Back to v26: undo exactly what v27 (automações e mensagens agendadas) added.
async function downgradeToV26(name) {
  await query(
    name,
    `DROP TABLE crm_scheduled_messages;
     DELETE FROM crm_automations WHERE id IN ('proposta_vencendo', 'retorno_agendado', 'diagnostico_realizado', 'oportunidade_sem_responsavel', 'transferencia_solicitada', 'proposta_aprovada');
     DELETE FROM schema_migrations WHERE version = 27;`
  );
}

// Back to v25: undo exactly what v27 and v26 (financeiro) added.
async function downgradeToV25(name) {
  await downgradeToV26(name);
  await query(name, `DROP TABLE crm_commission_rules; ALTER TABLE crm_contracts DROP COLUMN status_changed_at; DELETE FROM schema_migrations WHERE version = 26;`);
}

// Back to v24: undo exactly what v26 and v25 (contratos e operação) added.
async function downgradeToV24(name) {
  await downgradeToV25(name);
  await query(
    name,
    `DROP TABLE crm_client_satisfaction; DROP TABLE crm_client_deliverables; DROP TABLE crm_client_onboarding;
     ALTER TABLE crm_contracts DROP COLUMN number, DROP COLUMN proposal_id, DROP COLUMN one_time_cents, DROP COLUMN payment_terms, DROP COLUMN due_day,
       DROP COLUMN term_months, DROP COLUMN renewal, DROP COLUMN cancellation_rules, DROP COLUMN sales_owner_id, DROP COLUMN ops_owner_id,
       DROP COLUMN signed_file_id, DROP COLUMN signed_on;
     DROP SEQUENCE crm_contract_number_seq;
     DELETE FROM schema_migrations WHERE version = 25;`
  );
}

// Back to v23: undo exactly what v25 and v24 (propostas) added.
async function downgradeToV23(name) {
  await downgradeToV24(name);
  await query(
    name,
    `DROP TABLE crm_proposal_approvals; DROP TABLE crm_proposal_events; DROP TABLE crm_proposal_versions; DROP TABLE crm_proposals;
     DROP TABLE crm_proposal_templates; DROP TABLE crm_settings; DROP SEQUENCE crm_proposal_number_seq;
     DELETE FROM schema_migrations WHERE version = 24;`
  );
}

// Back to v22: undo exactly what v24 and v23 (cadastros, diagnóstico, documentos) added.
async function downgradeToV22(name) {
  await downgradeToV23(name);
  await query(
    name,
    `DROP TABLE crm_files; DROP TABLE crm_diagnostics;
     ALTER TABLE crm_companies DROP COLUMN phone, DROP COLUMN email;
     ALTER TABLE crm_contacts DROP COLUMN alt_phone, DROP COLUMN potential, DROP COLUMN need;
     DELETE FROM schema_migrations WHERE version = 23;`
  );
}

// Back to v21: undo exactly what v23 and v22 (solicitações de transferência) added.
async function downgradeToV21(name) {
  await downgradeToV22(name);
  await query(name, `DROP TABLE crm_transfer_requests; DELETE FROM schema_migrations WHERE version = 22;`);
}

// Back to v20: undo exactly what v22 and v21 (funil configurável e tabulação) added.
async function downgradeToV20(name) {
  await downgradeToV21(name);
  await query(
    name,
    `DROP INDEX crm_deals_close_idx;
     ALTER TABLE crm_deals DROP COLUMN probability, DROP COLUMN won_result, DROP COLUMN close_group, DROP COLUMN closed_by, DROP COLUMN closed_by_name, DROP COLUMN return_on;
     DELETE FROM crm_options WHERE kind = 'stage' OR (kind = 'lost_reason' AND id = ANY('{${V21_REASONS.join(",")}}'));
     ${Object.entries(V9_REASON_LABELS)
       .map(([id, label]) => `UPDATE crm_options SET label = '${label}' WHERE kind = 'lost_reason' AND id = '${id}';`)
       .join("\n     ")}
     ALTER TABLE crm_options DROP COLUMN meta;
     DELETE FROM schema_migrations WHERE version = 21;`
  );
}

// Back to v19: undo exactly what v21 and v20 (ligação com o Intelligence) added.
async function downgradeToV19(name) {
  await downgradeToV20(name);
  await query(
    name,
    `DROP TABLE crm_media_syncs; DROP INDEX crm_clients_client_access_idx; ALTER TABLE crm_clients DROP COLUMN client_access_id;
     DELETE FROM schema_migrations WHERE version = 20;`
  );
}

// Back to v18: undo exactly what v20 and v19 (metas) added.
async function downgradeToV18(name) {
  await downgradeToV19(name);
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
ok((await query(B, `SELECT count(*)::int AS n FROM crm_options WHERE kind NOT IN ('task_kind', 'priority', 'stage') AND color IS NOT NULL`))[0].n === 0, "v13: other lists get no color");
// v14 (Fase 3, entrega 2): the ten automations, every one off — nothing changes until an Administrador turns one on.
// v27 adds six; the two that only take over notices the CRM already gave start on.
const autos = await query(B, `SELECT id, status FROM crm_automations ORDER BY id`);
const onByDefault = ["proposta_aprovada", "transferencia_solicitada"];
ok(
  autos.length === 16 && autos.every((r) => (r.status === "ativa") === onByDefault.includes(r.id)),
  `v14 + v27: sixteen automations, all off but the two notices (${autos.map((r) => `${r.id}:${r.status}`).join(",")})`
);
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
// v20 (Fase 7, entrega 1): no active client linked to the Intelligence, no media numbers synced.
ok(
  (await query(B, `SELECT (SELECT count(*) FROM crm_clients WHERE client_access_id IS NOT NULL) + (SELECT count(*) FROM crm_media_syncs) AS n`))[0].n === "0",
  "v20: nothing linked to the Intelligence, nothing synced"
);

// v21 (evolução v1.0): from a v20 database with closed opportunities, a reason the team renamed and one they created.
await downgradeToV20(B);
ok((await query(B, `SELECT max(version) AS v FROM schema_migrations`))[0].v === 20, "back at v20");
await query(
  B,
  `UPDATE crm_options SET label = 'Cliente sem verba' WHERE kind = 'lost_reason' AND id = 'sem_orcamento';
   INSERT INTO crm_options (kind, id, label, sort) VALUES ('lost_reason', 'faliu', 'Empresa fechou', 9);
   INSERT INTO crm_deals (id, contact_id, title, stage, won_reason, closed_at) VALUES ('d-won', 'keep-me', 'Ganho antigo', 'ganho', NULL, now());
   INSERT INTO crm_deals (id, contact_id, title, stage, lost_reason, closed_at) VALUES ('d-silent', 'keep-me', 'Sumiu', 'perdido', 'sem_resposta', now());
   INSERT INTO crm_deals (id, contact_id, title, stage, lost_reason, closed_at) VALUES ('d-custom', 'keep-me', 'Fechou as portas', 'perdido', 'faliu', now());`
);
ok(migrate(B, { VERCEL_ENV: "production" }).version === LATEST, `production upgrades v20 → v${LATEST}`);
ok((await structure(B)) === target, "…structure identical to a fresh one");
const stagesV21 = await query(B, `SELECT id, label, locked, color, meta FROM crm_options WHERE kind = 'stage' ORDER BY sort`);
ok(
  stagesV21.map((r) => `${r.id}=${r.label}:${r.meta.probability}`).join(",") ===
    "novo=Novo lead:5,conversa=Primeiro contato:10,reuniao=Em qualificação:20,diagnostico=Diagnóstico realizado:35,elaboracao=Proposta em elaboração:45,proposta=Proposta enviada:55,negociacao=Em negociação:70,aprovacao=Aguardando aprovação:85,ganho=Venda fechada:100,perdido=Venda perdida:0",
  `v21: the ten stages, old codes kept and renamed, with probabilities (${stagesV21.map((r) => r.id).join(",")})`
);
ok(stagesV21.filter((r) => r.locked).map((r) => r.id).join(",") === "novo,ganho,perdido" && stagesV21.every((r) => r.color), "v21: Novo lead, Venda fechada and Venda perdida are fixed; every stage has a color");
const reasonsV21 = Object.fromEntries((await query(B, `SELECT id, label, meta->>'group' AS g FROM crm_options WHERE kind = 'lost_reason'`)).map((r) => [r.id, r]));
ok(Object.keys(reasonsV21).length === 17, `v21: sixteen closing reasons plus the team's own (${Object.keys(reasonsV21).length})`);
ok(reasonsV21.sem_orcamento.label === "Cliente sem verba" && reasonsV21.concorrente.label === "Fechamento com concorrente", "v21: a reason the team renamed keeps its name; the others take the spec's");
ok(reasonsV21.sem_resposta.g === "sem_conversao" && reasonsV21.retornar.g === "futuro" && reasonsV21.preco.g === "negativo" && reasonsV21.faliu.g === "negativo", "v21: every reason has its tabulação group (the team's own: perda comercial)");
const closedV21 = Object.fromEntries((await query(B, `SELECT id, stage, close_group, probability, closed_by, won_result FROM crm_deals WHERE id IN ('d-won', 'd-silent', 'd-custom', 'keep-deal')`)).map((r) => [r.id, r]));
ok(closedV21["d-won"].close_group === "positivo" && closedV21["d-silent"].close_group === "sem_conversao" && closedV21["d-custom"].close_group === "negativo", "v21: closed opportunities get the group of their reason");
ok(Object.values(closedV21).every((r) => r.probability === null && r.closed_by === null && r.won_result === null), "v21: nothing invented (probability from the stage, no closer, no result)");
ok(closedV21["keep-deal"].stage === "proposta" && closedV21["keep-deal"].close_group === null, "v21: an open opportunity keeps its stage and has no tabulação");
// v22: no transfer requests until someone asks; owners unchanged.
ok((await query(B, `SELECT count(*)::int AS n FROM crm_transfer_requests`))[0].n === 0, "v22: no transfer requests yet");
ok((await query(B, `SELECT owner_id FROM crm_contacts WHERE id = 'keep-me'`))[0].owner_id === null, "v22: nobody's lead changes hands by itself");
// v23: the new cadastro fields start empty (nothing invented); no diagnoses or files yet; the limits hold.
const keepV23 = (await query(B, `SELECT alt_phone, potential, need FROM crm_contacts WHERE id = 'keep-me'`))[0];
ok(keepV23.alt_phone === null && keepV23.potential === null && keepV23.need === null, "v23: existing contacts get empty new fields");
ok((await query(B, `SELECT count(*)::int AS n FROM crm_companies WHERE phone IS NOT NULL OR email IS NOT NULL`))[0].n === 0, "v23: existing companies get no phone or e-mail invented");
ok((await query(B, `SELECT (SELECT count(*) FROM crm_diagnostics) + (SELECT count(*) FROM crm_files) AS n`))[0].n === "0", "v23: no diagnoses or files yet");
let refusedPotential = false;
try {
  await query(B, `UPDATE crm_contacts SET potential = 'enorme' WHERE id = 'keep-me'`);
} catch {
  refusedPotential = true;
}
ok(refusedPotential, "v23: potencial comercial only alto, medio or baixo");
let refusedTwoTargets = false;
try {
  await query(B, `INSERT INTO crm_companies (id, name, name_key) VALUES ('co-v23', 'Empresa v23', 'empresa v23')`);
  await query(B, `INSERT INTO crm_files (id, contact_id, company_id, name, mime, size_bytes, sha256, content) VALUES ('f2', 'keep-me', 'co-v23', 'a.txt', 'text/plain', 1, 'x', 'a'::bytea)`);
} catch {
  refusedTwoTargets = true;
}
ok(refusedTwoTargets, "v23: a file belongs to exactly one record");
let refusedBig = false;
try {
  await query(B, `INSERT INTO crm_files (id, contact_id, name, mime, size_bytes, sha256, content) VALUES ('f3', 'keep-me', 'a.txt', 'text/plain', 5000000, 'x', 'a'::bytea)`);
} catch {
  refusedBig = true;
}
ok(refusedBig, "v23: files over 4 MB are refused by the database too");
// v24: proposals start empty, numbered from 1; a status outside the list is refused.
ok((await query(B, `SELECT (SELECT count(*) FROM crm_proposals) + (SELECT count(*) FROM crm_proposal_templates) + (SELECT count(*) FROM crm_settings) AS n`))[0].n === "0", "v24: no proposals, templates or settings yet");
await query(B, `INSERT INTO crm_proposals (id, deal_id, contact_id, title, issue_date, valid_until) VALUES ('pr1', 'keep-deal', 'keep-me', 'Teste', now()::date, now()::date + 10)`);
ok((await query(B, `SELECT number FROM crm_proposals WHERE id = 'pr1'`))[0].number === 1 && (await query(B, `SELECT status FROM crm_proposals WHERE id = 'pr1'`))[0].status === "em_elaboracao", "v24: the first proposal is number 1, em elaboração");
let refusedStatus = false;
try {
  await query(B, `UPDATE crm_proposals SET status = 'fechada' WHERE id = 'pr1'`);
} catch {
  refusedStatus = true;
}
ok(refusedStatus, "v24: only the eight proposal statuses");
// v25: existing contracts numbered in creation order; the next one continues; the new tables start empty.
const db25 = "crm_schema_v25";
await freshDb(db25);
migrate(db25);
await downgradeToV24(db25);
await query(db25, `INSERT INTO crm_companies (id, name, name_key) VALUES ('co1', 'Empresa Um', 'empresa um'), ('co2', 'Empresa Dois', 'empresa dois')`);
await query(db25, `INSERT INTO crm_clients (id, company_id, status) VALUES ('cl1', 'co1', 'ativo'), ('cl2', 'co2', 'ativo')`);
await query(
  db25,
  `INSERT INTO crm_contracts (id, client_id, starts_on, value_cents, created_at) VALUES ('k-new', 'cl2', '2026-03-01', 1000, '2026-03-01'), ('k-old', 'cl1', '2025-01-01', 2000, '2025-01-01')`
);
ok(migrate(db25, { VERCEL_ENV: "production" }).version === LATEST, `production upgrades v24 → v${LATEST}`);
const nums = await query(db25, `SELECT id, number FROM crm_contracts ORDER BY number`);
ok(nums.map((r) => `${r.id}:${r.number}`).join() === "k-old:1,k-new:2", `v25: contracts numbered by creation (${nums.map((r) => `${r.id}:${r.number}`).join()})`);
await query(db25, `INSERT INTO crm_contracts (id, client_id, starts_on) VALUES ('k-3', 'cl1', '2026-11-01')`);
ok((await query(db25, `SELECT number FROM crm_contracts WHERE id = 'k-3'`))[0].number === 3, "v25: the next contract is number 3");
ok((await query(db25, `SELECT value_cents, payment_terms, renewal FROM crm_contracts WHERE id = 'k-old'`))[0].value_cents === "2000", "v25: existing contract values untouched");
ok((await query(db25, `SELECT (SELECT count(*) FROM crm_client_onboarding) + (SELECT count(*) FROM crm_client_deliverables) + (SELECT count(*) FROM crm_client_satisfaction) AS n`))[0].n === "0", "v25: no checklist, deliverables or satisfaction invented for existing clients");
let refusedScore = false;
try {
  await query(db25, `INSERT INTO crm_client_satisfaction (id, client_id, score) VALUES ('s1', 'cl1', 11)`);
} catch {
  refusedScore = true;
}
ok(refusedScore, "v25: satisfaction from 0 to 10");
// v26: a contract already cancelled takes its last update as the date it left "vigente"; vigente ones have none.
await downgradeToV25(db25);
await query(db25, `UPDATE crm_contracts SET status = 'cancelado', updated_at = '2026-06-15T12:00:00Z' WHERE id = 'k-old'`);
ok(migrate(db25, { VERCEL_ENV: "production" }).version === LATEST, `production upgrades v25 → v${LATEST}`);
const changed = await query(db25, `SELECT id, status_changed_at IS NOT NULL AS has FROM crm_contracts ORDER BY id`);
ok(changed.map((r) => `${r.id}:${r.has}`).join() === "k-3:false,k-new:false,k-old:true", "v26: only the cancelled contract gets the date (its last update)");
ok((await query(db25, `SELECT count(*)::int AS n FROM crm_commission_rules`))[0].n === 0, "v26: no commission rules invented");
// v27: the six new rules join; an Administrador's choice made before is never overridden; nothing is scheduled.
await downgradeToV26(db25);
await query(db25, `UPDATE crm_automations SET status = 'ativa', updated_by = NULL WHERE id = 'novo_lead'`);
await query(db25, `INSERT INTO crm_automations (id, status, updated_by) VALUES ('proposta_aprovada', 'desativada', NULL)`);
await query(db25, `INSERT INTO internal_users (id, name, email, username, role, password_hash) VALUES ('u-adm', 'Adm', 'adm@x.com', 'adm', 'administrador_geral', 'x')`);
await query(db25, `UPDATE crm_automations SET updated_by = 'u-adm' WHERE id = 'proposta_aprovada'`);
ok(migrate(db25, { VERCEL_ENV: "production" }).version === LATEST, `production upgrades v26 → v${LATEST}`);
const v27 = Object.fromEntries((await query(db25, `SELECT id, status FROM crm_automations`)).map((r) => [r.id, r.status]));
ok(Object.keys(v27).length === 16, "v27: sixteen rules");
ok(v27.transferencia_solicitada === "ativa" && v27.proposta_aprovada === "desativada", "v27: the transfer notice starts on; the approval one an Administrador had turned off stays off");
ok(v27.novo_lead === "ativa" && v27.proposta_vencendo === "desativada" && v27.oportunidade_sem_responsavel === "desativada", "v27: existing choices kept; the other new rules start off");
ok((await query(db25, `SELECT count(*)::int AS n FROM crm_scheduled_messages`))[0].n === 0, "v27: no scheduled messages");
let refusedKind = false;
try {
  await query(db25, `INSERT INTO crm_scheduled_messages (id, contact_id, kind, body, send_at) VALUES ('m1', 'nao-existe', 'audio', 'x', now())`);
} catch {
  refusedKind = true;
}
ok(refusedKind, "v27: a scheduled message is a text or a template, of an existing contact");
await admin(`DROP DATABASE IF EXISTS ${db25} WITH (FORCE)`);

await admin(`DROP DATABASE IF EXISTS ${A} WITH (FORCE)`);
await admin(`DROP DATABASE IF EXISTS ${B} WITH (FORCE)`);
console.log("SCHEMA PASSED");
