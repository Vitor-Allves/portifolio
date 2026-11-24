// Evolução v1.0 · automações 11–16 (item 7) through the API, on base +
// campaign fixtures, with dates relative to today: proposal close to its
// validity, return date, diagnosis, opportunity without an owner (daily
// check, run on demand); transfer requested and proposal approved (events,
// on from the start, as they only give the notices the CRM already gave —
// the approval task is an option); every one once (dedupe), adjustable,
// can be turned off.
import { request } from "playwright";
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const set = (id, data) => admin.patch(`${BASE}/api/crm/automations/${id}/`, { data }).then(json);
const runNow = (id) => admin.post(`${BASE}/api/crm/automations/run/`, { data: { id } }).then(json);
const notices = async (userId, kind, like = "%") =>
  Number(await sql(`SELECT count(*) FROM crm_notifications WHERE user_id = $1 AND kind = $2 AND title LIKE $3`, [userId, kind, like]));
const tasks = async (contactId, title) =>
  Number(await sql(`SELECT count(*) FROM crm_tasks WHERE contact_id = $1 AND title = $2 AND created_by_name = 'Automação'`, [contactId, title]));
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const addDays = (d, n) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

// ---- the rules ----
let r = await json(await admin.get(`${BASE}/api/crm/automations/`));
const byId = Object.fromEntries(r.body.automations.map((a) => [a.id, a]));
const NEW = ["proposta_vencendo", "retorno_agendado", "diagnostico_realizado", "oportunidade_sem_responsavel", "transferencia_solicitada", "proposta_aprovada"];
ok(r.body.automations.length === 16 && NEW.every((id) => byId[id]), "the six rules of the evolução join the ten");
ok(
  byId.transferencia_solicitada.status === "ativa" &&
    byId.proposta_aprovada.status === "ativa" &&
    NEW.slice(0, 4).every((id) => byId[id].status === "desativada"),
  "the two notices start on; the other four off",
);
ok(
  byId.proposta_aprovada.config.createTask === false && byId.proposta_aprovada.config.notifyManagers === true,
  "the approval: notices as before, the task is an option",
);
ok((await set("proposta_vencendo", { config: { days: 0 } })).status === 400, "days 1–90");
ok((await set("proposta_aprovada", { config: { createTask: "sim" } })).status === 400, "an option is yes or no");
ok((await joao.patch(`${BASE}/api/crm/automations/proposta_vencendo/`, { data: { status: "ativa" } })).status() === 403, "only the Administrador changes them");

// ---- 11. proposal close to its validity ----
const trafego = (
  await json(await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label: "Gestão de tráfego", meta: { billing: "mensal" } } }))
).body.option.id;
const P = `${BASE}/api/crm/proposals/`;
const p1 = (await json(await joao.post(P, { data: { dealId: "d3" } }))).body.id;
await json(await joao.patch(`${P}${p1}/`, { data: { items: [{ serviceId: trafego, unitValue: "2.000" }], validUntil: addDays(today, 2) } }));
const token = (await json(await joao.post(`${P}${p1}/send/`, { data: { channel: "email" } }))).body.token;
ok(typeof token === "string", "João sends Carla a proposal valid for two more days");
ok((await runNow("proposta_vencendo")).body.results.proposta_vencendo === undefined, "off: the daily check skips it");
ok((await set("proposta_vencendo", { status: "ativa", config: { days: 3 } })).status === 200, "turned on (3 days before)");
r = await runNow("proposta_vencendo");
ok(
  r.body.results.proposta_vencendo.ok === 1 && (await notices("u-joao", "alerta", "Proposta nº 0001 vence em 2 dias")) === 1,
  "João is told it ends in 2 days",
);
ok((await runNow("proposta_vencendo")).body.results.proposta_vencendo.ok === 0 && (await notices("u-joao", "alerta")) === 1, "once per validity date");

