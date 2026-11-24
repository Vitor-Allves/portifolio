// Evolução v1.0 · funil e tabulação in the browser, on base + campaign
// fixtures: the stages in Personalização (probability), the ten columns on
// the board, closing as an oportunidade futura through the tabulação dialog
// (and its pick-up task), reopening with a justification, and the
// Relatórios → Tabulação comercial screen for a Gestor and a Comercial; phone
// and dark theme.
import { BASE, go, launchBrowser, login, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];

// ---- Administrador: Etapas do funil ----
const { page: a } = await login(browser, "admin", { errors });
await go(a, "Personalização");
await a.getByRole("tab", { name: "Etapas do funil" }).click();
const list = a.getByRole("list", { name: "Etapas do funil" });
await list.getByText("Em negociação", { exact: true }).waitFor();
ok(await list.getByText("70% de probabilidade", { exact: false }).first().isVisible(), "each stage shows its probability");
ok((await a.getByRole("button", { name: "Arquivar Novo lead" }).count()) === 0 && (await a.getByRole("button", { name: "Arquivar Venda fechada" }).count()) === 0, "fixed stages can't be archived");
await a.getByRole("button", { name: "Editar Em negociação" }).click();
await a.getByLabel("Probabilidade de Em negociação").fill("75");
await a.getByRole("button", { name: "Salvar" }).click();
await a.getByText("Alteração salva.").waitFor();
await list.getByText("75% de probabilidade", { exact: false }).waitFor();
ok(true, "Administrador changes a stage's probability");
await a.getByRole("tab", { name: "Motivos de encerramento" }).click();
const reasons = a.getByRole("list", { name: "Motivos de encerramento" });
await reasons.getByText("Contato inválido", { exact: true }).waitFor();
ok(await reasons.getByText("Sem conversão ·", { exact: false }).first().isVisible(), "each closing reason shows its group");
await shot(a, "ev1-etapas-personalizacao");

// ---- Gestor: the board, the tabulação, reopening ----
const { page: g, api } = await login(browser, "vitor", { errors, width: 1600 });
await go(g, "Funil de vendas");
for (const name of ["Novo lead", "Primeiro contato", "Em qualificação", "Diagnóstico realizado", "Proposta em elaboração", "Proposta enviada", "Em negociação", "Aguardando aprovação", "Venda fechada", "Venda perdida"])
  await g.getByRole("region", { name, exact: true }).waitFor({ state: "attached" });
ok(true, "the board has the ten columns");
ok(await g.getByRole("region", { name: "Em negociação", exact: true }).getByTitle("Probabilidade de fechamento em Em negociação").textContent() === "75%", "a column shows its stage's probability");
await shot(g, "ev1-funil-dez-etapas");

const card = g.locator("[role='button'][aria-label^='Abrir ']").filter({ hasText: "d6" }).first();
await card.click();
const panel = g.getByRole("dialog", { name: "Contato Ana Ribeiro" });
await panel.getByLabel("Oportunidade", { exact: true }).selectOption({ label: "d6 · Em qualificação" });
await panel.getByLabel("Etapa da oportunidade").selectOption("perdido");
const lost = g.getByRole("dialog", { name: /Encerrar sem venda/ });
await lost.waitFor();
ok(await lost.getByRole("button", { name: "Encerrar" }).isDisabled(), "can't close without the tabulação");
await lost.getByText("Oportunidade futura", { exact: true }).click();
await lost.getByLabel("Motivo do encerramento").selectOption({ label: "Retomar em data programada" });
ok((await lost.getByLabel("Motivo do encerramento").locator("option").allTextContents()).every((t) => !/Contato inválido|Perda por preço/.test(t)), "only the group's reasons are offered");
await lost.getByLabel("Retomar em").fill("2027-03-02");
await lost.getByLabel("Observações do encerramento").fill("Orçamento aprovado só no próximo ano");
await shot(g, "ev2-dialogo-tabulacao");
await lost.getByRole("button", { name: "Encerrar" }).click();
await panel.getByText("Oportunidade futura: Retomar em data programada · retomar em 02/03/2027", { exact: false }).waitFor();
ok(await panel.getByText("encerrada por Vitor").isVisible(), "the tabulação and who closed it show on the opportunity");
await panel.getByRole("tab", { name: "Negócio e tarefas" }).click();
await panel.getByText("Retomar: d6").first().waitFor();
ok(true, "the pick-up task is on the contact");

