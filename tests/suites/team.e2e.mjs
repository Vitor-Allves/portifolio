// Fase 2 · entrega 1 in the browser, on base + campaign fixtures: Usuários e
// permissões (cargo, departamento, exceptions), a new CRM-only login with its
// one-time password, deactivation, the exception showing up for the person,
// Departamentos in Personalização, phone and dark theme.
import { PASSWORD, go, launchBrowser, login, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];

const { page: a } = await login(browser, "admin", { errors });
await go(a, "Usuários e permissões");
await a.getByRole("button", { name: "Abrir João" }).waitFor();
ok((await a.getByText("Padrão do perfil").count()) >= 3, "everyone starts with the profile's default permissions");

// ---- cargo, departamento and an exception for João ----
await a.getByRole("button", { name: "Abrir João" }).click();
const panel = a.getByRole("dialog", { name: "Pessoa João" });
await panel.getByLabel("Cargo").fill("SDR");
await panel.getByLabel("Departamento").selectOption({ label: "Comercial" });
await panel.getByRole("button", { name: "Salvar cargo e departamento" }).click();
await panel.getByText("Cargo e departamento salvos.").waitFor();
const exportBox = panel.getByRole("checkbox", { name: "Exportar contatos em CSV" });
ok(!(await exportBox.isChecked()), "Comercial doesn't export by default");
ok(await panel.getByRole("checkbox", { name: /Usuários e permissões/ }).isDisabled(), "managing the team can't be granted as an exception");
await exportBox.check();
await panel.getByText("exceção", { exact: true }).waitFor();
await shot(a, "f2e1-permissoes");
await panel.getByRole("button", { name: "Salvar permissões" }).click();
await panel.getByText(/Permissões salvas/).waitFor();
await panel.getByRole("button", { name: "Fechar painel" }).click();
const joaoRow = a.locator("tbody tr").filter({ hasText: "joao" });
await joaoRow.getByText("1 exceção").waitFor();
ok(await joaoRow.getByText("SDR · Comercial").isVisible(), "row shows cargo · departamento and the exception");

// ---- a new CRM-only login ----
await a.getByRole("button", { name: "+ Nova pessoa" }).click();
const dlg = a.getByRole("dialog", { name: "Nova pessoa no CRM" });
await dlg.getByLabel(/^Nome/).fill("Nina Vendas");
await dlg.getByLabel(/^Usuário/).fill("nina.vendas");
await dlg.getByLabel("Perfil no CRM").selectOption("marketing");
await dlg.getByLabel("Departamento").selectOption({ label: "Marketing" });
await dlg.getByLabel("Sua senha para confirmar").fill(PASSWORD);
await dlg.getByRole("button", { name: "Criar acesso" }).click();
const code = dlg.getByLabel("Senha temporária");
await code.waitFor();
ok(((await code.textContent()) ?? "").length >= 16, "temporary password shown once");
await shot(a, "f2e1-senha-temporaria");
await dlg.getByRole("button", { name: "Já entreguei" }).click();
const ninaRow = a.locator("tbody tr").filter({ hasText: "nina.vendas" });
await ninaRow.getByText(/só CRM/).waitFor();
ok(true, "new person listed as CRM-only");

// ---- deactivate ----
await a.getByRole("button", { name: "Abrir Nina Vendas" }).click();
const np = a.getByRole("dialog", { name: "Pessoa Nina Vendas" });
await np.getByRole("button", { name: "Desativar acesso" }).click();
await np.getByLabel("Sua senha para confirmar").fill(PASSWORD);
await np.getByRole("button", { name: "Desativar" }).click();
await a.getByText(/Nina Vendas foi desativado/).first().waitFor();
await np.waitFor({ state: "detached" });
await a.locator("tbody tr").filter({ hasText: "nina.vendas" }).waitFor({ state: "detached", timeout: 5000 });
ok(true, "deactivated person leaves the list");
await a.getByRole("button", { name: "Mostrar desativados" }).click();
await a.locator("tbody tr").filter({ hasText: "nina.vendas" }).getByText(/desativado/).waitFor();
ok(true, "…and shows among the deactivated");

// ---- Departamentos in Personalização ----
await go(a, "Personalização");
await a.getByRole("tab", { name: "Departamentos" }).click();
await a.getByRole("list", { name: "Departamentos" }).getByText("Operação", { exact: true }).waitFor();
ok(true, "Departamentos is a Personalização list");

// ---- the exception takes effect for João ----
const { page: j } = await login(browser, "joao", { errors });
await go(j, "Contatos");
await j.getByRole("link", { name: "Exportar CSV" }).waitFor();
ok(true, "João (Comercial + exception) now sees Exportar CSV");

// ---- phone + dark ----
const { page: p } = await login(browser, "admin", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Usuários e permissões");
await p.getByRole("button", { name: "Abrir João" }).waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "team screen: no horizontal scroll on the phone");
await p.getByRole("button", { name: "Abrir João" }).click();
await p.getByRole("dialog", { name: "Pessoa João" }).waitFor();
await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "person panel: no horizontal scroll on the phone");
await shot(p, "f2e1-pessoa-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("TEAM E2E PASSED");
