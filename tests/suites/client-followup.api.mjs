// Fase 5 · entrega 2 through the API, on base + campaign fixtures: the
// monthly acompanhamento of a client (validation, one per month, edits with
// a conflict check, history), the "Acompanhamento de clientes" overview
// (pending first, only one's own for a Comercial) and the automations 7
// (won opportunity → client in Onboarding + task), 8 (contract near its end →
// notice in the bell that opens the client) and 9 (client without the
// month's acompanhamento → task).
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing

const day = (offset) => sql(`SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date + $1::int)::text`, [offset]);
const month = await sql(`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')`);
const prev = await sql(`SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month', 'YYYY-MM')`);
const next = await sql(`SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month', 'YYYY-MM')`);
const report = (api, id, data) => api.post(`${BASE}/api/crm/clients/${id}/reports/`, { data }).then(json);
const followup = async (api, m) => (await json(await api.get(`${BASE}/api/crm/clients/followup/?month=${m}`))).body;
const set = (id, data) => admin.patch(`${BASE}/api/crm/automations/${id}/`, { data }).then(json);
const runNow = (id) => admin.post(`${BASE}/api/crm/automations/run/`, { data: { id } }).then(json);
const bell = async (api) => (await json(await api.get(`${BASE}/api/crm/reminders/`))).body.notifications;
const lastRun = (id) => sql(`SELECT status || ': ' || COALESCE(detail, '') FROM crm_automation_runs WHERE automation_id = $1 ORDER BY created_at DESC LIMIT 1`, [id]);

