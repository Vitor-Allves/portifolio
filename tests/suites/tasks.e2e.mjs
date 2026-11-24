// Fase 3 · entrega 1 in the browser, on base + campaign fixtures: the
// agenda in day / week / month with type colors, the task form (internal
// activity, on a contact, on a company), situação and history, the
// Tarefas filters, the reminders bell, colors and priorities in
// Personalização, phone and dark theme.
import { BASE, go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const spDay = (ms) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
const tomorrow = spDay(Date.now() + 86_400_000);

const { page: g, api } = await login(browser, "vitor", { errors }); // Gestor

// ---- Agenda: week, month, day ----
await go(g, "Agenda");
await g.getByText(/Semana de/).waitFor();
await g.getByRole("tab", { name: "Mês" }).click();
await g.getByRole("heading", { level: 2, name: / de \d{4}$/ }).waitFor();
ok((await g.locator("section[aria-label^='Dia ']").count()) >= 28, "month view: the whole weeks of the month");
await g.getByRole("tab", { name: "Dia", exact: true }).click();
await g.getByText("Nada marcado para este dia.").or(g.getByRole("list", { name: /^Tarefas de / })).first().waitFor();
ok(true, "day view");

// ---- a new internal activity, tomorrow ----
await g.getByRole("button", { name: "Próximo dia" }).click();
await g.getByRole("button", { name: "+ Nova tarefa" }).click();
let dlg = g.getByRole("dialog", { name: "Nova tarefa" });
await dlg.getByRole("radio", { name: "Atividade interna" }).click();
await dlg.getByLabel("Título", { exact: true }).fill("Planejar a semana");
await dlg.getByLabel("Tipo", { exact: true }).selectOption({ label: "Reunião" });
await dlg.getByLabel("Prioridade", { exact: true }).selectOption({ label: "Alta" });
ok((await dlg.getByLabel("Data", { exact: true }).inputValue()) === tomorrow, "the form starts on the day being viewed");
await dlg.getByLabel("Horário", { exact: true }).fill("09:00");
await dlg.getByLabel("Lembrete", { exact: true }).selectOption({ label: "1 hora antes" });
await dlg.getByLabel("Descrição", { exact: true }).fill("Metas e funil da semana");
await shot(g, "f3e1-nova-tarefa");
await dlg.getByRole("button", { name: "Criar tarefa" }).click();
await dlg.waitFor({ state: "detached" });
const dayList = g.getByRole("list", { name: /^Tarefas de / });
await dayList.getByRole("button", { name: "Planejar a semana" }).waitFor();
ok(await dayList.getByText("Atividade interna").isVisible(), "listed on the day as an internal activity");
ok(await dayList.getByText("Alta").isVisible(), "…with its priority");
await shot(g, "f3e1-agenda-dia");

// ---- open it: history, situação ----
await dayList.getByRole("button", { name: "Planejar a semana" }).click();
dlg = g.getByRole("dialog", { name: "Tarefa Planejar a semana" });
await dlg.getByText("Criou a tarefa").waitFor();
ok(await dlg.getByText("Atividade interna (sem contato nem empresa).").isVisible(), "the form says what it's about");
ok((await dlg.getByLabel("Lembrete", { exact: true }).inputValue()) === "60", "…and keeps the reminder");
await dlg.getByLabel("Situação", { exact: true }).selectOption({ label: "Em andamento" });
await dlg.getByRole("button", { name: "Salvar tarefa" }).click();
await dlg.waitFor({ state: "detached" });
await dayList.getByText("Em andamento").waitFor();
await dayList.getByRole("button", { name: "Planejar a semana" }).click();
await dlg.getByText("Pendente → Em andamento").waitFor();
ok(true, "situação change in the task's history");
await dlg.getByRole("button", { name: "Fechar tarefa" }).click();

// ---- week and month show it in the type's color ----
await g.getByRole("tab", { name: "Semana" }).click();
const weekItem = g.getByRole("button", { name: "09:00 Planejar a semana (Reunião)" });
await weekItem.waitFor();
ok(((await weekItem.getAttribute("class")) ?? "").includes("border-l-crm-violet"), "week: Reunião in its color (roxo)");
await shot(g, "f3e1-agenda-semana");
await g.getByRole("tab", { name: "Mês" }).click();
await g.getByRole("button", { name: "09:00 Planejar a semana (Reunião)" }).waitFor();
ok(true, "month: there too");
await g.getByLabel("Tipo de tarefa").selectOption({ label: "Ligação" });
await g.getByRole("button", { name: "09:00 Planejar a semana (Reunião)" }).waitFor({ state: "detached" });
ok(true, "filter by type");
await g.getByLabel("Tipo de tarefa").selectOption("");
await shot(g, "f3e1-agenda-mes");

// ---- a task on a contact, from Tarefas; straight to the contact ----
await go(g, "Tarefas");
await g.getByRole("button", { name: "+ Nova tarefa" }).click();
dlg = g.getByRole("dialog", { name: "Nova tarefa" });
await dlg.getByLabel("Buscar contato").fill("Ana");
await dlg.getByRole("list", { name: "Resultados" }).getByRole("button", { name: /Ana Ribeiro/ }).click();
await dlg.getByLabel("Oportunidade da tarefa").selectOption("d6");
await dlg.getByLabel("Título", { exact: true }).fill("Enviar o estudo");
await dlg.getByLabel("Tipo", { exact: true }).selectOption({ label: "Envio de proposta" });
await dlg.getByLabel("Data", { exact: true }).fill(tomorrow);
await dlg.getByRole("button", { name: "Criar tarefa" }).click();
await dlg.waitFor({ state: "detached" });
// A Tarefas row's open button reads "<tipo>: <título> …" (the checkbox next to it is "Concluir: …").
const row = (title) => g.getByRole("button", { name: new RegExp(`^[^:]+: ${title}`) }).and(g.locator(":not([aria-label^='Concluir'])"));
await row("Enviar o estudo").click();
dlg = g.getByRole("dialog", { name: "Tarefa Enviar o estudo" });
await dlg.getByText("Oportunidade:").waitFor();
await dlg.getByRole("button", { name: "Abrir contato" }).click();
const panel = g.getByRole("dialog", { name: "Contato Ana Ribeiro" });
await panel.getByRole("button", { name: "Detalhes: Enviar o estudo" }).click();
await g.getByRole("dialog", { name: "Tarefa Enviar o estudo" }).getByText("Criou a tarefa").waitFor();
await g.keyboard.press("Escape");
await g.getByRole("dialog", { name: "Tarefa Enviar o estudo" }).waitFor({ state: "detached" });
ok(await panel.isVisible(), "from the task straight to the contact; its Detalhes opens the form, Escape closes only the form");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// ---- Tarefas filters and tabs ----
await g.getByLabel("Prioridade", { exact: true }).selectOption({ label: "Alta" });
await row("Planejar a semana").waitFor();
ok((await row("Enviar o estudo").count()) === 0, "filter by priority");
await g.getByLabel("Prioridade", { exact: true }).selectOption("");
await g.getByRole("tab", { name: "Em andamento" }).click();
await row("Planejar a semana").waitFor();
ok((await row("Enviar o estudo").count()) === 0, "Em andamento tab");
await g.getByRole("tab", { name: "Concluídas" }).click();
await g.getByRole("region", { name: "Concluídas" }).getByText(/^Concluída /).first().waitFor();
ok(true, "Concluídas tab");
await g.getByRole("tab", { name: "Pendentes" }).click();

// ---- the reminders bell ----
const soon = new Date(Date.now() + 10 * 60_000);
const hhmm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(soon);
const res = await api.post(`${BASE}/api/crm/tasks/`, { data: { contactId: "c1", title: "Ligar para a Ana", dueDate: spDay(soon.getTime()), dueTime: hhmm, reminder: 15 } });
ok(res.status() === 201, "a task whose reminder time has come");
await g.reload();
await g.getByRole("button", { name: "Lembretes: 1 novo" }).click();
const bell = g.getByRole("dialog", { name: "Lembretes" });
await bell.getByText("Ligar para a Ana").waitFor();
await shot(g, "f3e1-lembretes");
await bell.getByRole("button", { name: "Dispensar lembrete: Ligar para a Ana" }).click();
await bell.getByText("Nenhum lembrete agora.").waitFor();
ok(await g.getByRole("button", { name: "Lembretes", exact: true }).isVisible(), "dismissed: the bell is quiet");
await g.keyboard.press("Escape");

// ---- a task on a company ----
await sql(`INSERT INTO crm_companies (id, name, name_key) VALUES ('co-e2e', 'Clínica Agenda Teste', 'clinica agenda teste')`);
await go(g, "Empresas");
await g.getByRole("button", { name: "Clínica Agenda Teste" }).click();
const co = g.getByRole("dialog", { name: "Empresa Clínica Agenda Teste" });
await co.getByText("Nenhuma tarefa pendente.").waitFor();
await co.getByRole("button", { name: "+ Nova tarefa" }).click();
dlg = g.getByRole("dialog", { name: "Nova tarefa" });
ok(await dlg.getByText("Clínica Agenda Teste").isVisible(), "the form starts on the company");
await dlg.getByLabel("Título", { exact: true }).fill("Visita técnica");
await dlg.getByRole("button", { name: "Criar tarefa" }).click();
await co.getByRole("region", { name: "Tarefas da empresa" }).getByText("Visita técnica").waitFor();
ok(true, "listed on the company");
await co.getByRole("button", { name: "Fechar painel" }).click();

// ---- Personalização (Administrador): colors and priorities ----
const { page: a } = await login(browser, "admin", { errors });
await go(a, "Personalização");
await a.getByRole("tab", { name: "Tipos de tarefa" }).click();
const kinds = a.getByRole("list", { name: "Tipos de tarefa" });
await kinds.getByText("Primeiro contato", { exact: true }).waitFor();
await a.getByRole("button", { name: "Editar Follow-up" }).click();
await a.getByLabel("Cor de Follow-up").selectOption({ label: "Roxo" });
await a.getByRole("button", { name: "Salvar", exact: true }).click();
await a.getByText("Alteração salva.").waitFor();
ok((await sql(`SELECT color FROM crm_options WHERE kind = 'task_kind' AND id = 'follow_up'`)) === "roxo", "a type's color changed in Personalização");
await a.getByRole("tab", { name: "Prioridades" }).click();
const prios = (await a.getByRole("list", { name: "Prioridades" }).locator("li p.font-semibold").allTextContents()).map((t) => t.replace("padrão", "").trim());
ok(prios.join() === "Alta,Média,Baixa", `Prioridades list (${prios.join()})`);
await shot(a, "f3e1-personalizacao-tipos");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Agenda");
await p.getByRole("tab", { name: "Mês" }).click();
await p.getByRole("button", { name: "09:00 Planejar a semana (Reunião)" }).waitFor();
await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "month agenda: no horizontal scroll on the phone");
await shot(p, "f3e1-agenda-mes-celular-escuro");
await p.getByRole("button", { name: "09:00 Planejar a semana (Reunião)" }).click();
await p.getByRole("dialog", { name: "Tarefa Planejar a semana" }).getByText("Criou a tarefa").waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "task form: no horizontal scroll on the phone");
await shot(p, "f3e1-tarefa-celular-escuro");
await p.getByRole("button", { name: "Fechar tarefa" }).click();
await p.getByRole("button", { name: /^Lembretes/ }).click();
await p.getByRole("dialog", { name: "Lembretes" }).waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "reminders: no horizontal scroll on the phone");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("TASKS E2E PASSED");
