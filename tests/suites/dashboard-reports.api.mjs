// Fase 6 · entrega 1 through the API, on base + campaign fixtures: the
// Painel's new filters (origem, segmento, etapa), the new indicators (paradas,
// receita recorrente contratada, campanhas), the list behind every number
// matching that number, CSV export (permission, content, audit trail) and a
// Comercial only ever seeing their own.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing

const OCT = "from=2026-10-01&to=2026-10-31";
const dash = async (api, q = "") => (await json(await api.get(`${BASE}/api/crm/dashboard/?${OCT}${q}`))).body.dashboard;
const records = async (api, metric, q = "", period = OCT) => (await json(await api.get(`${BASE}/api/crm/dashboard/records/?${period}&metric=${metric}${q}`))).body;

// Segment on Ana's company; a client of Vitor's with a monthly contract; a campaign sent now.
await sql(`INSERT INTO crm_options (kind, id, label, sort) VALUES ('service', 'trafego', 'Gestão de tráfego', 1)`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id, segment) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor', 'Odontologia')`);
await sql(`UPDATE crm_contacts SET company_id = 'co-rib' WHERE id = 'c1'`);

// ---- every number = its list ----
let d = await dash(vitor);
const pairs = [
  ["leads", d.current.newLeads],
  ["deals", d.current.newDeals],
  ["meetings", d.current.meetings],
  ["proposals", d.current.proposals],
  ["approved", d.current.proposalsApproved],
  ["worked", d.current.workedLeads],
  ["finished", d.current.finishedContacts],
  ["won", d.current.wonCount],
  ["lost", d.current.lostCount],
  ["tasksDone", d.current.tasksDone],
  ["open", d.openNow.count],
  ["stalled", d.stalledNow.count],
  ["overdue", d.tasksNow.overdue],
  ["today", d.tasksNow.today],
];
for (const [metric, count] of pairs) {
  const r = await records(vitor, metric);
  ok(r.total === count && r.rows.length === count, `${metric}: the list has the ${count} records the Painel counts (${r.total})`);
}
ok(d.current.newLeads === 4 && d.openNow.count === 3, "same October numbers as before (4 leads, 3 open)");
const won = await records(vitor, "won");
ok(won.kind === "deal" && won.rows[0].id === "d1" && won.rows[0].contactId === "c1" && won.rows[0].valueCents === 500000 && won.rows[0].stage === "ganho", "won: Ana's d1, R$ 5.000, opens Ana");
ok((await records(vitor, "leads")).rows.every((r) => r.kind === "contact" && r.contactId), "leads open their contact");
ok((await records(vitor, "overdue")).rows[0].kind === "task", "overdue tasks open the task");
ok(d.stalledNow.days === 7 && d.stalledNow.count >= 1, `paradas: open opportunities without movement for 7 days (${d.stalledNow.count})`);
ok((await json(await vitor.get(`${BASE}/api/crm/dashboard/records/?${OCT}&metric=nope`))).status === 400, "unknown indicator refused");

// ---- filters ----
d = await dash(vitor, "&source=indicacao");
ok(d.current.newLeads === 1 && d.current.wonCount === 1 && d.current.lostCount === 0, "origem Indicação: 1 lead, 1 won");
ok((await records(vitor, "leads", "&source=indicacao")).rows.map((r) => r.title).join() === "Ana Ribeiro", "…the list follows the filter");
d = await dash(vitor, "&segment=Odontologia");
ok(d.current.newLeads === 1 && d.current.wonCount === 1 && d.openNow.count === 1, "segmento Odontologia (Ana's company): 1 lead, 1 won, 1 open");
d = await dash(vitor, "&stage=proposta");
ok(d.openNow.count === 1 && d.funnel.filter((f) => f.count > 0).map((f) => f.stage).join() === "proposta", "etapa Proposta: only that stage is open in the funnel");
ok(d.current.newLeads === 4, "…the period numbers don't change with the stage");
d = await dash(vitor, "&owner=u-joao&source=bni");
ok(d.current.newLeads === 1 && d.current.lostCount === 1 && d.team.map((t) => t.name).join() === "João", "João + BNI: 1 lead, 1 lost");

