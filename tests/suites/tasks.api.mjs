// Fase 3 · entrega 1 through the API, on base + campaign fixtures: tasks
// with description, priority, situação, reminder and their own history;
// tasks on a company only and internal activities (no contact); who sees
// which task; the agenda window and its filters; the reminders bell;
// colors and priorities in Personalização.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial

const spDay = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const today = spDay(Date.now());
const tomorrow = spDay(Date.now() + 86_400_000);
const create = (api, data) => api.post(`${BASE}/api/crm/tasks/`, { data });
const patch = (api, id, data) => api.patch(`${BASE}/api/crm/tasks/${id}/`, { data });
const list = async (api, q) => (await json(await api.get(`${BASE}/api/crm/tasks/?${q}`))).body.tasks;
/** One row as an object (sql() returns text). */
const rowOf = async (q, params) => JSON.parse(await sql(`SELECT row_to_json(x)::text FROM (${q}) x`, params));

// ---- an internal activity: no contact, no company ----
let r = await json(
  await create(vitor, {
    kind: "atividade_interna",
    title: "Pauta da reunião semanal",
    description: "Revisar o funil e as metas",
    priority: "alta",
    dueDate: tomorrow,
    dueTime: "09:00",
    reminder: 15,
  })
);
ok(r.status === 201, "internal activity created (no contact, no company)");
const internal = r.body.id;
const row = await rowOf(
  `SELECT contact_id, company_id, status, priority, description, remind_minutes,
          to_char(remind_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS remind FROM crm_tasks WHERE id = $1`,
  [internal]
);
ok(
  row.contact_id === null && row.company_id === null && row.status === "pendente" && row.priority === "alta" && row.description === "Revisar o funil e as metas",
  "stored with its priority, description and situação"
);
ok(row.remind_minutes === 15 && row.remind === `${tomorrow} 08:45`, `reminder 15 minutes before (${row.remind})`);
let detail = (await json(await vitor.get(`${BASE}/api/crm/tasks/${internal}/`))).body;
ok(detail.task.contactId === null && detail.events.map((e) => e.action).join() === "created" && detail.events[0].userName === "Vitor", "its own history starts with who created it");

// ---- reminders that don't fit ----
ok((await create(vitor, { title: "x", dueDate: tomorrow, reminder: 15 })).status() === 400, "all-day task: 15 minutes before isn't a choice");
ok((await create(vitor, { title: "x", reminder: 0 })).status() === 400, "a reminder needs a date");
r = await json(await create(vitor, { title: "Véspera", dueDate: tomorrow, reminder: 1440 }));
ok((await sql(`SELECT to_char(remind_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') FROM crm_tasks WHERE id = $1`, [r.body.id])) === `${today} 08:00`, "all-day task: the day before at 08:00");
ok((await create(vitor, { title: "x", priority: "urgentissima" })).status() === 400, "unknown priority refused");
ok((await create(vitor, { title: "x", dealId: "d6" })).status() === 400, "an opportunity needs its contact");

// ---- a task on a company only ----
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-v', 'Clínica do Vitor', 'clinica do vitor', 'u-vitor'), ('co-free', 'Empresa Livre', 'empresa livre', NULL)`);
await sql(`UPDATE crm_contacts SET company_id = 'co-v' WHERE id = 'c1'`);
r = await json(await create(vitor, { companyId: "co-v", kind: "follow_up", title: "Retomar contato com a clínica", dueDate: today }));
ok(r.status === 201 && (await sql(`SELECT company_id FROM crm_tasks WHERE id = $1`, [r.body.id])) === "co-v", "task on a company only");
const companyTask = r.body.id;
ok((await create(joao, { companyId: "co-v", title: "x" })).status() === 403, "Comercial can't put a task on a company in someone else's carteira");
r = await json(await create(joao, { companyId: "co-free", title: "Apresentar a Legado", dueDate: today }));
ok(r.status === 201, "…but can on a company with no owner");
const joaoCompanyTask = r.body.id;

