// Fase 2 · entrega 2 in the browser, on base + campaign fixtures: bulk owner
// change from Contatos, a person's carteira and activity, the Auditoria
// screen (both tabs, link to the contact), phone and dark theme.
import { go, launchBrowser, login, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const { page: a } = await login(browser, "admin", { errors });

// ---- Contatos: tick two leads, give them to Vitor ----
await go(a, "Contatos");
await a.getByRole("checkbox", { name: "Selecionar Bruno Souza" }).check();
await a.getByRole("checkbox", { name: "Selecionar Carla Dias" }).check();
await a.getByText("2 selecionados").waitFor();
await a.getByRole("button", { name: "Trocar responsável (2)" }).click();
const dlg = a.getByRole("dialog", { name: "Trocar responsável" });
await dlg.getByLabel("Novo responsável").selectOption({ label: "Vitor" });
await dlg.getByText(/Vai mudar: 2 contatos, 1 oportunidade aberta e 1 tarefa pendente/).waitFor();
ok(true, "preview before confirming");
await shot(a, "f2e2-trocar-responsavel");
await dlg.getByRole("button", { name: "Trocar responsável" }).click();
await a.getByText(/2 contatos, 1 oportunidade e 1 tarefa agora com Vitor/).waitFor();
const bruno = a.locator("tbody tr").filter({ hasText: "Bruno Souza" });
await bruno.getByText("Vitor").waitFor();
ok(true, "rows now show Vitor as the owner");

// ---- João's carteira and activity ----
await go(a, "Usuários e permissões");
await a.getByRole("button", { name: "Abrir João" }).click();
const panel = a.getByRole("dialog", { name: "Pessoa João" });
const carteira = panel.getByRole("region", { name: "Carteira" });
await carteira.getByText(/Com João: /).waitFor();
await panel.getByRole("region", { name: "Atividade" }).getByText("Mensagens enviadas").waitFor();
ok(true, "person panel shows carteira and activity");
await carteira.getByLabel("Transferir carteira para").selectOption({ label: "Vitor" });
await carteira.getByRole("button", { name: "Transferir carteira" }).click();
await panel.getByText(/Carteira de João transferida para Vitor/).waitFor();
await carteira.getByText("Nada no nome dessa pessoa.").waitFor();
ok(true, "portfolio transferred; João owns nothing now");
await shot(a, "f2e2-carteira");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// ---- Auditoria ----
await go(a, "Auditoria");
await a.getByRole("heading", { level: 1, name: "Auditoria" }).waitFor();
await a.locator("tbody").getByText("Transferiu carteira").first().waitFor();
await a.locator("tbody").getByText("Trocou responsável em lote").first().waitFor();
ok(true, "administrative actions listed");
await a.getByLabel("Ação", { exact: true }).selectOption("crm.portfolio_transfer");
await a.getByText("1 registro", { exact: true }).waitFor();
ok((await a.locator("tbody tr").count()) === 1, "filtered by action");
await shot(a, "f2e2-auditoria");
await a.getByRole("tab", { name: "Mudanças comerciais" }).click();
await a.getByLabel("Tipo de mudança").selectOption("owner");
await a.locator("tbody tr").filter({ hasText: "(carteira)" }).first().waitFor();
ok(true, "commercial changes show the owner moves");
await a.locator("tbody tr").filter({ hasText: "Bruno Souza" }).first().getByRole("button", { name: "Bruno Souza" }).click();
await a.getByRole("dialog", { name: "Contato Bruno Souza" }).waitFor();
ok(true, "the contact opens from the audit row");

// ---- phone + dark ----
const { page: p } = await login(browser, "admin", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Auditoria");
await p.locator("tbody").getByText("Transferiu carteira").first().waitFor();
await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "Auditoria: no horizontal scroll on the phone");
await shot(p, "f2e2-auditoria-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("ACCESS E2E PASSED");
