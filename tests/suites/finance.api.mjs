// Evolução v1.0 · financeiro comercial e comissões (item 10) through the API,
// on base + campaign fixtures, with dates relative to today: commission rules
// (who manages them, the most specific one wins), a contract registered by a
// Gestor, one formalized from a proposal (monthly + one-time, starting next
// month), one cancelled, an opportunity lost — and the numbers: sold, new
// monthly and one-time revenue, active, contracted for 12 months, next
// charges, discounts, cancellations, lost, commissions per contract and per
// seller; the Comercial sees only his; Marketing doesn't see values; exports.
import { request } from "playwright";
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing

const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const month = today.slice(0, 7);
const addMonths = (m, n) => {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7);
};
const firstOfMonth = `${month}-01`;
const nextMonth = addMonths(month, 1);
const range = `from=${firstOfMonth}&to=${today}`;

// ---- catalog and rules ----
const svc = async (label, meta) =>
  (await json(await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label, meta } }))).body.option.id;
const trafego = await svc("Gestão de tráfego", { referenceValue: "2.500", billing: "mensal" });
const site = await svc("Site institucional", { referenceValue: "4.000", billing: "unico" });
const R = `${BASE}/api/crm/commission-rules/`;
ok((await json(await joao.post(R, { data: { name: "X", percent: 10 } }))).status === 403, "the Comercial doesn't manage commission rules");
ok((await json(await vitor.post(R, { data: { name: "X", percent: 150 } }))).status === 400, "percent 0–100");
ok((await json(await vitor.post(R, { data: { name: "X", percent: 10, months: 40 } }))).status === 400, "monthly payments 1–36");
ok((await json(await vitor.post(R, { data: { name: "X", percent: 10, service: "nao-existe" } }))).status === 400, "service from the catalog");
ok(
  (await json(await vitor.post(R, { data: { name: "Padrão mensal", percent: "10%", billing: "mensal" } }))).status === 201,
  "Gestor creates the default monthly rule (10% of the first payment)",
);
ok(
  (await json(await vitor.post(R, { data: { name: "Sites", percent: "5", billing: "unico", service: site } }))).status === 201,
  "…sites: 5% of the one-time value",
);
const jr = await json(await vitor.post(R, { data: { name: "João tráfego", percent: "20", billing: "mensal", service: trafego, userId: "u-joao", months: 3 } }));
ok(jr.status === 201 && jr.body.rule.months === 3 && jr.body.rule.userName === "João", "…and João's traffic rule (20% × 3 payments)");
const old = (await json(await vitor.post(R, { data: { name: "Antiga", percent: 50 } }))).body.rule.id;
ok((await json(await vitor.patch(`${R}${old}/`, { data: { archived: true } }))).body.rule.archivedAt, "a rule is archived, not deleted");
ok(
  (await json(await joao.get(R))).body.rules.length === 4 && (await json(await maria.get(R))).status === 403,
  "the Comercial reads the rules; Marketing (no contract values) doesn't",
);

// ---- contracts ----
// (a) Vitor's client: R$ 2.000/mês from the 1st of this month.
await json(await vitor.post(`${BASE}/api/crm/companies/`, { data: { name: "Empresa Alfa" } }));
const coA = await sql(`SELECT id FROM crm_companies WHERE name = 'Empresa Alfa'`);
const clA = (
  await json(
    await vitor.post(`${BASE}/api/crm/clients/`, {
      data: { companyId: coA, status: "ativo", contract: { services: [trafego], startsOn: firstOfMonth, value: "2.000", billing: "mensal" } },
    }),
  )
).body.id;
// (c) another contract of Alfa, cancelled.
const kc = await json(
  await vitor.post(`${BASE}/api/crm/clients/${clA}/contracts/`, { data: { services: [trafego], startsOn: firstOfMonth, value: "1.000", billing: "mensal" } }),
);
const kcId = await sql(`SELECT id FROM crm_contracts WHERE client_id = '${clA}' AND value_cents = 100000`);
ok(
  kc.status < 300 && (await json(await vitor.patch(`${BASE}/api/crm/clients/${clA}/contracts/${kcId}/`, { data: { status: "cancelado" } }))).status === 200,
  "a contract cancelled",
);
ok((await sql(`SELECT status_changed_at IS NOT NULL FROM crm_contracts WHERE id = '${kcId}'`)) === "t", "…with the date it was cancelled");
// (b) João's proposal for Carla, approved and formalized: R$ 2.500/mês + R$ 4.000, from next month, 12 months.
await json(await joao.patch(`${BASE}/api/crm/contacts/c3/`, { data: { company: "Clínica Carla" } }));
const p1 = (await json(await joao.post(`${BASE}/api/crm/proposals/`, { data: { dealId: "d3" } }))).body.id;
await json(
  await joao.patch(`${BASE}/api/crm/proposals/${p1}/`, {
    data: {
      items: [
        { serviceId: trafego, unitValue: "2.500" },
        { serviceId: site, unitValue: "4.000" },
      ],
    },
  }),
);
const token = (await json(await joao.post(`${BASE}/api/crm/proposals/${p1}/send/`, { data: { channel: "email" } }))).body.token;
const anon = await request.newContext();
await anon.post(`${BASE}/api/proposta/${token}/decision/`, {
  data: { decision: "aprovar", name: "Carla Dias", email: "carla@x.com", accept: true, version: 1 },
});
await anon.dispose();
const wonReason = (await json(await joao.get(`${BASE}/api/crm/catalog/`))).body.catalog.options.find((o) => o.kind === "won_reason" && !o.archived).id;
ok(
  (await json(await joao.post(`${BASE}/api/crm/proposals/${p1}/formalize/`, { data: { wonReason, startsOn: `${nextMonth}-01`, termMonths: 12 } }))).status ===
    201,
  "João's proposal formalized",
);
// An opportunity lost this month (Vitor's d6, R$ 1.000 estimated).
ok(
  (await json(await vitor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "perdido", lostReason: "preco", lostNote: "Achou caro" } }))).status === 200,
  "Vitor loses d6",
);

