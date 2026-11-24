// Fase 3 · entrega 2 through the API, on base + campaign fixtures: who may
// touch automations; off = nothing happens; each rule (1 novo lead, 2 lead
// atribuído, 3 sem movimentação, 4 reunião, 5 proposta, 6 sem resposta,
// 10 resposta de campanha) does its job once and only once; a failure is
// recorded and never breaks what the person did; pause; the daily check
// (Rodar agora and the CRON_SECRET-protected endpoint); notices in the bell;
// history and audit trail. Automations never send WhatsApp messages.
import { BASE, closeDb, fakeGraphSent, inbound, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const CRON_TEST_SECRET = "test-only-cron-secret"; // tests/run.sh starts this suite's server with it
const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial

const spDay = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const set = (id, data) => admin.patch(`${BASE}/api/crm/automations/${id}/`, { data });
const runNow = (api, id) => api.post(`${BASE}/api/crm/automations/run/`, { data: id ? { id } : {} });
const newContact = async (data) => (await json(await vitor.post(`${BASE}/api/crm/contacts/`, { data }))).body.id;
const autoTasks = (contactId) => sql(`SELECT count(*) FROM crm_tasks WHERE contact_id = $1 AND created_by_name = 'Automação'`, [contactId]);
const runs = (automation, status = "ok") => sql(`SELECT count(*) FROM crm_automation_runs WHERE automation_id = $1 AND status = $2`, [automation, status]);
const bell = async (api) => (await json(await api.get(`${BASE}/api/crm/reminders/`))).body.notifications;
const sentBefore = fakeGraphSent().length;

// ---- who, and the starting point ----
ok((await vitor.get(`${BASE}/api/crm/automations/`)).status() === 403, "only the Administrador sees the automations");
ok((await vitor.patch(`${BASE}/api/crm/automations/novo_lead/`, { data: { status: "ativa" } })).status() === 403, "…or changes them");
let r = await json(await admin.get(`${BASE}/api/crm/automations/`));
ok(r.body.automations.length === 16, "sixteen automations (the ten of Fase 3 + six of the evolução)");
ok(
  r.body.automations.filter((a) => a.status === "ativa").map((a) => a.id).sort().join() === "proposta_aprovada,transferencia_solicitada",
  "all off, except the two that only give the notices the CRM already gave (transfer requested, proposal approved)"
);
ok(r.body.schedule.configured === true, "the daily check is set up (this server has a test CRON_SECRET)");
ok(r.body.automations.find((a) => a.id === "proposta_enviada").config.dueDays === 3, "defaults filled in (follow-up in 3 days)");

// ---- off: nothing happens ----
const off = await newContact({ name: "Lead Sem Automação", phone: "15990001001", ownerId: "u-joao" });
ok((await autoTasks(off)) === "0" && (await sql(`SELECT count(*) FROM crm_automation_runs`)) === "0", "with everything off, a new lead gets no task and nothing runs");

// ---- validation ----
ok((await set("cliente_sem_atualizacao", { config: { dayOfMonth: 31 } })).status() === 400, "dia do mês out of range refused (1–28)");
ok((await set("proposta_enviada", { config: { dueDays: 99 } })).status() === 400, "prazo out of range refused");
ok((await set("proposta_enviada", { config: { owner: "u-ninguem" } })).status() === 400, "unknown responsável refused");
ok((await set("proposta_enviada", { config: { taskKind: "nao_existe" } })).status() === 400, "unknown task type refused");
ok((await set("proposta_enviada", { status: "ligada" })).status() === 400, "unknown situação refused");

// ---- 1. novo lead ----
r = await json(await set("novo_lead", { status: "ativa", config: { dueDays: 1, fallbackOwnerId: "u-vitor", ignored: "x" } }));
ok(r.status === 200 && r.body.automation.status === "ativa" && r.body.automation.config.dueDays === 1 && r.body.automation.config.ignored === undefined, "turned on with a 1-day deadline");
ok((await sql(`SELECT metadata->>'to' FROM audit_log WHERE action = 'crm.automation_change' AND target_id = 'novo_lead'`)) === "ativa", "…in the audit trail");
const lia = await newContact({ name: "Lia Nova", phone: "15990001002", ownerId: "u-joao", source: "indicacao" });
const liaTask = JSON.parse(
  await sql(
    `SELECT row_to_json(x)::text FROM (SELECT kind, title, priority, owner_id, deal_id IS NOT NULL AS has_deal, to_char(due_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS due
     FROM crm_tasks WHERE contact_id = $1 AND created_by_name = 'Automação') x`,
    [lia]
  )
);
ok(
  liaTask.kind === "primeiro_contato" && liaTask.title === "Primeiro contato" && liaTask.priority === "alta" && liaTask.owner_id === "u-joao" && liaTask.has_deal && liaTask.due === spDay(Date.now() + 86_400_000),
  "new lead: first-contact task for its owner, on its opportunity, due tomorrow"
);
ok((await sql(`SELECT user_name FROM crm_task_events WHERE task_id = (SELECT id FROM crm_tasks WHERE contact_id = $1 AND created_by_name = 'Automação')`, [lia])) === "Automação", "the task's history says the automation did it");
ok((await runs("novo_lead")) === "1" && (await sql(`SELECT contact_id FROM crm_automation_runs WHERE automation_id = 'novo_lead'`)) === lia, "one run recorded, with the lead");
ok((await inbound("5515990001003", "Oi, quero saber mais", "Rui Whats")) === 200, "a new number writes on WhatsApp");
const rui = await sql(`SELECT id FROM crm_contacts WHERE phone = '5515990001003'`);
ok((await sql(`SELECT owner_id FROM crm_tasks WHERE contact_id = $1 AND created_by_name = 'Automação'`, [rui])) === "u-vitor", "…WhatsApp lead with no owner: the task goes to the chosen fallback (Vitor)");
await set("novo_lead", { config: { sources: ["bni"] } });
ok((await autoTasks(await newContact({ name: "Do Site", phone: "15990001004", source: "site" }))) === "0", "condition: only the chosen origins (site isn't one)");
ok((await autoTasks(await newContact({ name: "Do BNI", phone: "15990001005", source: "bni" }))) === "1", "…BNI is");
await set("novo_lead", { config: { sources: [] } });

// a failure is recorded and never breaks the person's action
await admin.patch(`${BASE}/api/crm/catalog/options/task_kind/primeiro_contato/`, { data: { archived: true } });
r = await json(await vitor.post(`${BASE}/api/crm/contacts/`, { data: { name: "Lead Com Falha", phone: "15990001006" } }));
ok(r.status === 201, "with the task type archived, the lead is still created");
ok((await autoTasks(r.body.id)) === "0" && /arquivada/.test(await sql(`SELECT detail FROM crm_automation_runs WHERE automation_id = 'novo_lead' AND status = 'falha'`)), "…and the automation's failure is in its history, with why");
await admin.patch(`${BASE}/api/crm/catalog/options/task_kind/primeiro_contato/`, { data: { archived: false } });

// ---- 2. lead atribuído ----
await set("lead_atribuido", { status: "ativa" });
await vitor.patch(`${BASE}/api/crm/contacts/c5/`, { data: { ownerId: "u-joao" } });
let notices = await bell(joao);
ok(notices.some((n) => n.title === "Novo lead para você: Eva Prado" && n.body === "Atribuído por Vitor." && n.contactId === "c5"), "the new owner gets a notice in the bell");
ok(!(await bell(vitor)).some((n) => n.title.includes("Eva Prado")), "…only the new owner");
const unowned = await newContact({ name: "Sem Dono", phone: "15990001007" });
ok((await json(await joao.patch(`${BASE}/api/crm/contacts/${unowned}/`, { data: { ownerId: "u-joao" } }))).status === 200, "João takes a lead with no owner");
ok(!(await bell(joao)).some((n) => n.title.includes("Sem Dono")), "nobody is told about a lead they gave themselves");
await vitor.post(`${BASE}/api/crm/contacts/assign/`, { data: { ids: ["c1", "c4"], ownerId: "u-joao" } });
notices = await bell(joao);
ok(notices.some((n) => n.title === "2 leads atribuídos a você"), "bulk change: one notice per person");
r = await json(await vitor.post(`${BASE}/api/crm/notifications/`, { data: { ids: notices.map((n) => n.id) } }));
ok(r.body.read === 0 && (await bell(joao)).length === notices.length, "nobody marks someone else's notices as read");
ok((await json(await joao.post(`${BASE}/api/crm/notifications/`, { data: { ids: "all" } }))).body.read === notices.length && (await bell(joao)).length === 0, "the owner marks them read");
await vitor.post(`${BASE}/api/crm/contacts/assign/`, { data: { ids: ["c1", "c4"], ownerId: "u-vitor" } });

// ---- 5. proposta enviada ----
await set("proposta_enviada", { status: "ativa", config: { dueDays: 2 } });
const service = (await json(await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label: "Gestão de tráfego" } }))).body.option.id;
ok((await json(await vitor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "proposta", service } }))).status === 200, "an opportunity goes to Proposta enviada");
const followUps = () => sql(`SELECT count(*) FROM crm_tasks WHERE deal_id = 'd6' AND kind = 'follow_up' AND created_by_name = 'Automação'`);
ok((await followUps()) === "1", "…a follow-up task on it");
ok((await sql(`SELECT to_char(due_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') || ' ' || owner_id FROM crm_tasks WHERE deal_id = 'd6' AND kind = 'follow_up'`)) === `${spDay(Date.now() + 2 * 86_400_000)} u-vitor`, "…in 2 days, for the opportunity's owner");
await vitor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "reuniao" } });
await vitor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "proposta" } });
ok((await followUps()) === "1", "back and forth while the follow-up is pending: no second one");
await vitor.patch(`${BASE}/api/crm/tasks/${await sql(`SELECT id FROM crm_tasks WHERE deal_id = 'd6' AND kind = 'follow_up'`)}/`, { data: { status: "concluida" } });
await vitor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "reuniao" } });
await vitor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "proposta" } });
ok((await followUps()) === "2", "after it was done, a new proposal gets a new follow-up");

