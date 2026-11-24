// Fase 7 · entrega 2 in the browser, with a test-only AI key against the fake
// Anthropic API: the Painel's executive summary, the lead summary from the
// contact panel and the client's monthly report, each with the AI's reading
// apart from the CRM's data and the system's calculations; a Comercial sees
// the data and calculations but not the AI; phone and dark theme.
import { BASE, go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor')`);
const browser = await launchBrowser();
const errors = [];
const { page: g, api } = await login(browser, "vitor", { errors });
ok((await api.post(`${BASE}/api/crm/clients/`, { data: { companyId: "co-rib", status: "ativo", startedOn: "2026-09-01" } })).ok(), "client created");

async function generate(dialog, heading) {
  const ai = dialog.getByRole("region", { name: "Leitura da IA" });
  await ai.getByRole("button", { name: "Gerar leitura com IA" }).click();
  await ai.getByRole("heading", { name: heading }).waitFor();
  return ai;
}

// ---- Painel: executive summary ----
await g.getByRole("button", { name: "Resumo executivo" }).click();
const exec = g.getByRole("dialog", { name: "Resumo executivo do Painel" });
await exec.getByRole("region", { name: "Cálculos do sistema" }).getByText("Conversão").waitFor();
ok(await exec.getByRole("region", { name: "Dados do CRM" }).getByText("Por pessoa").isVisible(), "the CRM's data and the system's calculations, before any AI");
ok(await exec.getByText("30 análises restantes nas próximas 24 horas").isVisible(), "how many AI requests are left today");
const ai = await generate(exec, "Visão geral");
ok(await ai.getByText("Gerado por IA · Claude").isVisible() && (await ai.getByText(/Confira antes de usar ou enviar/).isVisible()), "the AI's reading is labelled as such");
ok(await ai.getByRole("heading", { name: "Recomendações" }).isVisible(), "…in the requested sections");
await shot(g, "f7e2-resumo-executivo");
await exec.getByRole("button", { name: "Fechar análise" }).click();

// ---- contact: lead summary ----
await go(g, "Contatos");
await g.getByRole("button", { name: "Ana Ribeiro" }).first().click();
const ana = g.getByRole("dialog", { name: "Contato Ana Ribeiro" });
await ana.getByRole("button", { name: "Resumo do lead" }).click();
const lead = g.getByRole("dialog", { name: "Resumo do lead: Ana Ribeiro" });
await lead.getByRole("region", { name: "Dados do CRM" }).getByText("Últimas mensagens do WhatsApp").waitFor();
await generate(lead, "Situação atual");
ok(await lead.getByRole("region", { name: "Leitura da IA" }).getByText("Leitura de teste para Resumo do lead: Ana Ribeiro.").first().isVisible(), "the lead's summary");
await lead.getByRole("button", { name: "Fechar análise" }).click();
ok(await ana.isVisible(), "closing it goes back to the contact");
await ana.getByRole("button", { name: "Fechar painel" }).click();

// ---- client: monthly report ----
await go(g, "Clientes ativos");
await g.getByRole("table", { name: "Clientes ativos" }).getByRole("button", { name: "Ribeiro Odonto" }).click();
const panel = g.getByRole("dialog", { name: "Cliente Ribeiro Odonto" });
await panel.getByRole("tab", { name: "Acompanhamento" }).click();
await panel.getByLabel("Mês de referência").selectOption("2026-10");
await panel.getByRole("button", { name: "Relatório do mês" }).click();
const report = g.getByRole("dialog", { name: "Relatório mensal: Ribeiro Odonto" });
await report.getByText("Indicadores de mídia de outubro de 2026").waitFor();
await generate(report, "Resumo do mês");
ok(await report.getByRole("heading", { name: "Próximas ações" }).isVisible(), "the client's monthly report draft");
await shot(g, "f7e2-relatorio-cliente");
await report.getByRole("button", { name: "Fechar análise" }).click();

// ---- Comercial: data, no AI ----
const { page: j } = await login(browser, "joao", { errors });
await j.getByRole("button", { name: "Resumo executivo" }).click();
const jx = j.getByRole("dialog", { name: "Resumo executivo do Painel" });
await jx.getByText("Seu perfil não usa o assistente de IA.").waitFor();
ok((await jx.getByRole("button", { name: "Gerar leitura com IA" }).count()) === 0 && (await jx.getByRole("region", { name: "Cálculos do sistema" }).isVisible()), "a Comercial gets the data and calculations, not the AI");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Resumo executivo" }).click();
const px = p.getByRole("dialog", { name: "Resumo executivo do Painel" });
await generate(px, "Visão geral");
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "phone: no horizontal scroll");
await shot(p, "f7e2-resumo-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("AI E2E PASSED");