// Eva's open opportunity is worth R$ 2.000 (Novo lead: 5%).
await sql(`UPDATE crm_deals SET value_cents = 200000 WHERE id = 'd5'`);

// ---- the numbers (whole team) ----
let r = await json(await vitor.get(`${BASE}/api/crm/finance/?${range}`));
let f = r.body.finance;
ok(r.status === 200, `finance (${r.body?.error ?? ""})`);
ok(f.sold.count === 1 && f.sold.cents === 650000, `sold: 1 sale, R$ 6.500 (${f.sold.count}, ${f.sold.cents})`);
ok(
  f.newMonthlyCents === 450000 && f.oneTimeCents === 400000,
  `new monthly R$ 4.500 (Alfa + Carla), one-time R$ 4.000 (${f.newMonthlyCents}, ${f.oneTimeCents})`,
);
ok(f.active.contracts === 2 && f.active.monthlyCents === 450000, "active: 2 contracts, R$ 4.500/mês (the cancelled one out)");
ok(f.contractedNext12Cents === 12 * 200000 + 11 * 250000, `contracted 12 months: Alfa 12 × 2.000 + Carla 11 × 2.500 (${f.contractedNext12Cents})`);
const inMonth = (m) => f.installments.filter((i) => i.month === m);
ok(
  inMonth(month).reduce((a, i) => a + i.cents, 0) === 200000 && inMonth(nextMonth).reduce((a, i) => a + i.cents, 0) === 200000 + 250000 + 400000,
  "charges: this month Alfa; next month Alfa + Carla + the site",
);
ok(f.installments.length === 6 + 5 + 1, `6 months of charges (${f.installments.length})`);
ok(f.discounts.proposals === 1 && f.discounts.cents === 0, "discounts: one approved proposal, no discount");
ok(
  f.cancellations.count === 1 && f.cancellations.monthlyCents === 100000 && f.cancellations.rows[0].clientName === "Empresa Alfa",
  "cancellations: Alfa's R$ 1.000/mês",
);
ok(f.lost.deals === 1 && f.lost.dealsCents === 100000, "lost in the funnel: d6, R$ 1.000");
ok(
  f.pipeline.cents === 200000 && f.pipeline.weightedCents === 10000,
  `open pipeline R$ 2.000, weighted by the stage's probability: R$ 100 (${f.pipeline.cents}, ${f.pipeline.weightedCents})`,
);
const byNumber = Object.fromEntries(f.commissions.rows.map((c) => [c.clientName, c]));
ok(
  byNumber["Empresa Alfa"].commissionCents === 20000 &&
    byNumber["Empresa Alfa"].monthlyRule === "Padrão mensal" &&
    byNumber["Empresa Alfa"].sellerName === "Vitor",
  "Alfa (Vitor): 10% of R$ 2.000 = R$ 200 (default rule)",
);
const carla = byNumber["Clínica Carla"];
ok(
  carla.monthlyRule === "João tráfego" && carla.oneTimeRule === "Sites" && carla.commissionCents === 150000 + 20000,
  `Carla (João): 20% × 2.500 × 3 + 5% × 4.000 = R$ 1.700 (${carla.commissionCents})`,
);
ok(f.commissions.totalCents === 190000 && f.commissions.bySeller[0].sellerName === "João", "total R$ 1.900; João first");
ok(f.commissions.rows.length === 2, "the cancelled contract earns no commission");

// ---- per person ----
f = (await json(await joao.get(`${BASE}/api/crm/finance/?${range}&owner=all`))).body.finance;
ok(
  f.ownerId === "u-joao" && f.sold.cents === 650000 && f.commissions.totalCents === 170000 && f.active.contracts === 1,
  "the Comercial sees only his numbers, whatever he asks",
);
f = (await json(await vitor.get(`${BASE}/api/crm/finance/?${range}&owner=u-vitor`))).body.finance;
ok(f.sold.count === 0 && f.commissions.totalCents === 20000 && f.lost.deals === 1, "the Gestor filters by salesperson");
ok((await json(await maria.get(`${BASE}/api/crm/finance/?${range}`))).status === 403, "Marketing doesn't see the Financeiro (no contract values)");
ok((await json(await vitor.get(`${BASE}/api/crm/finance/?from=2026-13-01&to=${today}`))).status === 400, "invalid period refused");

// ---- exports ----
let res = await vitor.get(`${BASE}/api/crm/finance/export/?${range}&format=csv`);
const csv = await res.text();
ok(
  res.status() === 200 &&
    /text\/csv/.test(res.headers()["content-type"]) &&
    csv.includes("Financeiro comercial") &&
    csv.includes("Clínica Carla") &&
    csv.includes("1700,00"),
  "spreadsheet with the summary, commissions and charges",
);
res = await vitor.get(`${BASE}/api/crm/finance/export/?${range}&format=pdf`);
ok(res.status() === 200 && (await res.body()).subarray(0, 5).toString() === "%PDF-", "PDF");
ok((await json(await joao.get(`${BASE}/api/crm/finance/export/?${range}&format=csv`))).status === 403, "the Comercial doesn't export reports");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.report_export' AND target_id = 'financeiro'`)) === "2", "exports audited");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.commission_rule'`)) === "5", "rule changes audited");

await browser.close();
await closeDb();
console.log("FINANCE API PASSED");
