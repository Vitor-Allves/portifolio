// Evolução v1.0 · propostas in the browser, on base + campaign fixtures: the
// Administrador sets the discount limit and a template (Personalização →
// Propostas); the Comercial makes a proposal from Carla's opportunity, edits
// it, registers the sending; the client opens the link (phone width), approves
// it; the CRM shows the approval with its evidence, the versions and the list
// of proposals. Dark theme too.
import { BASE, go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
// Under `next dev`, the first visit to a page compiles it and may reload the pages already open: visit the public ones first.
for (const path of ["/proposta/aquecimento-aquecimento-aquecimento/", "/api/proposta/aquecimento-aquecimento-aquecimento/pdf/"]) await fetch(`${BASE}${path}`).catch(() => {});
await fetch(`${BASE}/api/proposta/aquecimento-aquecimento-aquecimento/view/`, { method: "POST", body: "{}" }).catch(() => {});
await fetch(`${BASE}/api/proposta/aquecimento-aquecimento-aquecimento/decision/`, { method: "POST", body: "{}" }).catch(() => {});
const { page: a, api: adminApi } = await login(browser, "admin", { errors });
for (const [label, meta] of [
  ["Gestão de tráfego", { referenceValue: "2.500", billing: "mensal", scope: "Google e Meta Ads, com relatório mensal" }],
  ["Site institucional", { referenceValue: "4.000", billing: "unico", scope: "Até 6 páginas" }],
]) {
  await adminApi.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label, meta } });
}

// ---- Administrador: Personalização → Propostas ----
await a.reload();
await a.getByRole("region", { name: "Indicadores do período" }).waitFor();
await go(a, "Personalização");
await a.getByRole("tab", { name: "Propostas" }).click();
await a.getByLabel("Desconto máximo (%)").fill("15");
await a.getByRole("region", { name: "Desconto máximo" }).getByRole("button", { name: "Salvar" }).click();
await a.getByText("Desconto máximo salvo.").waitFor();
await a.getByRole("button", { name: "+ Novo modelo" }).click();
const tf = a.getByRole("form", { name: "Novo modelo" });
await tf.getByLabel("Nome do modelo").fill("Crescimento digital");
await tf.getByLabel("Validade em dias").fill("10");
await tf.getByLabel("Gestão de tráfego").check();
await tf.getByLabel("Site institucional").check();
await tf.getByLabel("Apresentação do modelo").fill("Plano para gerar mais pacientes com tráfego pago e um site novo.");
await tf.getByLabel("Condições de pagamento do modelo").fill("Boleto todo dia 10. Site: 50% na aprovação, 50% na entrega.");
await shot(a, "ev5-modelo-proposta");
await tf.getByRole("button", { name: "Salvar modelo" }).click();
await a.getByRole("region", { name: "Modelos de proposta" }).getByText("Crescimento digital").waitFor();
ok((await sql(`SELECT value->>'pct' FROM crm_settings WHERE key = 'proposal_discount_limit'`)) === "15", "discount limit saved");
ok((await sql(`SELECT array_length(service_ids, 1) FROM crm_proposal_templates`)) === "2", "template saved with two services");