// ---- 12. return date ----
await json(await joao.patch(`${BASE}/api/crm/contacts/c2/`, { data: { returnAt: today } })); // Bruno: no pending task
await json(await joao.patch(`${BASE}/api/crm/contacts/c3/`, { data: { returnAt: today } })); // Carla: has a pending task (t4)
ok((await set("retorno_agendado", { status: "ativa", config: { days: 1 } })).status === 200, "turned on (on the day)");
r = await runNow("retorno_agendado");
const RET = "Retornar o contato (data combinada)";
ok(
  r.body.results.retorno_agendado.ok === 1 && (await tasks("c2", RET)) === 1 && (await tasks("c3", RET)) === 0,
  "Bruno's return becomes a task; Carla already has one pending",
);
ok(
  (await sql(`SELECT owner_id || '|' || (due_at AT TIME ZONE 'America/Sao_Paulo')::date FROM crm_tasks WHERE contact_id = 'c2' AND title = $1`, [RET])) ===
    `u-joao|${today}`,
  "…João's, for today",
);
await runNow("retorno_agendado");
ok((await tasks("c2", RET)) === 1, "once per return date");

// ---- 13. diagnosis ----
ok((await set("diagnostico_realizado", { status: "ativa", config: { dueDays: 2 } })).status === 200, "turned on");
const diag = `${BASE}/api/crm/contacts/c2/diagnoses/`;
ok((await json(await joao.post(diag, { data: { need: "Captar pacientes de implante" } }))).status === 201, "João saves Bruno's diagnosis");
ok((await tasks("c2", "Preparar a proposta")) === 1, "the next step becomes a task");
ok(
  (await sql(`SELECT (due_at AT TIME ZONE 'America/Sao_Paulo')::date::text FROM crm_tasks WHERE contact_id = 'c2' AND title = 'Preparar a proposta'`)) ===
    addDays(today, 2),
  "…in 2 days",
);
await json(await joao.post(diag, { data: { need: "Captar pacientes de implante e lentes" } }));
ok((await tasks("c2", "Preparar a proposta")) === 1, "a new version while it's pending: no second task");

// ---- 14. opportunity without an owner ----
await sql(
  `INSERT INTO crm_contacts (id, name, phone, source, stage, created_at) VALUES ('c-solto', 'Lead Solto', '5515990009001', 'anuncio', 'novo', now() - interval '3 days')`,
);
await sql(
  `INSERT INTO crm_deals (id, contact_id, title, stage, created_at, updated_at) VALUES ('d-solto', 'c-solto', 'Tráfego', 'novo', now() - interval '3 days', now())`,
);
ok((await set("oportunidade_sem_responsavel", { status: "ativa", config: { days: 2 } })).status === 200, "turned on (2 days)");
r = await runNow("oportunidade_sem_responsavel");
ok(
  r.body.results.oportunidade_sem_responsavel.ok === 2 &&
    (await notices("u-admin", "alerta", "Oportunidade sem responsável: Lead Solto")) === 1 &&
    (await notices("u-vitor", "alerta", "Oportunidade sem responsável: Lead Solto")) === 1 &&
    (await notices("u-joao", "alerta", "Oportunidade sem responsável%")) === 0,
  "the Gestor and the Administrador are told (this one and Eva's, unowned in the fixtures)",
);
await runNow("oportunidade_sem_responsavel");
ok((await notices("u-admin", "alerta", "Oportunidade sem responsável%")) === 2, "once per opportunity");

// ---- 15. transfer requested ----
r = await json(await joao.post(`${BASE}/api/crm/transfers/`, { data: { contactId: "c1", reason: "A Ana me procurou direto" } }));
ok(
  r.status === 201 && (await notices("u-vitor", "transferencia")) === 1 && (await notices("u-admin", "transferencia")) === 1,
  "on from the start: whoever approves is told",
);
ok(
  (await sql(`SELECT count(*) FROM crm_automation_runs WHERE automation_id = 'transferencia_solicitada' AND status = 'ok'`)) === "1",
  "…recorded in the rule's history",
);
ok((await set("transferencia_solicitada", { status: "desativada" })).status === 200, "an Administrador turns it off");
await json(await joao.delete(`${BASE}/api/crm/transfers/${r.body.transfer.id}/`));
r = await json(await joao.post(`${BASE}/api/crm/transfers/`, { data: { contactId: "c1", reason: "De novo, a Ana me procurou" } }));
ok(r.status === 201 && (await notices("u-vitor", "transferencia")) === 1, "off: the request is made, nobody is told");