// ---- 4. reunião agendada ----
await set("reuniao_agendada", { status: "ativa" });
const tomorrow = spDay(Date.now() + 86_400_000);
const meeting = (data) => vitor.post(`${BASE}/api/crm/tasks/`, { data: { contactId: "c1", kind: "reuniao", title: "Reunião", dueDate: tomorrow, ...data } }).then(json);
const m1 = (await meeting({ dueTime: "10:00" })).body.id;
ok((await sql(`SELECT remind_minutes || ' ' || to_char(remind_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') FROM crm_tasks WHERE id = $1`, [m1])) === "60 09:00", "a meeting without a reminder gets one, 1 hour before");
ok((await sql(`SELECT user_name || ':' || (payload->'fields'->>0) FROM crm_task_events WHERE task_id = $1 AND action = 'edited'`, [m1])) === "Automação:lembrete", "…in the task's history");
const m2 = (await meeting({ dueTime: "11:00", reminder: 15 })).body.id;
ok((await sql(`SELECT remind_minutes FROM crm_tasks WHERE id = $1`, [m2])) === "15", "a reminder someone chose is kept");
const m3 = (await meeting({})).body.id;
ok((await sql(`SELECT remind_minutes || ' ' || to_char(remind_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') FROM crm_tasks WHERE id = $1`, [m3])) === "0 08:00", "an all-day meeting: 08:00 that day");
const call = (await json(await vitor.post(`${BASE}/api/crm/tasks/`, { data: { contactId: "c1", kind: "ligacao", title: "Ligar", dueDate: tomorrow, dueTime: "10:00" } }))).body.id;
ok((await sql(`SELECT COALESCE(remind_minutes::text, 'none') FROM crm_tasks WHERE id = $1`, [call])) === "none", "other task types are left alone");