// ---- on a contact: history on the contact too ----
r = await json(await create(vitor, { contactId: "c1", dealId: "d6", kind: "reuniao", title: "Reunião de diagnóstico", dueDate: tomorrow, dueTime: "15:00", priority: "baixa" }));
ok(r.status === 201, "task on a contact and one of its opportunities");
const meeting = r.body.id;
ok((await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c1' AND kind = 'task' AND payload->>'taskId' = $1`, [meeting])) === "1", "…in the contact's history");

// ---- who sees what ----
let ids = (await list(joao, "status=any")).map((t) => t.id);
ok([internal, companyTask, meeting, joaoCompanyTask].every((id) => ids.includes(id)), "evolução v1.0: the Comercial sees the team's tasks too");
ok((await joao.get(`${BASE}/api/crm/tasks/${internal}/`)).status() === 200, "…and opens them");
ok((await json(await joao.patch(`${BASE}/api/crm/tasks/${meeting}/`, { data: { status: "concluida" } }))).status === 403, "…but can't finish someone else's task on someone else's lead");
ids = (await list(admin, "status=any")).map((t) => t.id);
ok([internal, companyTask, meeting, joaoCompanyTask].every((id) => ids.includes(id)), "Administrador sees all of them");
const unowned = (await json(await create(vitor, { title: "Arrumar o material de apresentação", ownerId: "" }))).body.id;
ok((await list(joao, "status=pending")).some((t) => t.id === unowned), "an internal activity with no owner is visible to everyone");

// ---- agenda window and filters ----
const win = (d) => `from=${new Date(`${d}T00:00:00-03:00`).toISOString()}&to=${new Date(`${d}T23:59:59-03:00`).toISOString()}`;
let agenda = await list(vitor, `status=any&${win(tomorrow)}`);
ok(agenda.some((t) => t.id === internal) && agenda.some((t) => t.id === meeting) && !agenda.some((t) => t.id === companyTask), "agenda: only the day asked for");
ok((await list(vitor, `status=any&${win(tomorrow)}&kind=reuniao`)).map((t) => t.id).join() === meeting, "agenda: by type");
ok((await list(vitor, `status=any&priority=alta`)).every((t) => t.priority === "alta"), "by priority");
const onCompany = (await list(vitor, "status=pending&companyId=co-v")).map((t) => t.id);
ok(onCompany.includes(companyTask) && onCompany.includes(meeting) && !onCompany.includes(internal), "a company's tasks: its own and its contacts'");

// ---- situação, edits and history ----
ok((await json(await patch(vitor, meeting, { status: "em_andamento" }))).status === 200, "started (em andamento)");
ok((await list(vitor, "status=em_andamento")).map((t) => t.id).includes(meeting), "…listed as em andamento");
ok((await json(await patch(vitor, meeting, { title: "Diagnóstico com a Ana", description: "Levar o estudo", priority: "alta" }))).status === 200, "edited");
ok((await json(await patch(vitor, meeting, { dueDate: tomorrow, dueTime: "16:00" }))).status === 200, "rescheduled");
ok((await json(await patch(vitor, meeting, { ownerId: "u-joao" }))).status === 200, "given to João");
ok((await json(await patch(vitor, meeting, { status: "concluida", result: "Pediu proposta" }))).status === 200, "finished with a result");
const m = await rowOf(`SELECT status, done_at IS NOT NULL AS done, result, title, priority FROM crm_tasks WHERE id = $1`, [meeting]);
ok(m.status === "concluida" && m.done && m.result === "Pediu proposta" && m.title === "Diagnóstico com a Ana" && m.priority === "alta", "stored as concluída, with the result");
detail = (await json(await vitor.get(`${BASE}/api/crm/tasks/${meeting}/`))).body;
ok(detail.events.map((e) => e.action).join() === "created,status,edited,rescheduled,owner,status", `history: ${detail.events.map((e) => e.action).join()}`);
ok(detail.events[2].payload.fields.join() === "título,descrição,prioridade", "…the edit says which fields");
ok(detail.events[4].payload.from === "Vitor" && detail.events[4].payload.to === "João", "…and who it went from and to");
ok((await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c1' AND kind = 'task' AND payload->>'taskId' = $1 AND payload->>'action' IN ('rescheduled', 'done')`, [meeting])) === "2", "the contact's history gets the reschedule and the finish");
ok((await json(await patch(vitor, meeting, { status: "pendente" }))).status === 200 && (await sql(`SELECT done_at IS NULL FROM crm_tasks WHERE id = $1`, [meeting])) === "t", "reopened");

// cancel and reactivate
ok((await json(await patch(vitor, companyTask, { status: "cancelada" }))).status === 200, "canceled");
ok(!(await list(vitor, "status=any")).some((t) => t.id === companyTask), "a canceled task leaves the agenda");
ok((await patch(vitor, companyTask, { status: "em_andamento" })).status() === 400, "a canceled task must be reactivated first");
ok((await json(await patch(vitor, companyTask, { status: "pendente" }))).status === 200 && (await sql(`SELECT canceled_at IS NULL FROM crm_tasks WHERE id = $1`, [companyTask])) === "t", "reactivated");
ok((await patch(vitor, companyTask, { status: "feita" })).status() === 400, "unknown situação refused");
// the old flags still work (the contact panel's Concluir)
ok((await json(await patch(vitor, "t5", { done: true }))).status === 200 && (await sql(`SELECT status FROM crm_tasks WHERE id = 't5'`)) === "concluida", "done:true still finishes (situação concluída)");

// ---- the reminders bell ----
const soon = new Date(Date.now() + 10 * 60_000);
const hhmm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(soon);
r = await json(await create(vitor, { title: "Ligar para o Bruno", dueDate: spDay(soon.getTime()), dueTime: hhmm, reminder: 15 }));
const ring = r.body.id;
let bell = (await json(await vitor.get(`${BASE}/api/crm/reminders/`))).body;
ok(bell.due.map((t) => t.id).includes(ring), "a reminder whose time has come is in my bell");
ok(!bell.due.some((t) => t.id === internal), "…one for tomorrow isn't yet");
ok(!(await json(await joao.get(`${BASE}/api/crm/reminders/`))).body.due.some((t) => t.id === ring), "…and it's only in its owner's bell");
ok((await json(await joao.get(`${BASE}/api/crm/reminders/`))).body.overdue >= 1, "João's bell counts his late tasks");
ok((await json(await patch(vitor, ring, { dismissReminder: true }))).status === 200, "dismissed");
ok(!(await json(await vitor.get(`${BASE}/api/crm/reminders/`))).body.due.some((t) => t.id === ring), "…gone from the bell");
await patch(vitor, ring, { dueDate: spDay(soon.getTime()), dueTime: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(soon.getTime() + 60_000)) });
ok((await json(await vitor.get(`${BASE}/api/crm/reminders/`))).body.due.some((t) => t.id === ring), "rescheduled: the reminder comes back");
await patch(vitor, ring, { status: "concluida" });
ok(!(await json(await vitor.get(`${BASE}/api/crm/reminders/`))).body.due.some((t) => t.id === ring), "a finished task leaves the bell");

// ---- Personalização: priorities and colors ----
const catalog = (await json(await vitor.get(`${BASE}/api/crm/catalog/`))).body.catalog;
const kinds = catalog.options.filter((o) => o.kind === "task_kind");
ok(["primeiro_contato", "follow_up", "preparacao_proposta", "envio_proposta", "retorno_comercial", "acompanhamento_cliente", "atividade_interna"].every((id) => kinds.some((k) => k.id === id)), "the spec's task types are in the list");
ok(kinds.every((k) => k.color) && catalog.options.filter((o) => o.kind === "source").every((o) => o.color === null), "task types have colors; other lists don't");
ok(catalog.options.filter((o) => o.kind === "priority").map((o) => o.label).join() === "Alta,Média,Baixa", "priorities list");
r = await json(await admin.patch(`${BASE}/api/crm/catalog/options/task_kind/follow_up/`, { data: { color: "roxo" } }));
ok(r.status === 200 && r.body.option.color === "roxo", "Administrador changes a type's color");
ok((await sql(`SELECT metadata->>'to' FROM audit_log WHERE action = 'crm.catalog_change' AND metadata->>'action' = 'recolored'`)) === "roxo", "…in the audit trail");
ok((await admin.patch(`${BASE}/api/crm/catalog/options/task_kind/follow_up/`, { data: { color: "rosa-choque" } })).status() === 400, "unknown color refused");
ok((await vitor.patch(`${BASE}/api/crm/catalog/options/task_kind/follow_up/`, { data: { color: "verde" } })).status() === 403, "only the Administrador changes colors");
r = await json(await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "priority", label: "Urgente", color: "vermelho" } }));
ok(r.status === 200 && r.body.option.color === "vermelho", "a new priority with its color");
ok((await json(await create(vitor, { title: "Proposta hoje", priority: r.body.option.id }))).status === 201, "…usable right away");
ok((await admin.patch(`${BASE}/api/crm/catalog/options/priority/media/`, { data: { archived: true } })).status() === 400, "Média (the fallback) can't be archived");

await closeDb();
await browser.close();
console.log("TASKS API PASSED");