await sql(`INSERT INTO crm_options (kind, id, label, sort) VALUES ('service', 'trafego', 'Gestão de tráfego', 1), ('service', 'social', 'Social media', 2)`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor'), ('co-souza', 'Souza Pet', 'souza pet', 'u-joao'), ('co-lima', 'Lima Fit', 'lima fit', 'u-vitor')`);
await sql(`UPDATE crm_contacts SET company_id = 'co-rib' WHERE id = 'c1'`);
await sql(`UPDATE crm_contacts SET company_id = 'co-lima' WHERE id = 'c4'`);
let r = await json(await vitor.post(`${BASE}/api/crm/clients/`, { data: { companyId: "co-rib", status: "ativo", startedOn: `${prev}-05` } }));
const rib = r.body.id;
await json(await vitor.post(`${BASE}/api/crm/clients/${rib}/contracts/`, { data: { services: ["trafego"], startsOn: await day(-30), endsOn: await day(10), value: "2.000" } }));
const souza = (await json(await joao.post(`${BASE}/api/crm/clients/`, { data: { companyId: "co-souza", status: "ativo" } }))).body.id;

// ---- monthly acompanhamento ----
ok((await report(vitor, rib, { month })).status === 400, "an empty acompanhamento is refused");
ok((await report(vitor, rib, { month: next, results: "x" })).status === 400, "a month that hasn't started is refused");
ok((await report(vitor, rib, { month: "2026-13", results: "x" })).status === 400, "invalid month refused");
ok((await report(maria, rib, { month, results: "x" })).status === 403, "Marketing can't register it");
ok((await report(joao, rib, { month, results: "x" })).status === 404, "a Comercial can't touch someone else's client");
ok((await report(vitor, rib, { month, services: ["nope"], results: "x" })).status === 400, "only services from Personalização");
r = await report(vitor, rib, {
  month,
  services: ["trafego"],
  activities: "Campanhas de implantes no Instagram",
  results: "42 leads, 6 avaliações",
  attention: "Orçamento acaba dia 20",
  nextActions: "Testar vídeo com a Dra. Ana",
  ownerId: "u-vitor",
});
ok(r.status === 200, "Vitor registers this month");
let rep = r.body.client.reports.find((x) => x.month === month);
ok(rep && rep.results === "42 leads, 6 avaliações" && rep.services.join() === "trafego" && rep.ownerName === "Vitor" && rep.updatedByName === "Vitor", "…saved with services, texts and responsible");
const firstAt = rep.updatedAt;
r = await report(vitor, rib, { month, results: "45 leads, 7 avaliações", expectedUpdatedAt: firstAt });
ok(r.status === 200, "edited");
rep = r.body.client.reports.find((x) => x.month === month);
ok(rep.results === "45 leads, 7 avaliações" && rep.activities === "Campanhas de implantes no Instagram", "…only what was sent changes");
ok((await sql(`SELECT count(*) FROM crm_client_reports WHERE client_id = $1`, [rib])) === "1", "still one per month");
r = await report(admin, rib, { month, attention: "Cliente pediu pausa no carnaval", expectedUpdatedAt: firstAt });
ok(r.status === 409 && /Vitor salvou o acompanhamento/.test(r.body.error), `someone else saving in between is refused, not overwritten (${r.body?.error})`);
ok((await report(vitor, rib, { month, results: "45 leads, 7 avaliações" })).status === 200, "saving with nothing changed is fine");
r = await report(vitor, rib, { month: prev, activities: "Setup das contas", results: "Contas prontas" });
ok(r.status === 200 && r.body.client.reports.map((x) => x.month).join() === `${month},${prev}`, "last month too, newest first");
const evs = r.body.client.events.filter((e) => e.kind === "report");
ok(evs.length === 3 && evs.some((e) => e.payload.action === "edited" && e.payload.fields.join() === "Resultados"), `history: registered and what changed (${evs.map((e) => e.payload.fields)})`);
ok((await report(joao, souza, { month, ownerId: "u-vitor", results: "x" })).status === 403, "a Comercial can't hand the acompanhamento to someone else");

// ---- Acompanhamento de clientes ----
let f = await followup(vitor, month);
ok(f.month === month && f.rows.map((x) => x.companyName).join() === "Souza Pet,Ribeiro Odonto", "pending first: Souza Pet, then Ribeiro Odonto");
ok(f.rows[0].report === null && f.rows[1].report.updatedByName === "Vitor" && f.rows[1].report.attention === "Orçamento acaba dia 20", "…with who updated it and the points of attention");
ok((await followup(joao, month)).rows.map((x) => x.companyName).join() === "Souza Pet", "a Comercial sees only theirs");
f = await followup(vitor, prev);
ok(f.rows.map((x) => x.companyName).join() === "Ribeiro Odonto", "last month: only who was already a client then");
ok((await followup(vitor, "lixo")).month === month, "an invalid month falls back to this one");
ok((await json(await maria.get(`${BASE}/api/crm/clients/followup/?month=${month}`))).status === 200, "Marketing sees the overview");

// ---- 7. won opportunity → client in Onboarding + task ----
ok((await set("cliente_onboarding", { status: "ativa" })).status === 200, "automation 7 turned on");
const won = async (id) => json(await vitor.patch(`${BASE}/api/crm/deals/${id}/`, { data: { stage: "ganho", service: "social", negotiatedValue: "1.500", wonReason: "resultado", wonResult: "venda_realizada", wonNote: "Fechou o social" } }));
ok((await won("d6")).status === 200, "Ana's second opportunity (Ribeiro Odonto, already a client) is won");
ok(/contrato novo no cliente Ribeiro Odonto/.test(await lastRun("cliente_onboarding")), "…it becomes a new contract of the client, no onboarding");
ok((await sql(`SELECT count(*) FROM crm_contracts WHERE client_id = $1 AND deal_id = 'd6'`, [rib])) === "1", "…the contract is there");
const d9 = (await json(await vitor.post(`${BASE}/api/crm/deals/`, { data: { contactId: "c4", title: "Gestão Lima Fit", value: "1500" } }))).body.id;
ok((await won(d9)).status === 200, "Davi's opportunity (Lima Fit, not a client) is won");
const lima = await sql(`SELECT id || '|' || status || '|' || COALESCE(owner_id, '-') FROM crm_clients WHERE company_id = 'co-lima'`);
ok(/\|onboarding\|u-vitor$/.test(lima), `Lima Fit became a client in Onboarding, with Vitor (${lima})`);
const limaId = lima.split("|")[0];
ok((await sql(`SELECT count(*) FROM crm_contracts WHERE client_id = $1 AND deal_id = $2 AND value_cents = 150000 AND 'social' = ANY(services)`, [limaId, d9])) === "1", "…the opportunity is its first contract");
ok(
  (await sql(`SELECT count(*) FROM crm_tasks WHERE company_id = 'co-lima' AND title = 'Onboarding do cliente' AND owner_id = 'u-vitor' AND kind = 'acompanhamento_cliente' AND created_by_name = 'Automação'`)) === "1",
  "…and Vitor has the onboarding task on the company"
);
ok((await sql(`SELECT user_name FROM crm_client_events WHERE client_id = $1 AND kind = 'created'`, [limaId])) === "Automação", "the history says the automation did it");
ok((await sql(`SELECT actor_kind FROM audit_log WHERE action = 'crm.client_create' AND target_id = $1`, [limaId])) === "system", "…audited as the system");
await json(await vitor.patch(`${BASE}/api/crm/deals/${d9}/`, { data: { stage: "proposta" } }));
await won(d9);
ok((await sql(`SELECT count(*) FROM crm_clients WHERE company_id = 'co-lima'`)) === "1" && (await sql(`SELECT count(*) FROM crm_tasks WHERE company_id = 'co-lima'`)) === "1", "won again: nothing twice");
await sql(`UPDATE crm_deals SET service = 'trafego', value_cents = 100000 WHERE id = 'd5'`);
ok((await json(await vitor.patch(`${BASE}/api/crm/deals/d5/`, { data: { stage: "ganho", negotiatedValue: "900", wonReason: "preco", wonResult: "proposta_aprovada", wonNote: "Aprovou a proposta" } }))).status === 200, "Eva's opportunity (no company) is won");
ok(/^ignorada: .*Eva Prado não tem empresa/.test(await lastRun("cliente_onboarding")), "…nothing is created without a company (run says why)");

// ---- 8. contract near its end ----
ok((await set("renovacao_contrato", { status: "ativa", config: { days: 15 } })).status === 200, "automation 8 on, 15 days before");
r = await runNow("renovacao_contrato");
ok(r.status === 200 && r.body.results.renovacao_contrato.ok === 1, `one contract ends within 15 days (${JSON.stringify(r.body.results)})`);
const notice = (await bell(vitor)).find((n) => n.title === "Contrato perto do fim: Ribeiro Odonto");
ok(notice && notice.clientId === rib && /Termina em 10 dias/.test(notice.body), "Vitor gets the notice, which opens the client");
ok((await runNow("renovacao_contrato")).body.results.renovacao_contrato.ok === 0, "the next check doesn't repeat it");
const k = await sql(`SELECT id FROM crm_contracts WHERE client_id = $1 AND ends_on IS NOT NULL`, [rib]);
await json(await vitor.patch(`${BASE}/api/crm/clients/${rib}/contracts/${k}/`, { data: { endsOn: await day(12) } }));
ok((await runNow("renovacao_contrato")).body.results.renovacao_contrato.ok === 1, "a new end date alerts again");

// ---- 9. client without the month's acompanhamento ----
ok((await set("cliente_sem_atualizacao", { status: "ativa", config: { dayOfMonth: 1 } })).status === 200, "automation 9 on, from day 1");
r = await runNow("cliente_sem_atualizacao");
ok(r.body.results.cliente_sem_atualizacao.ok === 2, `Souza Pet and Lima Fit have no acompanhamento this month (${JSON.stringify(r.body.results)})`);
ok((await sql(`SELECT owner_id FROM crm_tasks WHERE company_id = 'co-souza' AND title LIKE 'Atualizar o acompanhamento do mês (%'`)) === "u-joao", "João gets the task for his client");
ok((await sql(`SELECT count(*) FROM crm_tasks WHERE company_id = 'co-rib' AND title LIKE 'Atualizar o acompanhamento%'`)) === "0", "Ribeiro Odonto (updated) gets none");
ok((await runNow("cliente_sem_atualizacao")).body.results.cliente_sem_atualizacao.ok === 0, "one task per client per month");
ok((await set("cliente_sem_atualizacao", { config: { dayOfMonth: 0 } })).status === 400, "day of the month 1–28");

await closeDb();
await browser.close();
console.log("CLIENT FOLLOW-UP API PASSED");