// ---- 3. lead sem movimentação (daily check) ----
ok((await runNow(vitor, "lead_sem_movimentacao")).status() === 403, "only the Administrador runs the check");
ok((await runNow(admin, "novo_lead")).status() === 400, "only daily-check rules run on demand");
r = await json(await runNow(admin, "lead_sem_movimentacao"));
ok(r.status === 200 && Object.keys(r.body.results).length === 0, "a rule that's off doesn't run");
await set("lead_sem_movimentacao", { status: "ativa", config: { days: 7 } });
r = await json(await runNow(admin, "lead_sem_movimentacao"));
ok(r.body.results.lead_sem_movimentacao.ok >= 1, `stalled opportunities alerted (${JSON.stringify(r.body.results)})`);
ok((await bell(joao)).some((n) => n.title === "Lead parado: Carla Dias" && /Proposta enviada desde 20\/10\/2026/.test(n.body)), "João is alerted about Carla (in Proposta since 20/10)");
ok(!(await sql(`SELECT string_agg(detail, '|') FROM crm_automation_runs WHERE automation_id = 'lead_sem_movimentacao'`)).includes("d6"), "an opportunity that just moved isn't stalled");
r = await json(await runNow(admin, "lead_sem_movimentacao"));
ok(r.body.results.lead_sem_movimentacao.ok === 0, "the next check doesn't alert the same stall again");
ok((await sql(`SELECT last_run_at IS NOT NULL FROM crm_automations WHERE id = 'lead_sem_movimentacao'`)) === "t", "last check time kept");