// ---- Comercial: a proposal from Carla's opportunity ----
const { page: j } = await login(browser, "joao", { errors, width: 1500 });
await go(j, "Funil de vendas");
await j.locator("[role='button'][aria-label^='Abrir ']").filter({ hasText: "d3" }).first().click();
const carla = j.getByRole("dialog", { name: "Contato Carla Dias" });
await carla.getByRole("tab", { name: "Negócio e tarefas" }).click();
const box = carla.getByRole("region", { name: "Propostas da oportunidade" });
await box.getByRole("button", { name: "+ Nova proposta" }).click();
await box.getByLabel("Modelo de proposta").selectOption({ label: "Crescimento digital" });
await box.getByRole("button", { name: "Criar proposta" }).click();
const panel = j.getByRole("dialog", { name: "Proposta nº 0001" });
await panel.waitFor();
ok(
  (await panel.getByLabel("Nome do serviço 1").inputValue()) === "Gestão de tráfego" &&
    (await panel.getByLabel("Valor unitário do serviço 2").inputValue()) === "4.000",
  "the template brought the services with their reference values",
);
await panel.getByLabel("Desconto do serviço 1").fill("10%");
await panel.getByLabel("Totais").getByText("R$ 6.250").waitFor();
ok(true, "totals follow the typing (R$ 2.250/mês + R$ 4.000 = R$ 6.250)");
await panel.getByRole("button", { name: "Salvar", exact: true }).click();
await panel.getByText("Salvo.").waitFor();
await shot(j, "ev5-proposta-edicao");
await panel.getByRole("button", { name: "Registrar envio" }).click();
await panel.getByLabel("Canal de envio").selectOption("whatsapp");
await panel.getByRole("form", { name: "Registrar envio" }).getByRole("button", { name: "Registrar envio" }).click();
await panel.getByText("Envio registrado.").waitFor();
await panel.getByText("Enviada", { exact: true }).first().waitFor();
const link = (await panel.getByText(/Link do cliente:/).textContent()).match(/https?:\/\/\S+\/proposta\/[A-Za-z0-9_-]+\//)?.[0];
ok(!!link, `the client's link is shown (${link})`);
await shot(j, "ev5-proposta-enviada");

// ---- the client, on the phone ----
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: process.env.CRM_TEST_SHOTS ? 2 : 1,
  userAgent: "Mozilla/5.0 (iPhone) Mobile Safari",
});
const c = await ctx.newPage();
c.on("pageerror", (e) => errors.push(`cliente: ${e.message}`));
await c.goto(link);
await c.getByText("Proposta nº 0001 · versão 1").waitFor();
for (let i = 0; i < 50 && (await sql(`SELECT status FROM crm_proposals WHERE number = 1`)) !== "visualizada"; i++) await c.waitForTimeout(200);
ok((await sql(`SELECT status FROM crm_proposals WHERE number = 1`)) === "visualizada", "opening the link in a browser marks it visualizada");
ok((await c.evaluate(() => document.documentElement.scrollWidth)) <= 390, "no horizontal scroll on the phone");
await shot(c, "ev5-cliente-proposta-celular");
await c.getByRole("button", { name: "Aprovar proposta" }).click();
const f = c.getByRole("form", { name: "Aprovar proposta" });
await f.getByLabel("Nome completo *").fill("Carla Dias");
await f.getByLabel("E-mail *").fill("carla@exemplo.com");
await f.getByLabel("CPF ou CNPJ (opcional)").fill("123.456.789-09");
ok(await f.getByRole("button", { name: "Confirmar aprovação" }).isDisabled(), "approving needs the 'li e aprovo' box");
await f.getByRole("checkbox").check();
await shot(c, "ev5-cliente-aprovar");
await f.getByRole("button", { name: "Confirmar aprovação" }).click();
await c.getByText("Obrigado! Sua aprovação foi registrada.").waitFor();
ok((await sql(`SELECT status FROM crm_proposals WHERE number = 1`)) === "aprovada", "approved");
await c.reload();
await c.getByText("Proposta aprovada").waitFor();
ok(await c.getByText(/Por Carla Dias em/).isVisible(), "reopening the link shows the approval");

// ---- back in the CRM ----
// (The dev server compiling the public page may reload open pages: start from a fresh one.)
await j.reload();
await j.getByRole("region", { name: "Indicadores do período" }).waitFor();
await go(j, "Propostas");
const row = j.getByRole("row", { name: "Proposta nº 0001" });
await row.getByText("Aprovada").waitFor();
ok(true, "Propostas lists it as approved");
await j.getByLabel("Situação da proposta").selectOption("enviada");
await j.getByText("Nenhuma proposta com esses filtros.", { exact: false }).waitFor();
await j.getByLabel("Situação da proposta").selectOption("");
await row.click();
const p2 = j.getByRole("dialog", { name: "Proposta nº 0001" });
const answers = p2.getByRole("region", { name: "Respostas do cliente" });
await answers.getByText(/Aprovada por Carla Dias · versão 1/).waitFor();
ok(
  (await answers.getByText(/carla@exemplo.com · documento 123.456.789-09/).isVisible()) && (await answers.getByText(/Código do conteúdo:/).isVisible()),
  "the evidence: e-mail, document, content code, IP and browser",
);
ok(
  (await p2.getByLabel("Título da proposta").isDisabled()) && (await p2.getByRole("button", { name: "Registrar envio" }).count()) === 0,
  "an approved proposal is read-only",
);
await shot(j, "ev5-proposta-aprovada-crm");
await p2.getByRole("tab", { name: "Histórico" }).click();
await p2
  .getByRole("list", { name: "Histórico da proposta" })
  .getByText(/Aprovada pelo cliente \(Carla Dias\)/)
  .waitFor();
ok(
  await p2
    .getByRole("list", { name: "Histórico da proposta" })
    .getByText(/Aberta pelo cliente/)
    .isVisible(),
  "timeline: sent, opened, approved",
);
await p2.getByRole("tab", { name: /Versões/ }).click();
ok(
  await p2
    .getByRole("listitem", { name: "Versão 1" })
    .getByText(/enviada em/)
    .isVisible(),
  "versions tab",
);
await p2.getByRole("button", { name: "Fechar proposta" }).click();

// ---- dark theme ----
const { page: d } = await login(browser, "vitor", { errors, dark: true });
await go(d, "Propostas");
await d.getByRole("row", { name: "Proposta nº 0001" }).waitFor();
await shot(d, "ev5-propostas-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("PROPOSALS E2E PASSED");
process.exit(0);
