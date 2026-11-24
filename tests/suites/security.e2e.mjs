// Evolução v1.0 · LGPD in the browser, on base + campaign fixtures: the
// Administrador finds the titular's tools in the contact's details, downloads
// the data and anonymizes it (reason + password); a Gestor doesn't see them.
import { PASSWORD, go, inbound, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
ok((await inbound("5515990000002", "Quero que apaguem meus dados", "Bruno")) === 200, "Bruno writes");

const open = async (page) => {
  await go(page, "Conversas");
  await page
    .getByRole("region", { name: "Conversas" })
    .getByRole("button", { name: /Bruno Souza/ })
    .click();
  const panel = page.getByRole("region", { name: "Contato Bruno Souza" });
  await panel.getByRole("tab", { name: "Detalhes e histórico" }).click();
  return panel;
};

// ---- a Gestor: no LGPD tools ----
const { page: g } = await login(browser, "vitor", { errors, width: 1500 });
let panel = await open(g);
await panel.getByRole("group", { name: "Dados do contato" }).waitFor();
ok((await panel.getByRole("region", { name: "LGPD" }).count()) === 0, "a Gestor doesn't see the titular's tools");

// ---- the Administrador ----
const { page: a } = await login(browser, "admin", { errors, width: 1500 });
panel = await open(a);
const box = panel.getByRole("region", { name: "LGPD" });
await box.waitFor();
const [download] = await Promise.all([a.waitForEvent("download"), box.getByRole("link", { name: "Baixar dados do titular" }).click()]);
ok(download.suggestedFilename() === "dados-do-titular-bruno-souza.json", "the titular's data downloads as a file");
await box.getByRole("button", { name: "Anonimizar…" }).click();
const form = box.getByRole("form", { name: "Anonimizar titular" });
await form.getByLabel("Motivo da anonimização").fill("Pedido do titular pelo WhatsApp em 24/11");
await form.getByLabel("Sua senha para confirmar").fill("errada");
await form.getByRole("button", { name: "Anonimizar de vez" }).click();
await form.getByText("Senha incorreta.").waitFor();
ok(true, "a wrong password is refused");
await shot(a, "ev9-lgpd-confirmar");
await form.getByLabel("Sua senha para confirmar").fill(PASSWORD);
await form.getByRole("button", { name: "Anonimizar de vez" }).click();
// The panel now carries the new name.
await a
  .getByRole("region", { name: "LGPD" })
  .getByText(/Dados pessoais anonimizados em/)
  .waitFor();
ok((await sql(`SELECT name FROM crm_contacts WHERE id = 'c2'`)) === "Titular anonimizado", "anonymized");
await shot(a, "ev9-lgpd-anonimizado");

// The wrong password's 401 is expected; anything else is an error.
const unexpected = errors.filter((e) => !/status of 401/.test(e));
ok(unexpected.length === 0, `no page errors (${unexpected.join(" | ")})`);
await browser.close();
console.log("SECURITY E2E PASSED");
process.exit(0);
