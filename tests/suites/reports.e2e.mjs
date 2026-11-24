// Evolução v1.0 · Relatórios in the browser, on base + campaign fixtures:
// the Gestor picks reports (vendas por vendedor, vendas por período with the
// row opening the lead, contratos with a client), sees the summary, the
// totals and the downloads; the Comercial sees only his and no downloads;
// phone width and dark theme.
import { BASE, go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const addDays = (d, n) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

const { page: g, api: vitor } = await login(browser, "vitor", { errors, width: 1500 });
await sql(`INSERT INTO crm_options (kind, id, label, sort) VALUES ('service', 'trafego', 'Gestão de tráfego', 1)`);
await vitor.post(`${BASE}/api/crm/companies/`, { data: { name: "Empresa Alfa" } });
const co = await sql(`SELECT id FROM crm_companies WHERE name = 'Empresa Alfa'`);
await vitor.post(`${BASE}/api/crm/clients/`, {
  data: {
    companyId: co,
    status: "ativo",
    contract: { services: ["trafego"], startsOn: `${today.slice(0, 7)}-01`, endsOn: addDays(today, 10), value: "2.000", billing: "mensal" },
  },
});

await go(g, "Relatórios");
const pick = async (page, label) => {
  await page.getByLabel("Relatório", { exact: true }).selectOption({ label });
  await page.getByRole("region", { name: label }).waitFor();
};
const october = async (page, region) => {
  await region.getByLabel("Período").selectOption("custom");
  await region.getByLabel("Data inicial").fill("2026-10-01");
  await region.getByLabel("Data final").fill("2026-10-31");
};

await pick(g, "Vendas por vendedor");
let region = g.getByRole("region", { name: "Vendas por vendedor" });
await october(g, region);
const table = region.getByRole("table", { name: "Vendas por vendedor: detalhe" });
await table.locator("tfoot").getByText("50%").waitFor();
ok(await table.getByRole("row", { name: /^Vitor 1 R\$\s?5\.000,00/ }).isVisible(), "vendas por vendedor: Vitor's sale and the totals line");
ok(
  (await region.getByRole("link", { name: "Baixar planilha" }).isVisible()) && (await region.getByRole("link", { name: "Baixar PDF" }).isVisible()),
  "planilha and PDF",
);
await shot(g, "ev9-relatorio-vendedores");

await pick(g, "Vendas por período");
region = g.getByRole("region", { name: "Vendas por período" });
await october(g, region);
await region.getByRole("group", { name: "Resumo do relatório" }).getByText("R$ 5.000,00").first().waitFor();
await region.getByRole("table").getByRole("button", { name: "d1" }).click();
await g.getByRole("dialog", { name: /Ana Ribeiro/ }).waitFor();
ok(true, "a sale opens its lead");
await g.keyboard.press("Escape");

await pick(g, "Contratos próximos do vencimento");
region = g.getByRole("region", { name: "Contratos próximos do vencimento" });
await region.getByRole("table").getByText("10 d").waitFor();
await region.getByLabel("Vencem em").selectOption("15");
ok(await region.getByRole("button", { name: "Empresa Alfa" }).isVisible(), "the contract ending in 10 days, with its client");
await region.getByRole("button", { name: "Empresa Alfa" }).click();
await g.getByRole("dialog", { name: /Empresa Alfa/ }).waitFor();
ok(true, "…which opens the client");
await shot(g, "ev9-relatorio-contratos");

// ---- the Comercial ----
const { page: j } = await login(browser, "joao", { errors });
await go(j, "Relatórios");
await pick(j, "Vendas por vendedor");
region = j.getByRole("region", { name: "Vendas por vendedor" });
await region.getByText("Seus números: o relatório mostra o que é seu.").waitFor();
ok(
  (await region.getByLabel("Vendedor", { exact: true }).count()) === 0 && (await region.getByRole("link", { name: "Baixar planilha" }).count()) === 0,
  "the Comercial: his numbers, no salesperson filter, no downloads",
);
ok((await j.getByLabel("Relatório", { exact: true }).locator("option", { hasText: "Resultados das campanhas" }).count()) === 0, "…and no campaign report");

// ---- phone + dark ----
const { page: m } = await login(browser, "vitor", { errors, width: 390, height: 844, dark: true });
await m.getByRole("button", { name: "Abrir menu" }).click();
await go(m, "Relatórios");
await pick(m, "Funil comercial");
await m.getByRole("region", { name: "Funil comercial" }).getByRole("table").waitFor();
ok((await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal scroll on the phone");
await shot(m, "ev9-relatorio-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("REPORTS E2E PASSED");
process.exit(0);
