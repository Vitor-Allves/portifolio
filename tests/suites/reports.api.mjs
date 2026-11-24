// Evolução v1.0 · Relatórios (item 14) and results by origin and ad (item
// 15) through the API, on base + campaign fixtures: October 2026 from the
// fixtures (the same numbers as the Painel) and, for proposals, clients,
// contracts and commissions, data created now (dates relative to today).
// Who sees what (Comercial only his, Marketing without contract values,
// campaigns only for who edits them), planilha and PDF (permission, audit).
import { request } from "playwright";
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing

const OCT = "from=2026-10-01&to=2026-10-31";
const report = async (api, id, q = OCT) => json(await api.get(`${BASE}/api/crm/reports/${id}/?${q}`));
const sum = (r, label) => r.body.report.summary.find((x) => x.label === label)?.value;
const colOf = (r, label) => r.body.report.columns.findIndex((c) => c.label === label);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const addDays = (d, n) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const RECENT = `from=${addDays(today, -30)}&to=${today}`;

// ---- basics ----
ok((await report(vitor, "nao-existe")).status === 404, "an unknown report is not found");
ok((await report(vitor, "vendas", "from=2026-13-01&to=2026-10-31")).status === 400, "an invalid period is refused");
ok((await report(vitor, "vendas", "from=2025-01-01&to=2026-10-31")).status === 400, "…and one longer than a year");

// ---- October, from the fixtures (the Painel's numbers) ----
let r = await report(vitor, "funil");
ok(
  r.status === 200 && sum(r, "Abertas agora") === 3 && sum(r, "Valor em aberto") === 400000,
  `funil: 3 open now, R$ 4.000 (${JSON.stringify(r.body?.report?.summary)})`,
);
ok(
  sum(r, "Ganhas no período") === 1 && sum(r, "Perdidas no período") === 1 && r.body.report.rows.length >= 10,
  "…1 won and 1 lost in October, every stage listed",
);
r = await report(vitor, "vendas");
ok(
  r.body.report.rows.length === 1 && r.body.report.rows[0].contactId === "c1" && sum(r, "Valor vendido") === 500000,
  "vendas: Ana's sale, R$ 5.000 (opens Ana)",
);
ok(r.body.report.rows[0].cells[colOf(r, "Origem")] === "Indicação" && r.body.report.totals.at(-1) === 500000, "…with the origin's name and the total");
ok((await report(vitor, "vendas", `${OCT}&source=bni`)).body.report.rows.length === 0, "the origin filter applies");
r = await report(vitor, "vendedores");
const line = (name) => r.body.report.rows.find((x) => x.cells[0] === name).cells;
ok(
  line("Vitor")[1] === 1 && line("Vitor")[2] === 500000 && line("João")[4] === 1 && line("João")[5] === 0,
  "vendedores: Vitor 1 sale (R$ 5.000), João 1 loss (0%)",
);
ok(r.body.report.totals[1] === 1 && r.body.report.totals[4] === 1 && r.body.report.totals[5] === 0.5, "…totals: 1 won, 1 lost, 50%");
r = await report(vitor, "perdas");
ok(
  r.body.report.rows.length === 1 && r.body.report.rows[0].cells[0] === "Fechamento com concorrente" && r.body.report.rows[0].cells[3] === 200000,
  "perdas: the competitor, R$ 2.000",
);
r = await report(vitor, "produtividade");
ok(r.body.report.totals[0] === "Equipe" && r.body.report.totals[1] === 4, "produtividade: the team's 4 leads");
r = await report(vitor, "origens");
const ind = r.body.report.rows.find((x) => x.cells[0] === "Indicação").cells;
ok(r.body.report.totals[1] === 4 && ind[5] === 1 && ind[6] === 500000, "origens: 4 leads in October; Indicação made the sale");