await panel.getByLabel("Etapa da oportunidade").selectOption("conversa");
const reopen = g.getByRole("dialog", { name: /Reabrir oportunidade/ });
await reopen.waitFor();
ok(await reopen.getByRole("button", { name: "Reabrir" }).isDisabled(), "reopening needs the justification");
await reopen.getByLabel("Justificativa da reabertura").fill("Cliente ligou antes do prazo");
await reopen.getByRole("button", { name: "Reabrir" }).click();
await panel.getByRole("tab", { name: "Detalhes e histórico" }).click();
await panel.getByText(/reaberta: Cliente ligou antes do prazo/).first().waitFor();
ok((await panel.getByLabel("Etapa da oportunidade").inputValue()) === "conversa", "reopened, with the justification in the history");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// João closes his own as sem conversão (through the API) so today has more than one group.
const { api: jApi } = await login(browser, "joao", { open: false });
ok((await jApi.patch(`${BASE}/api/crm/deals/d3/`, { data: { stage: "perdido", lostReason: "sem_interesse", lostNote: "Não quis seguir" } })).ok(), "João closes d3");

// ---- Relatórios → Tabulação comercial ----
await go(g, "Relatórios");
const rep = g.getByRole("region", { name: "Tabulação comercial" });
await rep.getByRole("group", { name: "Encerramentos por grupo" }).waitFor();
await rep.getByRole("table", { name: "Oportunidades encerradas" }).getByRole("button", { name: "d3" }).waitFor();
ok(await rep.getByText("1 reaberta", { exact: false }).isVisible(), "this month: the reopening is counted");
ok(await rep.getByRole("table", { name: "Encerramentos por motivo" }).getByText("Sem interesse").isVisible(), "by reason");
ok(await rep.getByRole("table", { name: "Encerramentos por vendedor" }).getByRole("rowheader", { name: "João" }).isVisible(), "by seller");
ok((await rep.getByRole("link", { name: "Baixar PDF" }).getAttribute("href"))?.includes("format=pdf"), "PDF and planilha to download");
await rep.getByLabel("Período").selectOption("mes_passado");
await rep.getByRole("table", { name: "Oportunidades encerradas" }).getByRole("button", { name: "d2" }).waitFor();
ok(await rep.getByRole("table", { name: "Encerramentos por motivo" }).getByText("Fechamento com concorrente").isVisible(), "October: the loss to a competitor");
await rep.getByRole("button", { name: /Perda comercial/ }).click();
await g.waitForTimeout(600);
ok((await rep.getByRole("table", { name: "Oportunidades encerradas" }).getByRole("button").count()) === 1, "clicking a group filters by it");
await shot(g, "ev2-relatorio-tabulacao");
await rep.getByRole("table", { name: "Oportunidades encerradas" }).getByRole("button", { name: "d2" }).click();
await g.getByRole("dialog", { name: "Contato Bruno Souza" }).waitFor();
ok(true, "a closing opens its contact");

// ---- Comercial: own numbers, no export ----
const { page: j } = await login(browser, "joao", { errors });
await go(j, "Relatórios");
const jrep = j.getByRole("region", { name: "Tabulação comercial" });
await jrep.getByRole("table", { name: "Oportunidades encerradas" }).getByRole("button", { name: "d3" }).waitFor();
ok((await jrep.getByLabel("Vendedor", { exact: true }).count()) === 0 && (await jrep.getByRole("link", { name: "Baixar PDF" }).count()) === 0, "a Comercial sees only their own, without export");
ok((await jrep.getByRole("table", { name: "Oportunidades encerradas" }).getByRole("button", { name: "d6" }).count()) === 0, "…not Vitor's");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Relatórios");
await p.getByRole("region", { name: "Tabulação comercial" }).getByRole("group", { name: "Encerramentos por grupo" }).waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "phone: no horizontal scroll on the report");
await shot(p, "ev2-relatorio-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("FUNNEL E2E PASSED");
