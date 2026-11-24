// Painel (Fase 4) in the browser, on the base fixture: home page, period and
// owner filters, October 2026 numbers, Comercial sees only their own, every
// section still opens, dark theme and the phone.
import { BASE, launchBrowser, loginRequest, ok, shot } from "../lib/helpers.mjs";


const browser = await launchBrowser();
const errors = [];
async function open(username, { width = 1440, height = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: "light", timezoneId: "America/Sao_Paulo" });
  await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal { display: none !important; }";
      document.head.appendChild(st);
    });
  });
  ok((await loginRequest(ctx.request, username)).ok(), `login ${username}`);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${username}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/400|403|404|409|502/.test(m.text()) && errors.push(`${username}: ${m.text()}`));
  await page.goto(`${BASE}/crm/`);
  return { page, api: ctx.request };
}
// A tile is a button (it opens its records) or, for ratios, a plain box: label, then the value.
const tile = (p, label) => p.getByRole("region", { name: "Indicadores do período" }).locator("button, div").filter({ has: p.getByText(label, { exact: true }) }).first();
async function october(p) {
  await p.getByLabel("Período", { exact: true }).selectOption("custom");
  await p.getByLabel("Data inicial").fill("2026-10-01");
  await p.getByLabel("Data final").fill("2026-10-31");
  await p.getByText(/comparado com 31\/08 a 30\/09/).waitFor();
  await p.waitForTimeout(400);
}

// ---- API guard ----
ok((await fetch(`${BASE}/api/crm/dashboard/?from=2026-10-01&to=2026-10-31`)).status === 401, "dashboard API refuses anonymous requests");

// ---- Gestor (Vitor): home is the Painel ----
const { page: g, api } = await open("vitor");
await g.getByRole("heading", { level: 1, name: "Painel" }).waitFor();
ok(true, "the CRM opens on the Painel");
const nav = g.getByRole("navigation", { name: "Seções do CRM" });
ok((await nav.getByRole("button").first().textContent()).startsWith("Painel"), "Painel is the first menu item");
ok((await api.get(`${BASE}/api/crm/dashboard/?from=2026-10-31&to=2026-10-01`)).status() === 400, "inverted period refused");
await october(g);
const val = async (label) => (await tile(g, label).locator("span").nth(1).textContent()).trim();
ok((await val("Novos leads")) === "4", "Novos leads 4");
ok((await val("Reuniões agendadas")) === "2", "Reuniões 2");
ok((await val("Propostas enviadas")) === "2", "Propostas 2");
ok((await val("Ganhos")) === "1", "Ganhos 1");
ok((await val("Conversão")) === "50%", "Conversão 50%");
ok((await val("Tempo para fechar")) === "10 d", "Tempo para fechar 10 d");
ok(await tile(g, "Novos leads").getByText("subiu").isVisible(), "Novos leads shows ↑ vs the previous period (4 vs 1)");
ok(await tile(g, "Perdidos").getByText("subiu").isVisible() && (await tile(g, "Perdidos").locator(".text-crm-red").count()) === 1, "more losses read as bad (red)");
const funnel = g.getByRole("region", { name: "Funil agora" });
ok(await funnel.getByText("1 · R$ 3 mil").isVisible(), "funnel: Proposta 1 · R$ 3 mil");
ok(await g.getByRole("region", { name: "Por que perdemos" }).getByText("Fechamento com concorrente").isVisible(), "loss reason listed");
ok(await g.getByRole("region", { name: "De onde vêm os leads" }).getByText("1 lead · 1 ganho (R$ 5 mil)").isVisible(), "Indicação converted 1 (R$ 5 mil)");
const people = g.getByRole("region", { name: "Por pessoa da equipe" });
ok(await people.getByRole("cell", { name: "Sem responsável" }).isVisible(), "unowned line in the team table");
ok((await people.locator("tr").filter({ hasText: "João" }).locator("td").nth(6).textContent()) === "1", "João has 1 overdue task");
await g.getByRole("region", { name: "Semana a semana" }).getByRole("button", { name: "Ver como tabela" }).click();
ok((await g.getByRole("region", { name: "Semana a semana" }).locator("tbody tr").count()) === 5, "weekly chart also as a table (5 weeks)");
await g.getByRole("region", { name: "Semana a semana" }).getByRole("button", { name: "Ver gráfico" }).click();
await shot(g, "f4-painel");
// owner filter
await g.getByLabel("Responsável", { exact: true }).selectOption("u-joao");
await g.waitForTimeout(900);
ok((await val("Novos leads")) === "2" && (await val("Perdidos")) === "1", "filter by João: 2 leads, 1 lost");
ok((await people.locator("tbody tr").count()) === 1, "team table narrows to João");
await g.getByLabel("Responsável", { exact: true }).selectOption("all");
// presets don't break
for (const p of ["mes_passado", "7d", "90d", "ano", "mes"]) {
  await g.getByLabel("Período", { exact: true }).selectOption(p);
  await g.waitForTimeout(500);
}
ok(true, "every preset loads");
await g.getByLabel("Período", { exact: true }).selectOption("ano");
await g.getByRole("region", { name: "Mês a mês" }).waitFor();
ok(true, "a year shows month by month");
// other sections still open
for (const [label] of [["Funil"], ["Conversas"], ["Tarefas"], ["Agenda"], ["Contatos"], ["Empresas"], ["Painel"]]) {
  await nav.getByRole("button", { name: new RegExp(`^${label}`) }).click();
  await g.getByRole("heading", { level: 1, name: label }).waitFor();
}
ok(true, "every section still opens");
// dark
await g.getByRole("button", { name: "Usar tema escuro" }).click();
await october(g);
await shot(g, "f4-painel-escuro");

// ---- Comercial (João): his numbers or the team's, never another person's ----
const { page: j, api: japi } = await open("joao");
await j.getByRole("heading", { level: 1, name: "Painel" }).waitFor();
const picker = j.getByLabel("Responsável", { exact: true });
ok((await picker.inputValue()) === "u-joao" && (await picker.locator("option").allTextContents()).join() === "Seus números,Toda a equipe", "Comercial picks his numbers (default) or the team's");
const forced = await (await japi.get(`${BASE}/api/crm/dashboard/?from=2026-10-01&to=2026-10-31&owner=u-vitor`)).json();
ok(forced.dashboard.current.newLeads === 2 && forced.dashboard.team.length === 1 && forced.dashboard.team[0].name === "João", "asking for Vitor's numbers still returns João's");
await october(j);
ok((await j.getByRole("region", { name: "Seus resultados" }).locator("tbody tr").count()) === 1, "Seus resultados: one line");

// ---- phone ----
const { page: m } = await open("vitor", { width: 390, height: 844 });
await m.getByRole("heading", { level: 1, name: "Painel" }).waitFor();
await m.waitForTimeout(600);
ok((await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal page scroll on the phone");
await shot(m, "f4-painel-celular");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("FASE 4 E2E PASSED");