// ---- the Comercial sees only his ----
r = await report(joao, "vendas", `${OCT}&owner=u-vitor`);
ok(
  r.status === 200 && r.body.report.rows.length === 0 && r.body.report.filters[0] === "Vendedor: João",
  "the Comercial asks for Vitor's sales and gets his own (none)",
);
r = await report(joao, "vendedores");
ok(r.body.report.rows.length === 1 && r.body.report.rows[0].cells[0] === "João", "…only his line");
ok((await report(joao, "campanhas")).status === 403, "campaigns: only who edits them");
ok((await report(maria, "campanhas")).status === 200, "…Marketing does");

// ---- now: proposals, clients, contracts, commissions, ads ----
const svc = (
  await json(await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label: "Gestão de tráfego", meta: { billing: "mensal" } } }))
).body.option.id;
const P = `${BASE}/api/crm/proposals/`;
const p1 = (await json(await joao.post(P, { data: { dealId: "d3" } }))).body.id;
await json(await joao.patch(`${P}${p1}/`, { data: { items: [{ serviceId: svc, unitValue: "2.500" }] } }));
const token = (await json(await joao.post(`${P}${p1}/send/`, { data: { channel: "email" } }))).body.token;
const anon = await request.newContext();
await anon.post(`${BASE}/api/proposta/${token}/decision/`, {
  data: { decision: "aprovar", name: "Carla Dias", email: "carla@x.com", accept: true, version: 1 },
});
await anon.dispose();
const p2 = (await json(await vitor.post(P, { data: { dealId: "d6" } }))).body.id;
await json(await vitor.patch(`${P}${p2}/`, { data: { items: [{ serviceId: svc, unitValue: "1.000" }] } }));
await json(await vitor.post(`${P}${p2}/send/`, { data: { channel: "whatsapp" } }));
await sql(`UPDATE crm_proposals SET status = 'expirada', valid_until = $2 WHERE id = $1`, [p2, addDays(today, -1)]);
r = await report(vitor, "propostas", RECENT);
ok(
  sum(r, "Enviadas") === 2 && sum(r, "Aprovadas") === 1 && sum(r, "Taxa de aprovação") === 1 && sum(r, "Valor aprovado") === 250000,
  "propostas: 2 sent, 1 approved (R$ 2.500)",
);
ok(r.body.report.rows.find((x) => x.cells[0] === "0001").cells[colOf(r, "Situação")] === "Aprovada", "…with each one's situation");
r = await report(vitor, "propostas_expiradas", RECENT);
ok(r.body.report.rows.length === 1 && r.body.report.rows[0].cells[0] === "0002" && sum(r, "Valor") === 100000, "propostas expiradas: Vitor's, R$ 1.000");
ok((await report(joao, "propostas", RECENT)).body.report.rows.length === 1, "the Comercial: only his proposal");

await json(await vitor.post(`${BASE}/api/crm/companies/`, { data: { name: "Empresa Alfa" } }));
const co = await sql(`SELECT id FROM crm_companies WHERE name = 'Empresa Alfa'`);
const cl = (
  await json(
    await vitor.post(`${BASE}/api/crm/clients/`, {
      data: {
        companyId: co,
        status: "ativo",
        contract: { services: [svc], startsOn: `${today.slice(0, 7)}-01`, endsOn: addDays(today, 20), value: "2.000", billing: "mensal" },
      },
    }),
  )
).body.id;
ok(typeof cl === "string", "Vitor registers a client with a contract ending in 20 days");
r = await report(vitor, "clientes");
ok(
  r.body.report.rows.some((x) => x.clientId === cl && x.cells[colOf(r, "Receita mensal")] === 200000),
  "clientes ativos: Alfa, R$ 2.000/mês",
);
r = await report(maria, "clientes");
ok(r.status === 200 && r.body.report.rows.every((x) => x.cells[colOf(r, "Receita mensal")] === null), "…Marketing sees the clients, not the values");
ok((await report(maria, "receita")).status === 403 && (await report(maria, "comissoes", RECENT)).status === 403, "…and no Receita recorrente nor Comissões");
r = await report(vitor, "contratos_vencimento", "days=30");
ok(r.body.report.rows.length === 1 && r.body.report.rows[0].cells[colOf(r, "Dias")] === 20, "contratos: Alfa's ends in 20 days");
ok((await report(vitor, "contratos_vencimento", "days=15")).body.report.rows.length === 0, "…not within 15");
r = await report(vitor, "receita");
ok(sum(r, "Receita mensal") === 200000 && sum(r, "Clientes") === 1, "receita recorrente: R$ 2.000 from 1 client");
await json(await vitor.post(`${BASE}/api/crm/commission-rules/`, { data: { name: "Padrão", percent: "10", billing: "mensal" } }));
r = await report(vitor, "comissoes", `from=${today.slice(0, 7)}-01&to=${today}`);
ok(sum(r, "Comissões") === 20000 && r.body.report.rows[0].cells[1] === "Empresa Alfa", "comissões: 10% of Alfa's R$ 2.000");
ok((await report(joao, "comissoes", RECENT)).body.report.rows.length === 0, "…the Comercial sees only his (none)");