// ---- 10. resposta de campanha ----
await set("resposta_campanha", { status: "ativa" });
await sql(`INSERT INTO crm_campaigns (id, name, status) VALUES ('k-auto', 'Black Friday', 'concluida')`);
await sql(`INSERT INTO crm_campaign_recipients (campaign_id, contact_id, status, sent_at) VALUES ('k-auto', 'c2', 'enviada', now() - interval '1 hour'), ('k-auto', 'c3', 'enviada', now() - interval '1 hour')`);
await sql(`UPDATE crm_contacts SET temperature = 'frio' WHERE id = 'c2'`);
ok((await inbound("5515990000002", "Tenho interesse, me liga", "Bruno")) === 200, "Bruno answers the campaign");
ok((await sql(`SELECT temperature FROM crm_contacts WHERE id = 'c2'`)) === "quente", "…marked quente");
ok(/Respondeu à campanha "Black Friday" · temperatura: Frio → Quente/.test(await sql(`SELECT payload->>'text' FROM crm_events WHERE contact_id = 'c2' AND kind = 'automation'`)), "…the reply is in his history");
ok((await bell(joao)).some((n) => n.title === "Bruno Souza respondeu à campanha" && n.body === "Black Friday"), "…and his owner gets a notice");
await inbound("5515990000002", "Pode ser amanhã?", "Bruno");
ok((await runs("resposta_campanha")) === "1", "a second message to the same campaign changes nothing");
await inbound("5515990000003", "SAIR", "Carla");
ok((await sql(`SELECT COALESCE(temperature, 'none') FROM crm_contacts WHERE id = 'c3'`)) !== "quente" && (await runs("resposta_campanha")) === "1", "\"SAIR\" is not interest");