// ---- 16. proposal approved ----
const anon = await request.newContext();
await anon.post(`${BASE}/api/proposta/${token}/decision/`, {
  data: { decision: "aprovar", name: "Carla Dias", email: "carla@x.com", accept: true, version: 1 },
});
ok((await notices("u-joao", "proposta", "Proposta nº 0001 aprovada")) === 1, "Carla approves online: João is told");
ok(
  (await notices("u-vitor", "proposta", "Proposta nº 0001 aprovada")) === 1 && (await notices("u-admin", "proposta", "Proposta nº 0001 aprovada")) === 1,
  "…and the Gestores",
);
ok((await tasks("c3", "Formalizar o contrato da proposta aprovada")) === 0, "no task, as it comes");
ok(
  (await set("proposta_aprovada", { config: { createTask: true, notifyManagers: false } })).status === 200,
  "the Administrador adds the task, without the Gestores",
);
const dealId = (await json(await joao.post(`${BASE}/api/crm/deals/`, { data: { contactId: "c2", title: "Lentes" } }))).body.id;
const p2 = (await json(await joao.post(P, { data: { dealId } }))).body.id;
await json(await joao.patch(`${P}${p2}/`, { data: { items: [{ serviceId: trafego, unitValue: "1.500" }] } }));
await json(await joao.post(`${P}${p2}/send/`, { data: { channel: "whatsapp" } }));
r = await json(await joao.post(`${P}${p2}/status/`, { data: { action: "aprovar", reason: "Aprovou por e-mail hoje", approverName: "Bruno" } }));
ok(r.status === 200, `João records Bruno's approval (${r.body?.error ?? ""})`);
ok(
  (await notices("u-joao", "proposta", "Proposta nº 0002 aprovada")) === 1 && (await notices("u-vitor", "proposta", "Proposta nº 0002 aprovada")) === 0,
  "João is told; the Gestores no more",
);
ok((await tasks("c2", "Formalizar o contrato da proposta aprovada")) === 1, "…and the formalization task is there");
ok(
  (await sql(`SELECT priority || '|' || owner_id FROM crm_tasks WHERE contact_id = 'c2' AND title = 'Formalizar o contrato da proposta aprovada'`)) ===
    "alta|u-joao",
  "high priority, João's",
);
await anon.dispose();

// ---- the Painel and the productivity count the approvals (item 12) ----
const month = `from=${today.slice(0, 7)}-01&to=${today}`;
const dash = (await json(await admin.get(`${BASE}/api/crm/dashboard/?${month}`))).body.dashboard;
ok(dash.current.proposalsApproved === 2, `the Painel counts the 2 approved proposals (${dash.current.proposalsApproved})`);
const ap = (await json(await admin.get(`${BASE}/api/crm/dashboard/records/?${month}&metric=approved`))).body;
ok(ap.total === 2 && ap.rows.every((x) => x.kind === "deal" && /^Proposta nº 000[12] · /.test(x.title)), "…and lists them, each opening its opportunity");
const prod = (await json(await admin.get(`${BASE}/api/crm/productivity/?${month}`))).body.productivity;
ok(prod.rows.find((x) => x.name === "João").proposalsApproved === 2, "João's productivity: 2 approved");

// ---- audit of the changes ----
ok(
  Number(await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.automation_change' AND target_id = ANY($1)`, [NEW])) >= 6,
  "every change to the rules audited",
);

await browser.close();
await closeDb();
console.log("AUTOMATIONS EV API PASSED");