await sql(
  `INSERT INTO crm_contacts (id, name, phone, owner_id, source, stage, ad_referral, created_at)
   VALUES ('c-ad1', 'Lia Anúncio', '5515990007001', 'u-vitor', 'anuncio', 'novo', '{"sourceId":"ad-123","headline":"Implante em 1 dia"}', now()),
          ('c-ad2', 'Rui Anúncio', '5515990007002', 'u-vitor', 'anuncio', 'novo', '{"sourceId":"ad-123","headline":"Implante em 1 dia"}', now())`,
);
await sql(
  `INSERT INTO crm_deals (id, contact_id, title, stage, owner_id, value_cents, closed_at, created_at, updated_at) VALUES ('d-ad1', 'c-ad1', 'Implante', 'ganho', 'u-vitor', 300000, now(), now(), now())`,
);
r = await report(vitor, "anuncios", RECENT);
ok(
  r.body.report.rows.length === 1 &&
    r.body.report.rows[0].cells[0] === "Implante em 1 dia" &&
    r.body.report.rows[0].cells[2] === 2 &&
    r.body.report.rows[0].cells[4] === 1,
  "anúncios: 2 leads from the ad, 1 sale",
);
ok(sum(r, "Valor vendido") === 300000, "…R$ 3.000 sold");

// ---- planilha and PDF ----
let res = await vitor.get(`${BASE}/api/crm/reports/vendas/export/?${OCT}&format=csv`);
let csv = await res.text();
ok(
  res.status() === 200 &&
    /text\/csv/.test(res.headers()["content-type"]) &&
    csv.includes("Vendas por período") &&
    csv.includes("Valor (R$)") &&
    csv.includes("5000,00"),
  "vendas as planilha",
);
res = await vitor.get(`${BASE}/api/crm/reports/contratos_vencimento/export/?days=30&format=pdf`);
ok(res.status() === 200 && (await res.body()).subarray(0, 5).toString() === "%PDF-", "contratos as PDF");
res = await maria.get(`${BASE}/api/crm/reports/clientes/export/?format=csv`);
csv = await res.text();
ok(res.status() === 200 && csv.includes("Empresa Alfa") && !csv.includes("2000,00"), "Marketing exports clients without values");
ok((await joao.get(`${BASE}/api/crm/reports/vendas/export/?${OCT}&format=csv`)).status() === 403, "the Comercial doesn't export reports");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.report_export' AND target_type = 'crm_report'`)) === "3", "every export audited");
ok(
  (await sql(`SELECT metadata->>'format' FROM audit_log WHERE action = 'crm.report_export' AND target_id = 'contratos_vencimento'`)) === "pdf",
  "…with the format",
);

await browser.close();
await closeDb();
console.log("REPORTS API PASSED");
