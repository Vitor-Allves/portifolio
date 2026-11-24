// Fase 3 · entrega 2 in the browser, on base + campaign fixtures: the
// Automações screen (ten rules, all available since Fase 5, turn on, adjust, run
// the daily check now, history with a link to the contact), a notice in the
// bell opening the lead, the Auditoria line, phone and dark theme.
import { BASE, go, launchBrowser, login, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const { page: a, api } = await login(browser, "admin", { errors });

await go(a, "Automações");
await a.getByRole("heading", { level: 1, name: "Automações" }).waitFor();
const list = a.getByRole("list", { name: "Lista de automações" });
await list.getByRole("region", { name: "Novo lead: tarefa de primeiro contato" }).waitFor();
ok((await list.getByRole("listitem").count()) === 16, "the sixteen rules (ten of Fase 3, six of the evolução)");
ok((await list.getByText("Disponível na Fase 5 (clientes ativos)").count()) === 0, "7, 8 and 9 can be turned on (Fase 5 is here)");
ok(await a.getByText(/ainda não agendada no servidor/).isVisible(), "says the daily check isn't scheduled yet (no CRON_SECRET here)");
ok(
  (await list.getByText("Desativada", { exact: true }).count()) === 14 && (await list.getByText("Ativa", { exact: true }).count()) === 2,
  "everything starts off, except the two notices the CRM already gave (transfer requested, proposal approved)"
);

// ---- turn on "Novo lead", adjust "Proposta enviada" ----
const novo = list.getByRole("region", { name: "Novo lead: tarefa de primeiro contato" });
await novo.getByRole("radiogroup", { name: /^Situação de / }).getByRole("radio", { name: "Ativar", exact: true }).click();
await novo.getByText("Ativa", { exact: true }).waitFor();
ok(true, "turned on");
const proposta = list.getByRole("region", { name: "Proposta enviada: follow-up" });
await proposta.getByRole("button", { name: "Ajustar" }).click();
const form = proposta.getByRole("form", { name: "Ajustar Proposta enviada: follow-up" });
await form.getByLabel("Prazo em dias").fill("5");
await form.getByLabel("Prioridade").selectOption({ label: "Alta" });
await shot(a, "f3e2-ajustar");
await form.getByRole("button", { name: "Salvar ajustes" }).click();
await proposta.getByText("Tarefa para 5 dias depois").waitFor();
ok(true, "deadline adjusted and shown");

// ---- a new lead: the run is in the history, the contact opens from it ----
const created = await api.post(`${BASE}/api/crm/contacts/`, { data: { name: "Lia Automática", phone: "15990002001", ownerId: "u-joao" } });
ok(created.status() === 201, "a new lead (for João)");
await a.reload();
await go(a, "Automações");
const history = a.getByRole("region", { name: "Histórico de execuções" });
const row = history.locator("tbody tr").filter({ hasText: "Lia Automática" });
await row.getByText(/Tarefa "Primeiro contato" para João/).waitFor();
ok(true, "history: what it did and for whom");
await row.getByRole("button", { name: "Lia Automática" }).click();
const panel = a.getByRole("dialog", { name: "Contato Lia Automática" });
await panel.getByRole("tab", { name: "Negócio e tarefas" }).click();
await panel.getByRole("button", { name: "Detalhes: Primeiro contato" }).waitFor();
ok(true, "the lead opens from the history, with its first-contact task");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// ---- the daily check, now ----
const stalled = list.getByRole("region", { name: "Lead sem movimentação: alerta" });
await stalled.getByRole("radio", { name: "Ativar", exact: true }).click();
await stalled.getByText("Ativa", { exact: true }).waitFor();
await stalled.getByRole("button", { name: "Rodar agora" }).click();
await a.getByText(/"Lead sem movimentação: alerta": \d+ (ação feita|ações feitas)/).waitFor();
await stalled.getByText(/Última verificação: \d{2}\/\d{2}/).waitFor();
ok(true, "Rodar agora runs the check and shows when");
await history.getByLabel("Automação").selectOption("lead_sem_movimentacao");
await history.locator("tbody tr").filter({ hasText: "Lead parado" }).or(history.locator("tbody tr").filter({ hasText: "alerta para" })).first().waitFor();
ok(true, "history filtered by automation");
await shot(a, "f3e2-automacoes");

// ---- a notice in the bell opens the lead ----
await list.getByRole("region", { name: "Lead atribuído: avisar o responsável" }).getByRole("radio", { name: "Ativar", exact: true }).click();
await list.getByRole("region", { name: "Lead atribuído: avisar o responsável" }).getByText("Ativa", { exact: true }).waitFor();
ok((await api.patch(`${BASE}/api/crm/contacts/c5/`, { data: { ownerId: "u-vitor" } })).ok(), "Eva goes to Vitor");
const { page: v } = await login(browser, "vitor", { errors });
await v.getByRole("button", { name: /^Lembretes: \d+ novos?$/ }).click();
const bell = v.getByRole("dialog", { name: "Lembretes" });
await bell.getByRole("region", { name: "Avisos" }).getByText("Novo lead para você: Eva Prado").waitFor();
await shot(v, "f3e2-aviso-no-sino");
await bell.getByText("Novo lead para você: Eva Prado").click();
await v.getByRole("dialog", { name: "Contato Eva Prado" }).waitFor();
ok(true, "the notice opens the lead");
await v.getByRole("dialog", { name: "Contato Eva Prado" }).getByRole("button", { name: "Fechar painel" }).click();
await v.getByRole("button", { name: /^Lembretes/ }).click();
ok(!(await v.getByRole("dialog", { name: "Lembretes" }).getByText("Novo lead para você: Eva Prado").isVisible()), "…and is marked read");
await v.keyboard.press("Escape");
ok((await v.getByRole("navigation", { name: "Seções do CRM" }).getByRole("button", { name: /^Automações/ }).count()) === 0, "a Gestor doesn't see Automações");

// ---- Auditoria ----
await go(a, "Auditoria");
await a.getByLabel("Ação", { exact: true }).selectOption("crm.automation_change");
await a.locator("tbody").getByText(/desativada → ativa/).first().waitFor();
ok(true, "turning a rule on is in the Auditoria");

// ---- phone + dark ----
const { page: p } = await login(browser, "admin", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Automações");
await p.getByRole("list", { name: "Lista de automações" }).getByRole("region", { name: "Proposta enviada: follow-up" }).getByRole("button", { name: "Ajustar" }).click();
await p.waitForTimeout(300);
const wide = await p.evaluate(() =>
  [...document.querySelectorAll("body *")]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.closest(".overflow-x-auto"))
    .slice(0, 3)
    .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right)}px`)
);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, `Automações: no horizontal scroll on the phone (${wide.join(" | ")})`);
await shot(p, "f3e2-automacoes-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("AUTOMATIONS E2E PASSED");
