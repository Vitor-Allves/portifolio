// Campanhas (Fase 5) in the browser, on base + campaign fixtures: Marketing
// drafts, Comercial doesn't see it, Gestor sends and reads the results, the
// conversation shows the campaign, dark theme and the phone.
import { BASE, launchBrowser, loginRequest, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
async function open(username, { width = 1440, height = 900, dark = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: dark ? "dark" : "light", timezoneId: "America/Sao_Paulo" });
  await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal { display: none !important; }";
      document.head.appendChild(st);
    });
  });
  ok((await loginRequest(ctx.request, username)).ok(), `login ${username}`);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(`${username}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/400|403|404|409|502/.test(m.text()) && errors.push(`${username}: ${m.text()}`));
  await page.goto(`${BASE}/crm/`);
  await page.getByRole("heading", { level: 1, name: "Painel" }).waitFor();
  // Clicks before React takes over the page are lost: wait for the Painel's numbers (as login() in helpers.mjs does).
  await page.getByRole("region", { name: "Indicadores do período" }).waitFor();
  return page;
}
const nav = (p) => p.getByRole("navigation", { name: "Seções do CRM" });
const go = (p, label) => nav(p).getByRole("button", { name: new RegExp(`^${label}`) }).click();

// ---- Comercial: no Campanhas ----
const j = await open("joao");
ok((await nav(j).getByRole("button", { name: /^Campanhas/ }).count()) === 0, "Comercial has no Campanhas section");

// ---- Marketing drafts ----
const m = await open("maria");
await go(m, "Campanhas");
await m.getByRole("heading", { level: 1, name: "Campanhas" }).waitFor();
await m.getByText("Nenhuma campanha ainda").waitFor();
await m.getByRole("button", { name: "Nova campanha" }).click();
await m.getByPlaceholder(/Condição de novembro/).fill("Condição de novembro · BNI");
await m.getByLabel("Origem").selectOption("bni");
await m.getByLabel("Modelo aprovado pela Meta").selectOption("promo_novembro|pt_BR");
await m.getByLabel("Campo 2: de onde vem").selectOption("company");
await m.getByLabel("Campo 2: texto se o dado faltar").fill("nossa equipe");
const aside = m.getByRole("complementary", { name: "Quem vai receber" });
await aside.getByText("de 7 contatos no filtro").waitFor();
ok((await aside.locator("p.crm-display").textContent()).trim() === "3", "3 will receive");
ok(await aside.getByText("Não deu consentimento").isVisible(), "who's left out and why");
await aside.getByText("Olá Gabriela! A Clínica Sol").waitFor();
ok(true, "message preview filled per contact");
ok((await m.getByRole("button", { name: "Enviar agora" }).count()) === 0, "Marketing has no send button");
await m.getByRole("button", { name: "Salvar rascunho" }).click();
await m.getByText("Avise um Administrador ou Gestor").waitFor();
await shot(m, "f5-editor-marketing");
await m.getByRole("button", { name: "← Todas as campanhas" }).click();
await m.getByRole("button", { name: /Condição de novembro · BNI/ }).getByText("Rascunho", { exact: true }).waitFor();
ok(true, "draft listed");

// ---- Gestor sends ----
const g = await open("vitor");
await go(g, "Campanhas");
await g.getByRole("button", { name: /Condição de novembro · BNI/ }).click();
await g.getByLabel("Origem").waitFor();
ok((await g.getByLabel("Origem").inputValue()) === "bni", "draft reopens with its filters");
await g.getByRole("complementary", { name: "Quem vai receber" }).getByText("de 7 contatos no filtro").waitFor();
await g.getByRole("button", { name: "Enviar agora" }).click();
const confirm = g.getByRole("alertdialog", { name: "Confirmar envio" });
ok(await confirm.getByText("para 3 pessoas agora?").isVisible(), "confirmation states how many");
await shot(g, "f5-confirmar");
await confirm.getByRole("button", { name: "Confirmar e enviar" }).click();
const results = g.getByRole("region", { name: "Resultados da campanha" });
await results.waitFor();
await g.getByText("Concluída", { exact: true }).first().waitFor({ timeout: 30000 });
const num = async (label) => (await results.locator("div").filter({ has: g.getByText(label, { exact: true }) }).first().locator("p").nth(1).textContent()).trim();
ok((await num("Enviadas")) === "2" && (await num("Falharam")) === "1" && (await num("Ficaram de fora")) === "4", "results: 2 sent, 1 failed, 4 left out");
const table = g.getByRole("table", { name: "Quem recebeu" });
ok(await table.getByRole("row", { name: /Lucas Erro.*Falhou/ }).isVisible(), "failed row with reason");
await shot(g, "f5-resultados");
await table.getByRole("button", { name: "Gabriela Mota" }).click();
const panel = g.getByRole("dialog", { name: "Contato Gabriela Mota" });
await panel.getByText("Campanha · Condição de novembro · BNI").waitFor();
ok(true, "the conversation shows the campaign message");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// ---- dark + phone ----
const d = await open("vitor", { dark: true });
await go(d, "Campanhas");
await d.getByRole("button", { name: /Condição de novembro · BNI/ }).click();
await d.getByRole("region", { name: "Resultados da campanha" }).waitFor();
await shot(d, "f5-resultados-escuro");
const p = await open("vitor", { width: 390, height: 844 });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Campanhas");
await p.getByRole("button", { name: "Nova campanha" }).click();
await p.getByLabel("Modelo aprovado pela Meta").selectOption("promo_novembro|pt_BR");
await p.waitForTimeout(800);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "editor: no horizontal scroll on the phone");
await shot(p, "f5-editor-celular");
await p.getByRole("button", { name: "← Todas as campanhas" }).click();
await p.getByRole("button", { name: /Condição de novembro · BNI/ }).click();
await p.getByRole("region", { name: "Resultados da campanha" }).waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "results: no horizontal scroll on the phone");
await shot(p, "f5-resultados-celular");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("FASE 5 E2E PASSED");
