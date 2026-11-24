// Fase 4 · entrega 2 in the browser, on base + campaign fixtures (fake Meta
// API): the "Quem vai receber" list (search, take someone out, bring them
// back), the sign-up period, saving and reusing an audience, sending without
// the person taken out, and "Interessados" in the results; phone and dark.
import { BASE, go, inbound, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const { api: admin } = await login(browser, "admin", { open: false });
await admin.patch(`${BASE}/api/crm/automations/resposta_campanha/`, { data: { status: "ativa" } });
// Henrique signed up on Jan 14 (Brasília); everyone else today.
await sql(`UPDATE crm_contacts SET created_at = '2026-01-14T15:00:00Z' WHERE id = 'k2'`);

const { page: g } = await login(browser, "vitor", { errors });
await go(g, "Campanhas");
await g.getByRole("button", { name: "Nova campanha" }).click();
await g.getByPlaceholder(/Condição de novembro/).fill("BNI sem o Lucas");
await g.getByLabel("Origem").selectOption("bni");
const aside = g.getByRole("complementary", { name: "Quem vai receber" });
const receiving = async () => (await aside.locator("p.crm-display").textContent()).trim();
await aside.getByText("de 7 contatos no filtro").waitFor();
ok((await receiving()) === "3", "3 will receive");

// ---- the list: search, take out, bring back ----
await g.getByRole("button", { name: "Ver a lista de quem vai receber" }).click();
const list = g.getByRole("region", { name: "Lista de destinatários" });
await list.getByText("3 pessoas podem receber").waitFor();
ok((await list.getByRole("listitem").count()) === 3, "the list shows the 3 who can receive");
await list.getByLabel("Buscar na lista").fill("gab");
await list.getByText("1 pessoa pode receber nesta busca").waitFor();
ok(await list.getByText("Gabriela Mota").isVisible(), "search narrows it");
await list.getByLabel("Buscar na lista").fill("");
await list.getByText("3 pessoas podem receber.").waitFor();
await list.getByRole("button", { name: "Tirar Lucas Erro da campanha" }).click();
await aside.getByText("Tirados por você").waitFor();
await g.waitForFunction(() => document.querySelector('[aria-label="Quem vai receber"] p.crm-display')?.textContent?.trim() === "2");
ok(true, "Lucas taken out: 2 will receive, \"Tirados por você\" in the summary");
await list.getByRole("button", { name: "Tirar Gabriela Mota da campanha" }).click();
await list.getByRole("button", { name: "Incluir Gabriela Mota de volta" }).click();
await g.getByRole("button", { name: "Esconder a lista · 1 tirado por você" }).waitFor();
ok(true, "Gabriela back in; one person taken out");
await shot(g, "f4e2-lista-destinatarios");

// ---- sign-up period ----
await g.getByLabel("Cadastrado até").fill("2026-01-14");
await g.waitForFunction(() => document.querySelector('[aria-label="Quem vai receber"] p.crm-display')?.textContent?.trim() === "1");
ok(true, "cadastrados até 14/01: only Henrique");
await g.getByLabel("Cadastrado até").fill("");
await g.waitForFunction(() => document.querySelector('[aria-label="Quem vai receber"] p.crm-display')?.textContent?.trim() === "2");

// ---- save the audience ----
await g.getByRole("button", { name: "Salvar estes filtros como público" }).click();
await g.getByLabel("Nome do público").fill("Leads do BNI");
await g.getByRole("button", { name: "Salvar público", exact: true }).click();
await g.getByText("Público “Leads do BNI” salvo.").waitFor();
ok((await g.getByLabel("Público salvo").locator("option:checked").textContent()) === "Leads do BNI", "saved, and shown as the audience in use");

// ---- send ----
await g.getByLabel("Modelo aprovado pela Meta").selectOption("promo_novembro|pt_BR");
await g.getByLabel("Campo 2: de onde vem").selectOption("company");
await g.getByLabel("Campo 2: texto se o dado faltar").fill("nossa equipe");
await g.getByRole("button", { name: "Enviar agora" }).click();
const confirm = g.getByRole("alertdialog", { name: "Confirmar envio" });
ok(await confirm.getByText("para 2 pessoas agora?").isVisible(), "confirmation: 2 people");
await confirm.getByRole("button", { name: "Confirmar e enviar" }).click();
const results = g.getByRole("region", { name: "Resultados da campanha" });
await results.waitFor();
await g.getByText("Concluída", { exact: true }).first().waitFor({ timeout: 30000 });
await g.getByText("Antes do envio, 1 pessoa foi tirada à mão desta campanha.").waitFor();
const num = async (label) => (await results.locator("div").filter({ has: g.getByText(label, { exact: true }) }).first().locator("p").nth(1).textContent()).trim();
ok((await num("Enviadas")) === "2" && (await num("Interessados")) === "0", "2 sent, nobody interested yet");
ok((await g.getByRole("table", { name: "Quem recebeu" }).getByRole("button", { name: "Lucas Erro" }).count()) === 0, "Lucas isn't in the recipients");

// ---- Gabriela answers: interested ----
ok((await inbound("5515990000011", "Quero saber mais!", "Gabriela")) === 200, "Gabriela answers");
await g.getByRole("button", { name: "← Todas as campanhas" }).click();
await g.getByRole("button", { name: /BNI sem o Lucas/ }).getByText(/1 interessado/).waitFor();
ok(true, "the list shows 1 interessado");
await g.getByRole("button", { name: /BNI sem o Lucas/ }).click();
await results.waitFor();
ok((await num("Interessados")) === "1", "results: 1 interessado");
ok(await g.getByRole("table", { name: "Quem recebeu" }).getByRole("row", { name: /Gabriela Mota.*Sim · interessado/ }).isVisible(), "…and in her row");
await shot(g, "f4e2-resultados-interessados");

// ---- reuse the saved audience ----
await g.getByRole("button", { name: "← Todas as campanhas" }).click();
await g.getByRole("button", { name: "Nova campanha" }).click();
await g.getByLabel("Público salvo").selectOption({ label: "Leads do BNI" });
ok((await g.getByLabel("Origem").inputValue()) === "bni", "choosing the saved audience fills the filters");
await aside.getByText("de 7 contatos no filtro").waitFor();
ok((await receiving()) === "3", "…without last campaign's exclusions");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Campanhas");
await p.getByRole("button", { name: "Nova campanha" }).click();
await p.getByLabel("Público salvo").selectOption({ label: "Leads do BNI" });
await p.getByRole("button", { name: "Ver a lista de quem vai receber" }).click();
await p.getByRole("region", { name: "Lista de destinatários" }).getByText("3 pessoas podem receber").waitFor();
await p.getByRole("button", { name: "Salvar com outro nome" }).click();
await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "editor with the list: no horizontal scroll on the phone");
await shot(p, "f4e2-editor-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("CAMPAIGN AUDIENCE E2E PASSED");
