// Evolução v1.0 · contratos e operação in the browser, on base + campaign
// fixtures: an approved proposal is formalized from its panel (sale, client,
// contract, onboarding); the client opens on its Operação tab — checklist,
// a deliverable, a satisfaction record — and the contract shows its number,
// origin proposal and details. Phone width too.
import { request } from "playwright";
import { BASE, go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const { api: admin } = await login(browser, "admin", { open: false });
const svc = async (label, meta) => (await (await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label, meta } })).json()).option.id;
const trafego = await svc("Gestão de tráfego", { referenceValue: "2.500", billing: "mensal" });
const site = await svc("Site institucional", { referenceValue: "4.000", billing: "unico" });

// An approved proposal on Carla's opportunity (João's), at her company.
const { page: j, api: joao } = await login(browser, "joao", { errors, width: 1500 });
await joao.patch(`${BASE}/api/crm/contacts/c3/`, { data: { company: "Clínica Carla" } });
const p1 = (await (await joao.post(`${BASE}/api/crm/proposals/`, { data: { dealId: "d3" } })).json()).id;
await joao.patch(`${BASE}/api/crm/proposals/${p1}/`, {
  data: {
    title: "Crescimento digital",
    items: [
      { serviceId: trafego, unitValue: "2.500" },
      { serviceId: site, unitValue: "4.000" },
    ],
  },
});
const token = (await (await joao.post(`${BASE}/api/crm/proposals/${p1}/send/`, { data: { channel: "email" } })).json()).token;
const anon = await request.newContext();
await anon.post(`${BASE}/api/proposta/${token}/decision/`, {
  data: { decision: "aprovar", name: "Carla Dias", email: "carla@x.com", accept: true, version: 1 },
});
await anon.dispose();

// ---- formalizing from the proposal ----
await j.reload();
await j.getByRole("region", { name: "Indicadores do período" }).waitFor();
await go(j, "Propostas");
await j.getByRole("row", { name: "Proposta nº 0001" }).click();
const panel = j.getByRole("dialog", { name: "Proposta nº 0001" });
await panel.getByRole("button", { name: "Formalizar contrato" }).click();
const form = panel.getByRole("form", { name: "Formalizar contrato" });
await form.getByLabel("Motivo do ganho").selectOption({ index: 1 });
await form.getByLabel("Prazo do contrato (meses)").fill("12");
await form.getByLabel("Dia de vencimento das cobranças").fill("10");
await form.getByLabel("Renovação do contrato").selectOption("automatica");
await form.getByLabel("Responsável operacional").selectOption({ label: "Vitor" });
await form.getByLabel("Regras de cancelamento do contrato").fill("Aviso prévio de 30 dias.");
await shot(j, "ev6-formalizar");
await form.getByRole("button", { name: "Registrar venda e gerar contrato" }).click();
await panel.getByText("Formalizada: contrato nº 0001.").waitFor();
ok((await sql(`SELECT stage FROM crm_deals WHERE id = 'd3'`)) === "ganho", "formalized: the sale is registered");
await panel.getByRole("button", { name: "Abrir cliente" }).click();

// ---- the client: Operação ----
const cl = j.getByRole("dialog", { name: "Cliente Clínica Carla" });
await cl.waitFor();
await cl.getByRole("tab", { name: "Operação" }).click();
const onb = cl.getByRole("region", { name: "Onboarding" });
await onb.getByText("Reunião inicial").waitFor();
ok((await onb.getByRole("checkbox").count()) === 8, "the 8-item onboarding checklist");
await onb.getByRole("checkbox").first().check();
await onb.getByText("· 1 de 8").waitFor();
ok(true, "checking an item updates the progress");
const del = cl.getByRole("region", { name: "Entregáveis" });
await del.getByRole("button", { name: "+ Novo entregável" }).click();
const df = del.getByRole("form", { name: "Novo entregável" });
await df.getByLabel("Entregável", { exact: true }).fill("Relatório de campanhas de dezembro");
await df.getByLabel("Responsável pelo entregável").selectOption({ label: "Vitor" });
await df.getByLabel("Prazo do entregável").fill("2027-01-10");
await df.getByRole("button", { name: "Salvar entregável" }).click();
await del.getByRole("listitem", { name: "Entregável Relatório de campanhas de dezembro" }).waitFor();
const sat = cl.getByRole("region", { name: "Satisfação" });
await sat.getByLabel("Nota de satisfação (0 a 10)").selectOption("9");
await sat.getByLabel("Comentário de satisfação").fill("Gostou do onboarding");
await sat.getByRole("button", { name: "Registrar" }).click();
await sat.getByText("média 9 de 10", { exact: false }).waitFor();
ok(true, "deliverable and satisfaction recorded");
await shot(j, "ev6-cliente-operacao");

// ---- the contract's details ----
await cl.getByRole("tab", { name: "Cliente" }).click();
await cl.getByText("Contrato nº 0001 · proposta nº 0001").waitFor();
await cl.getByRole("button", { name: "Detalhes do contrato nº 0001" }).click();
const dl = cl.getByLabel("Detalhes do contrato 0001");
await dl.getByText("Renovação automática").waitFor();
ok(
  (await dl.getByText("12 meses").isVisible()) &&
    (await dl.getByText("todo dia 10").isVisible()) &&
    (await dl.getByText("Aviso prévio de 30 dias.").isVisible()),
  "term, due day and cancellation rules shown",
);
ok((await cl.getByRole("link", { name: "Gerar contrato (PDF)" }).getAttribute("href")).endsWith("/pdf/"), "the contract PDF is one click away");
await shot(j, "ev6-contrato-detalhes");

// ---- phone ----
const { page: m } = await login(browser, "joao", { errors, width: 390, height: 844 });
await m.getByRole("button", { name: "Abrir menu" }).click();
await go(m, "Clientes ativos");
await m.getByText("Clínica Carla").first().click();
const mcl = m.getByRole("dialog", { name: "Cliente Clínica Carla" });
await mcl.getByRole("tab", { name: "Operação" }).click();
await mcl.getByRole("region", { name: "Onboarding" }).getByText("Reunião inicial").waitFor();
ok((await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal scroll on the phone");
await shot(m, "ev6-operacao-celular");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("OPERATIONS E2E PASSED");
process.exit(0);
