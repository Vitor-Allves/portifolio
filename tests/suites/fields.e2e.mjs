// Fase 1 · entrega 2 in the browser, on base + campaign fixtures: the stage
// dialog (Proposta asks service + value, Venda fechada asks the tabulação:
// result, negotiated value, reason and observation),
// the funnel card and filters, contact fields and follow-up, companies with
// CNPJ/situação/responsável, phone and dark theme.
import { BASE, go, launchBrowser, login, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];

// Serviços (Personalização) — filled in by the Administrador.
const { api: admin } = await login(browser, "admin", { open: false });
for (const label of ["Gestão de tráfego", "Social media"]) await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label } });

// A wide screen: the funnel has ten columns, and a drag needs both ends in view.
const { page: g } = await login(browser, "vitor", { errors, width: 1920 });
const board = (name) => g.getByRole("region", { name });
const card = (text) => g.locator("[role='button'][aria-label^='Abrir ']").filter({ hasText: text }).first();

// ---- funnel: drag to Proposta → the dialog asks service + value ----
await go(g, "Funil de vendas");
await card("d5").waitFor();
const reais = async () => Number(((await board("Proposta enviada").getByLabel("Total em Proposta enviada").textContent()) ?? "").replace(/\D/g, "") || 0);
const totalBefore = await reais();
await card("d5").dragTo(board("Proposta enviada"));
const dialog = g.getByRole("dialog", { name: /Ir para Proposta enviada/ });
await dialog.waitFor();
ok(await dialog.getByRole("button", { name: "Mover" }).isDisabled(), "Proposta: can't move before filling service and value");
ok(await dialog.getByText("Falta: serviço e valor estimado").isVisible(), "…and it says what's missing");
await dialog.getByLabel("Serviço da oportunidade").selectOption({ label: "Social media" });
await dialog.getByLabel("Valor estimado").fill("3.500");
await g.waitForTimeout(300);
await shot(g, "f1e2-dialogo-proposta");
await Promise.all([g.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/crm/deals/d5")), dialog.getByRole("button", { name: "Mover" }).click()]);
await board("Proposta enviada").locator("[aria-label^='Abrir ']").filter({ hasText: "d5" }).getByText("Social media").waitFor();
ok(true, "card moved to Proposta, showing the service");
let totalAfter = await reais();
for (let i = 0; i < 20 && totalAfter === totalBefore; i++) {
  await g.waitForTimeout(250);
  totalAfter = await reais();
}
ok(totalAfter - totalBefore === 3500, `column total grows by the new value (${totalBefore} → ${totalAfter})`);

// Cancel leaves the card where it was.
await card("d6").dragTo(board("Proposta enviada"));
await g.getByRole("dialog", { name: /Ir para Proposta enviada/ }).getByRole("button", { name: "Cancelar" }).click();
ok((await board("Em qualificação").locator("[aria-label^='Abrir ']").filter({ hasText: "d6" }).count()) === 1, "cancelling keeps the card in its column");

// ---- Venda fechada from the contact panel ----
await card("d5").click();
const panel = g.getByRole("dialog", { name: "Contato Eva Prado" });
await panel.getByLabel("Etapa da oportunidade").selectOption("ganho");
const wonDialog = g.getByRole("dialog", { name: /Venda fechada/ });
await wonDialog.waitFor();
ok((await wonDialog.getByLabel("Valor negociado").inputValue()) === "3.500", "Venda fechada: negotiated value starts from the estimate");
ok(await wonDialog.getByRole("button", { name: "Registrar venda" }).isDisabled(), "…can't confirm without the tabulação");
await wonDialog.getByLabel("Valor negociado").fill("3.200");
await wonDialog.getByLabel("Venda realizada").check();
await wonDialog.getByLabel("Confiança nos resultados apresentados").check();
ok(await wonDialog.getByText("Falta: observação").isVisible(), "…the observation is required too");
await wonDialog.getByLabel("Observações do fechamento").fill("plano anual");
await g.waitForTimeout(300);
await shot(g, "f1e2-dialogo-ganho");
await wonDialog.getByRole("button", { name: "Registrar venda" }).click();
await g.getByText("Conquista!").waitFor();
await panel.getByText("Venda realizada: Confiança nos resultados apresentados · plano anual").waitFor();
ok(await panel.getByText("encerrada por Vitor").isVisible(), "won with the tabulação, who closed it shown; celebration shown");
ok((await panel.getByText("R$ 3.200").count()) > 0, "panel shows the negotiated value");

// ---- contact fields (Detalhes) ----
await panel.getByRole("tab", { name: "Detalhes" }).click();
await panel.getByLabel("Temperatura").selectOption("quente");
await panel.getByLabel("Serviço de interesse").selectOption({ label: "Gestão de tráfego" });
await panel.getByLabel("Retorno previsto").fill("2026-01-10");
await panel.getByText("Decisor na empresa").click();
await panel.getByRole("button", { name: "Salvar dados" }).click();
await panel.getByText("Retorno 10/01/2026").waitFor();
ok((await panel.getByText("Quente", { exact: true }).count()) > 0 && (await panel.getByText("Decisor", { exact: true }).count()) > 0, "header shows temperature and decisor");
await panel.getByText(/Temperatura: vazio → Quente/).waitFor();
ok(true, "the change is in the history");
await shot(g, "f1e2-contato-detalhes");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// ---- contacts list ----
await go(g, "Contatos");
await g.getByLabel("Temperatura").selectOption("quente");
const rows = g.locator("table tbody tr");
for (let i = 0; i < 40 && (await rows.count()) !== 1; i++) await g.waitForTimeout(250);
ok((await rows.count()) === 1 && (await rows.first().getByText("Eva Prado").isVisible()), `filtered by temperature (${await rows.count()} rows: ${(await rows.allTextContents()).map((t) => t.slice(0, 30)).join(" | ")})`);
ok(await rows.first().getByText("Retorno 10/01/2026").isVisible(), "follow-up column shows the return date (overdue)");
ok(await rows.first().getByText(/^Última:/).isVisible(), "…and the last interaction");
await g.getByLabel("Temperatura").selectOption("");

// ---- funnel filters ----
await go(g, "Funil de vendas");
await g.getByLabel("Filtrar por temperatura").selectOption("quente");
const hot = await g.locator("[role='button'][aria-label^='Abrir ']").allTextContents();
ok(hot.length === 1 && hot[0].includes("Eva Prado"), `funnel filtered by temperature (contact's, inherited by the deal): ${JSON.stringify(hot.map((t) => t.slice(0, 40)))}`);
await g.getByLabel("Filtrar por temperatura").selectOption("all");
const before = await g.locator("[role='button'][aria-label^='Abrir ']").count();
await g.getByLabel("Filtrar por período").selectOption("7");
const after = await g.locator("[role='button'][aria-label^='Abrir ']").count();
ok(after < before, `period filter (entered in the last 7 days) narrows the board (${before} → ${after})`);
await g.getByLabel("Filtrar por período").selectOption("all");

// ---- companies ----
await go(g, "Empresas");
await g.getByRole("button", { name: "+ Nova empresa" }).click();
await g.getByLabel("Nome da empresa").fill("Clínica Sorriso");
await g.getByLabel("CNPJ").fill("11.222.333/0001-80");
await g.getByRole("button", { name: "Criar empresa" }).click();
await g.getByText(/CNPJ inválido/).waitFor();
ok(true, "invalid CNPJ refused on screen");
await g.getByLabel("CNPJ").fill("11.222.333/0001-81");
await g.getByRole("button", { name: "Criar empresa" }).click();
const co = g.getByRole("dialog", { name: "Empresa Clínica Sorriso" });
await co.waitFor();
await co.getByLabel("Razão social").fill("Sorriso Odontologia LTDA");
await co.getByLabel("Situação comercial").selectOption("cliente_ativo");
await co.getByLabel("Responsável pela conta").selectOption({ label: "João" });
await co.getByLabel("Estado").selectOption("SP");
await co.getByRole("button", { name: "Salvar empresa" }).click();
await co.getByText("Salvo").waitFor();
ok(await co.getByText("CNPJ 11.222.333/0001-81").isVisible(), "panel header shows the formatted CNPJ");
await co.getByLabel("Adicionar etiqueta").selectOption({ label: "Em negociação" });
await co.getByRole("button", { name: "Remover etiqueta Em negociação" }).waitFor();
ok(true, "company tag added");
await shot(g, "f1e2-empresa");
await co.getByRole("button", { name: "Fechar painel" }).click();
await g.getByLabel("Situação comercial").selectOption("cliente_ativo");
await g.waitForTimeout(800);
const crow = g.locator("table tbody tr").filter({ hasText: "Clínica Sorriso" });
const crowText = await g.locator("table tbody tr").allTextContents();
ok(
  crowText.length === 1 && (await crow.locator("td").nth(1).getByText("Cliente ativo").isVisible()) && (await crow.locator("td").nth(3).getByText("João").isVisible()),
  `list filtered by situação, with status and account owner (${JSON.stringify(crowText)})`
);

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Funil de vendas");
await p.locator("[role='button'][aria-label^='Abrir ']").filter({ hasText: "d6" }).first().click();
const pp = p.getByRole("dialog", { name: "Contato Ana Ribeiro" });
await pp.getByLabel("Etapa da oportunidade").selectOption("proposta");
const pd = p.getByRole("dialog", { name: /Ir para Proposta enviada/ });
await pd.waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "stage dialog: no horizontal scroll on the phone");
await shot(p, "f1e2-dialogo-celular-escuro");
await pd.getByRole("button", { name: "Cancelar" }).click();
await pp.getByRole("button", { name: "Fechar painel" }).click();
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Empresas");
await p.getByText("Clínica Sorriso").first().click();
await p.getByRole("dialog", { name: "Empresa Clínica Sorriso" }).waitFor();
await p.waitForTimeout(400);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "company panel: no horizontal scroll on the phone");
await shot(p, "f1e2-empresa-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("FIELDS E2E PASSED");
