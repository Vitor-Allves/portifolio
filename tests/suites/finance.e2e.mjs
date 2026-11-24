// Evolução v1.0 · financeiro in the browser, on base + campaign fixtures: the
// Gestor opens Financeiro, sees the numbers of a client's contract, creates a
// commission rule and sees the commission; the Comercial sees only his
// numbers and can't manage rules; phone width and dark theme.
import { BASE, go, launchBrowser, login, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const { api: admin } = await login(browser, "admin", { open: false });
const trafego = (
  await (await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label: "Gestão de tráfego", meta: { billing: "mensal" } } })).json()
).option.id;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const { page: g, api: vitor } = await login(browser, "vitor", { errors, width: 1500 });
await vitor.post(`${BASE}/api/crm/companies/`, { data: { name: "Empresa Alfa" } });
const companies = await (await vitor.get(`${BASE}/api/crm/companies/?page=1&q=Alfa`)).json();
await vitor.post(`${BASE}/api/crm/clients/`, {
  data: {
    companyId: companies.rows[0].id,
    status: "ativo",
    contract: { services: [trafego], startsOn: `${today.slice(0, 7)}-01`, value: "3.000", billing: "mensal" },
  },
});

await go(g, "Financeiro");
const tiles = g.getByRole("region", { name: "Indicadores financeiros" });
await tiles.getByText("R$ 3.000/mês").waitFor();
ok(await tiles.getByText("1 contrato ativo hoje").isVisible(), "the active monthly revenue");
const rules = g.getByRole("region", { name: "Regras de comissão" });
await rules.getByRole("button", { name: "+ Nova regra" }).click();
const rf = rules.getByRole("form", { name: "Nova regra" });
await rf.getByLabel("Nome da regra").fill("Padrão mensal");
await rf.getByLabel("Modalidade da regra").selectOption("mensal");
await rf.getByLabel("Percentual da comissão").fill("10");
await rf.getByRole("button", { name: "Salvar regra" }).click();
await rules.getByText("10% · todos os vendedores · todos os serviços · mensalidades · 1 mensalidade").waitFor();
const com = g.getByRole("region", { name: "Comissões" });
await com.getByText("R$ 300", { exact: true }).waitFor();
ok(true, "a rule created; the commission (10% of R$ 3.000) shows");
await g.getByRole("region", { name: "Parcelas previstas" }).getByRole("button").first().click();
await g
  .getByText(/Empresa Alfa · contrato nº 0001 · mensalidade/)
  .first()
  .waitFor();
ok(true, "the month's charges open");
await shot(g, "ev7-financeiro");

// ---- Comercial ----
const { page: j } = await login(browser, "joao", { errors });
await go(j, "Financeiro");
await j.getByText("Seus números: vendas, contratos e comissões em que você é o responsável comercial.").waitFor();
ok(
  (await j.getByLabel("Vendedor").count()) === 0 && (await j.getByRole("button", { name: "+ Nova regra" }).count()) === 0,
  "the Comercial: his numbers, no salesperson filter, no rule editing",
);
await j.getByRole("region", { name: "Regras de comissão" }).getByText("Padrão mensal").waitFor();
ok(true, "…but reads the rules");

// ---- phone + dark ----
const { page: m } = await login(browser, "vitor", { errors, width: 390, height: 844, dark: true });
await m.getByRole("button", { name: "Abrir menu" }).click();
await go(m, "Financeiro");
await m.getByRole("region", { name: "Indicadores financeiros" }).getByText("R$ 3.000/mês").waitFor();
ok((await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal scroll on the phone");
await shot(m, "ev7-financeiro-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("FINANCE E2E PASSED");
process.exit(0);
