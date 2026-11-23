// Regression smoke for Fases 1–3 and the layout, on base + campaign fixtures:
// signed WhatsApp webhook, funnel drag and drop, tasks from the panel,
// Conversas, Tarefas/Agenda/Contatos/Empresas, import preview, profiles.
import { createHmac } from "node:crypto";
import { BASE, launchBrowser, ok } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
async function open(username) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Sao_Paulo" });
  await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal { display: none !important; }";
      document.head.appendChild(st);
    });
  });
  ok((await ctx.request.post(`${BASE}/api/analise/login/`, { data: { username, password: "crm-teste-123" } })).ok(), `login ${username}`);
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (e) => errors.push(`${username}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/400|403|404|409|502/.test(m.text()) && errors.push(`${username}: ${m.text()}`));
  await page.goto(`${BASE}/crm/`);
  return { page, api: ctx.request };
}
const go = (p, label) => p.getByRole("navigation", { name: "Seções do CRM" }).getByRole("button", { name: new RegExp(`^${label}`) }).click();

// WhatsApp webhook: signature still enforced; a signed message lands as a conversation.
const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "w", changes: [{ field: "messages", value: {
  messaging_product: "whatsapp", metadata: { display_phone_number: "5515900000000", phone_number_id: "000000" },
  contacts: [{ profile: { name: "Gabi Nova" }, wa_id: "5515991112222" }],
  messages: [{ from: "5515991112222", id: `wamid.reg.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Olá, quero saber dos planos" } }],
} }] }] });
ok((await fetch(`${BASE}/api/whatsapp/webhook/`, { method: "POST", headers: { "Content-Type": "application/json" }, body })).status === 401, "unsigned webhook refused");
const sig = "sha256=" + createHmac("sha256", "local-app-secret").update(body).digest("hex");
ok((await fetch(`${BASE}/api/whatsapp/webhook/`, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig }, body })).status === 200, "signed webhook accepted");

const { page: g, api } = await open("vitor");
await g.getByRole("heading", { level: 1, name: "Painel" }).waitFor();

// Funil: the WhatsApp lead is a card in Novo; drag to Em conversa
await go(g, "Funil");
const card = g.locator("[aria-label^='Abrir ']").filter({ hasText: "Gabi Nova" }).first();
await card.waitFor();
await Promise.all([g.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/crm/deals/")), card.dragTo(g.getByRole("region", { name: "Em conversa" }))]);
const deals = (await (await api.get(`${BASE}/api/crm/deals/`)).json()).deals;
ok(deals.find((d) => d.contactName === "Gabi Nova").stage === "conversa", "drag-and-drop moves the opportunity");

// Panel: conversation, schedule a task, finish it
await g.locator("[aria-label^='Abrir ']").filter({ hasText: "Gabi Nova" }).first().click();
const panel = g.getByRole("dialog", { name: "Contato Gabi Nova" });
await panel.getByText("Olá, quero saber dos planos").waitFor();
await panel.getByRole("tab", { name: "Negócio e tarefas" }).click();
await panel.getByLabel("Título da tarefa").fill("Mandar planos");
await panel.getByRole("button", { name: "Agendar", exact: true }).click();
await panel.getByRole("button", { name: "Concluir: Mandar planos" }).waitFor();
await Promise.all([g.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/api/crm/tasks/")), panel.getByRole("button", { name: "Concluir: Mandar planos" }).click()]);
ok(true, "task scheduled and finished from the panel");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// Conversas: list + chat beside it
await go(g, "Conversas");
const list = g.getByRole("region", { name: "Conversas" });
await list.getByRole("button", { name: /Gabi Nova/ }).click();
await g.getByRole("region", { name: "Contato Gabi Nova" }).getByText("Olá, quero saber dos planos").waitFor();
ok(await list.getByRole("button", { name: /Gabi Nova/ }).getByText("Em conversa").isVisible(), "conversation tagged with its stage");

// Tarefas / Agenda / Contatos (import preview) / Empresas
await go(g, "Tarefas");
await g.getByRole("heading", { level: 1, name: "Tarefas" }).waitFor();
await go(g, "Agenda");
await g.getByText(/Semana de/).waitFor();
await go(g, "Contatos");
await g.getByRole("button", { name: "Importar planilha" }).waitFor();
const prev = await (await api.post(`${BASE}/api/crm/import/preview/`, { data: { rows: [{ line: 2, name: "Ana de novo", phone: "15990000001" }, { line: 3, name: "Hugo", email: "hugo@x.com" }] } })).json();
ok(prev.counts?.duplicate === 1 || prev.results?.some((r) => r.status === "duplicado"), "import preview flags the duplicate phone");
await go(g, "Empresas");
await g.getByRole("heading", { level: 1, name: "Empresas" }).waitFor();
ok(true, "Tarefas, Agenda, Contatos and Empresas open");

// Fase 3: Comercial sees only his + unowned; Equipe is admin-only
const { api: japi } = await open("joao");
const jd = (await (await japi.get(`${BASE}/api/crm/deals/`)).json()).deals;
ok(jd.length > 0 && !jd.some((d) => d.ownerId === "u-vitor"), "Comercial doesn't see Vitor's opportunities");
ok((await japi.get(`${BASE}/api/crm/team/`)).status() === 403, "Comercial can't open Equipe");
const { page: a } = await open("admin");
await go(a, "Usuários e permissões");
await a.getByRole("cell", { name: /João/ }).waitFor();
ok(true, "Administrador opens Equipe");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("REGRESSION SMOKE PASSED");
