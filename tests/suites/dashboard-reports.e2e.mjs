// Fase 6 · entrega 1 in the browser, on base + campaign fixtures: the Painel's
// new filters, the "Agora" row, clicking a number to see its records and
// opening one, CSV export only for who may export, phone and dark theme.
import { launchBrowser, login, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
async function october(p) {
  await p.getByLabel("Período", { exact: true }).selectOption("custom");
  await p.getByLabel("Data inicial").fill("2026-10-01");
  await p.getByLabel("Data final").fill("2026-10-31");
  await p.getByText(/comparado com 31\/08 a 30\/09/).waitFor();
  await p.waitForTimeout(400);
}
const tile = (p, region, label) => p.getByRole("region", { name: region }).getByRole("button", { name: new RegExp(`^${label}: `) });

const { page: g } = await login(browser, "vitor", { errors });
await october(g);
ok((await tile(g, "Indicadores do período", "Novos leads").getAttribute("aria-label")) === "Novos leads: 4. Ver os registros", "Novos leads: 4, clickable");
ok(await g.getByRole("link", { name: "Exportar CSV" }).isVisible(), "the Gestor can export the Painel");
const agora = g.getByRole("region", { name: "Agora" });
ok(await agora.getByRole("button", { name: /^Oportunidades abertas: 3/ }).isVisible() && (await agora.getByRole("button", { name: /^Oportunidades paradas: / }).isVisible()), "Agora: open and stalled opportunities");
ok(await g.getByText("Faturamento emitido e valor recebido não são controlados pelo CRM.", { exact: false }).isVisible(), "the Painel says what it doesn't measure");

// ---- click a number, open a record ----
await tile(g, "Indicadores do período", "Ganhos").click();
const list = g.getByRole("dialog", { name: "Negócios ganhos no período" });
await list.getByText("1 registro").waitFor();
ok(await list.getByRole("link", { name: "Exportar CSV" }).isVisible(), "the list can be exported");
await shot(g, "f6e1-lista-indicador");
await list.getByRole("button", { name: /d1.*Ana Ribeiro/ }).click();
await g.getByRole("dialog", { name: "Contato Ana Ribeiro" }).waitFor();
ok(true, "the record opens the contact");
await g.getByRole("dialog", { name: "Contato Ana Ribeiro" }).getByRole("button", { name: "Fechar painel" }).click();

// ---- filters ----
await g.getByLabel("Origem", { exact: true }).selectOption({ label: "Indicação" });
await g.waitForFunction(() => document.querySelector('[aria-label^="Novos leads: "]')?.getAttribute("aria-label") === "Novos leads: 1. Ver os registros");
ok(true, "origem Indicação: 1 new lead");
await g.getByLabel("Origem", { exact: true }).selectOption("all");
await g.getByLabel("Etapa", { exact: true }).selectOption("proposta");
await g.getByText("a etapa vale para o funil e as oportunidades abertas e paradas", { exact: false }).waitFor();
await g.waitForFunction(() => document.querySelector('[aria-label^="Oportunidades abertas: "]')?.getAttribute("aria-label")?.startsWith("Oportunidades abertas: 1."));
ok(true, "etapa Proposta: 1 open, with a note on what the stage filters");
await g.getByLabel("Etapa", { exact: true }).selectOption("all");
await tile(g, "Agora", "Follow-ups e tarefas atrasados").click();
await g.getByRole("dialog", { name: "Tarefas e follow-ups atrasados" }).getByText("1 registro").waitFor();
await g.getByRole("dialog", { name: "Tarefas e follow-ups atrasados" }).getByRole("button", { name: "Fechar lista" }).click();
await shot(g, "f6e1-painel");

// ---- Comercial: no export ----
const { page: j } = await login(browser, "joao", { errors });
await october(j);
ok((await j.getByRole("link", { name: "Exportar CSV" }).count()) === 0, "a Comercial has no export");
ok((await j.getByRole("region", { name: "Desempenho das campanhas" }).count()) === 0, "…nor the campaigns block");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await october(p);
await tile(p, "Indicadores do período", "Novos leads").click();
await p.getByRole("dialog", { name: "Leads cadastrados no período" }).getByText("4 registros").waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "the list on the phone: no horizontal scroll");
await shot(p, "f6e1-lista-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("DASHBOARD REPORTS E2E PASSED");