// ---- receita recorrente contratada ----
const rib = (await json(await vitor.post(`${BASE}/api/crm/clients/`, { data: { companyId: "co-rib", status: "ativo" } }))).body.id;
await vitor.post(`${BASE}/api/crm/clients/${rib}/contracts/`, { data: { services: ["trafego"], startsOn: "2026-10-01", value: "3.500", billing: "mensal" } });
await vitor.post(`${BASE}/api/crm/clients/${rib}/contracts/`, { data: { services: ["trafego"], startsOn: "2026-10-01", value: "9.000", billing: "unico" } });
d = await dash(vitor);
ok(d.recurring.clients === 1 && d.recurring.monthlyCents === 350000, "receita recorrente: R$ 3.500/mês (the one-off contract doesn't count)");
let r = await records(vitor, "recurring");
ok(r.kind === "client" && r.rows[0].id === rib && r.rows[0].valueCents === 350000, "…its list opens the client");
d = await dash(maria);
ok(d.recurring.clients === 1 && d.recurring.monthlyCents === null && (await records(maria, "recurring")).rows[0].valueCents === null, "Marketing sees the client, not the values");
ok((await dash(joao)).recurring.clients === 1, "João sees the team's general numbers (evolução v1.0)");
ok((await dash(joao, "&owner=u-joao")).recurring.clients === 0, "…and his own: none of his clients");
const jt = (await dash(joao, "&owner=u-vitor")).team;
ok(jt.length === 1 && jt[0].ownerId === "u-joao", "…never another person's numbers, and only his own line per person");

// ---- campanhas ----
await sql(`INSERT INTO crm_campaigns (id, name, status, started_at) VALUES ('k-dash', 'Novembro', 'concluida', now())`);
await sql(`INSERT INTO crm_campaign_recipients (campaign_id, contact_id, status, sent_at) VALUES ('k-dash', 'k1', 'enviada', now()), ('k-dash', 'k2', 'enviada', now()), ('k-dash', 'k3', 'pulada', NULL)`);
const today = await sql(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text`);
const NOW = `from=${today}&to=${today}`;
d = (await json(await vitor.get(`${BASE}/api/crm/dashboard/?${NOW}`))).body.dashboard;
ok(d.campaigns.count === 1 && d.campaigns.sent === 2, `campanhas no período: 1, 2 enviadas (${JSON.stringify(d.campaigns)})`);
r = await records(vitor, "campaigns", "", NOW);
ok(r.kind === "campaign" && r.rows[0].title === "Novembro", "…the list shows the campaign");
ok((await dash(vitor)).campaigns.count === 0, "October: no campaign");
ok((await dash(joao)).campaigns === null && (await records(joao, "campaigns")).total === 0, "a Comercial doesn't see campaigns");

// ---- Comercial: only theirs ----
d = await dash(joao, "&owner=u-vitor");
ok(d.current.newLeads === 2 && d.team.length === 1, "João asking for Vitor still gets his own");
r = await records(joao, "leads", "&owner=u-vitor");
ok(r.total === 2 && !r.rows.some((x) => x.title === "Ana Ribeiro"), "…the lists too");

// ---- export ----
let res = await vitor.get(`${BASE}/api/crm/dashboard/export/?${OCT}&what=summary&source=all`);
let text = await res.text();
ok(res.status() === 200 && /text\/csv/.test(res.headers()["content-type"]), "Gestor exports the Painel as CSV");
ok(text.includes("Leads cadastrados;4;1") && text.includes("Negócios ganhos;1;1") && text.includes("Receita recorrente contratada"), "…with the same numbers, against the previous period");
ok(text.includes("Faturamento emitido e valor recebido não são controlados pelo CRM"), "…and says what the CRM doesn't track");
res = await vitor.get(`${BASE}/api/crm/dashboard/export/?${OCT}&what=records&metric=won`);
text = await res.text();
ok(res.status() === 200 && text.split("\n").length === 2 && text.includes("Oportunidade;d1;Ana Ribeiro · Ribeiro Odonto;Vitor;Venda fechada;\"5000,00\""), `the won list as CSV (${text.split("\n")[1]})`);
ok((await joao.get(`${BASE}/api/crm/dashboard/export/?${OCT}&what=summary`)).status() === 403, "a Comercial can't export");
ok((await maria.get(`${BASE}/api/crm/dashboard/export/?${OCT}&what=summary`)).status() === 200, "Marketing can");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.report_export'`)) === "3", "every export is in the audit trail");
await sql(`UPDATE internal_users SET crm_permissions = '{"exportReports": true}'::jsonb WHERE id = 'u-joao'`);
ok((await joao.get(`${BASE}/api/crm/dashboard/export/?${OCT}&what=summary`)).status() === 200, "…unless given the permission");

await closeDb();
await browser.close();
console.log("DASHBOARD REPORTS API PASSED");