// ---- 6. lead sem resposta ----
await sql(`INSERT INTO crm_contacts (id, name, phone, owner_id, source) VALUES ('c-silent', 'Silvio Quieto', '5515990001010', 'u-vitor', 'site'), ('c-blast', 'Bia Campanha', '5515990001011', 'u-vitor', 'site')`);
await sql(`INSERT INTO crm_deals (id, contact_id, title, stage, owner_id) VALUES ('d-silent', 'c-silent', 'Silvio', 'conversa', 'u-vitor'), ('d-blast', 'c-blast', 'Bia', 'conversa', 'u-vitor')`);
await sql(
  `INSERT INTO crm_messages (id, contact_id, direction, type, body, status, created_at, campaign_id) VALUES
   ('m-s1', 'c-silent', 'in', 'text', 'Oi', 'received', now() - interval '6 days', NULL),
   ('m-s2', 'c-silent', 'out', 'text', 'Segue a proposta', 'sent', now() - interval '5 days', NULL),
   ('m-b1', 'c-blast', 'out', 'template', 'Promoção', 'sent', now() - interval '5 days', 'k-auto')`
);
await set("lead_sem_resposta", { status: "ativa" });
r = await json(await runNow(admin, "lead_sem_resposta"));
ok(r.body.results.lead_sem_resposta.ok >= 1, `unanswered leads get a task (${JSON.stringify(r.body.results)})`);
ok((await sql(`SELECT title || ' ' || owner_id || ' ' || deal_id FROM crm_tasks WHERE contact_id = 'c-silent' AND created_by_name = 'Automação'`)) === "Retomar contato (sem resposta) u-vitor d-silent", "Silvio (our message 5 days ago, no answer) → follow-up for Vitor");
ok((await autoTasks("c-blast")) === "0", "a campaign nobody answered doesn't count");
r = await json(await runNow(admin, "lead_sem_resposta"));
ok(r.body.results.lead_sem_resposta.ok === 0 && (await autoTasks("c-silent")) === "1", "the next check doesn't repeat it");

// pause
await set("lead_sem_resposta", { status: "pausada" });
await sql(`INSERT INTO crm_messages (id, contact_id, direction, type, body, status, created_at) VALUES ('m-s3', 'c-blast', 'out', 'text', 'E aí?', 'sent', now() - interval '4 days')`);
r = await json(await runNow(admin));
ok(r.body.results.lead_sem_resposta === undefined && (await autoTasks("c-blast")) === "0", "a paused rule doesn't run");

// the scheduler's endpoint
ok((await fetch(`${BASE}/api/cron/automations/`)).status === 401, "the daily-check endpoint refuses a call without the secret");
ok((await fetch(`${BASE}/api/cron/automations/`, { headers: { Authorization: "Bearer errado" } })).status === 401, "…or with the wrong one");
await set("lead_sem_resposta", { status: "ativa" });
const cron = await fetch(`${BASE}/api/cron/automations/`, { headers: { Authorization: `Bearer ${CRON_TEST_SECRET}` } });
const cronBody = await cron.json();
ok(cron.status === 200 && cronBody.results.lead_sem_resposta.ok >= 1 && (await autoTasks("c-blast")) === "1", "with the secret it runs every active daily rule (Bia, our own message 4 days ago)");

// ---- history, audit, and no messages sent ----
let page = (await json(await admin.get(`${BASE}/api/crm/automations/runs/?automation=novo_lead`))).body;
ok(page.rows.length >= 4 && page.rows.every((x) => x.automationId === "novo_lead"), "history by automation");
page = (await json(await admin.get(`${BASE}/api/crm/automations/runs/?status=falha`))).body;
ok(page.total === 1 && page.rows[0].contactName === "Lead Com Falha", "history: failures");
ok((await vitor.get(`${BASE}/api/crm/automations/runs/`)).status() === 403, "history is Administrador only");
ok(Number(await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.automation_run'`)) >= 4, "each Rodar agora in the audit trail");
// The only message sent in this suite is the opt-out confirmation the WhatsApp webhook itself sends to Carla's "SAIR".
const sent = fakeGraphSent().slice(sentBefore);
ok(sent.length === 1 && JSON.stringify(sent[0]).includes("5515990000003"), `no automation sent a WhatsApp message (only the "SAIR" confirmation: ${sent.length})`);

await closeDb();
await browser.close();
console.log("AUTOMATIONS API PASSED");
