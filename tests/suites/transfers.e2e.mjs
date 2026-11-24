// Evolução v1.0 · responsabilidades in the browser, on base + campaign
// fixtures: a Comercial opens someone else's lead read-only (no conversation,
// no editing, can't drag its card), asks for the transfer; the Gestor
// approves it in Transferências; the lead becomes the Comercial's. Phone and
// dark theme.
import { BASE, go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
await sql(`INSERT INTO crm_messages (id, contact_id, direction, type, body, created_at) VALUES ('m-ana', 'c1', 'in', 'text', 'Quero falar sobre o orçamento', now())`);
await sql(`UPDATE crm_contacts SET last_message_at = now(), last_message_preview = 'Quero falar sobre o orçamento' WHERE id = 'c1'`);

// ---- Comercial: someone else's lead, read-only ----
const { page: j } = await login(browser, "joao", { errors, width: 1600 });
await go(j, "Funil de vendas");
const anaCard = j.locator("[role='button'][aria-label^='Abrir ']").filter({ hasText: "d6" }).first();
await anaCard.waitFor();
ok((await anaCard.getAttribute("draggable")) === "false", "Vitor's card is on João's board but can't be dragged");
ok((await anaCard.getByText("Quero falar sobre o orçamento").count()) === 0, "…and doesn't show the last message");
await anaCard.click();
const panel = j.getByRole("dialog", { name: "Contato Ana Ribeiro" });
const box = panel.getByRole("region", { name: "Responsabilidade do lead" });
await box.getByText("Lead de", { exact: false }).waitFor();
ok(await box.getByText("Vitor", { exact: true }).isVisible(), "the panel says whose lead it is");
ok(await panel.getByText(/A conversa de WhatsApp deste lead é de Vitor/).isVisible(), "the conversation stays closed");
ok(await panel.getByLabel("Etapa da oportunidade").isDisabled(), "the opportunity can't be moved");
ok((await panel.getByRole("button", { name: "Resumo do lead" }).count()) === 0, "no AI summary of someone else's lead");
await panel.getByRole("tab", { name: "Detalhes e histórico" }).click();
await panel.getByText(/Etapa/).first().waitFor();
await box.getByRole("button", { name: "Pedir transferência para mim" }).click();
await box.getByLabel("Motivo da transferência").fill("A Ana me procurou direto pelo Instagram");
await shot(j, "ev3-pedir-transferencia");
await box.getByRole("button", { name: "Enviar pedido" }).click();
await box.getByText("Aguardando um Gestor.").waitFor();
ok(await box.getByText(/Transferência pedida/).isVisible(), "the request shows on the lead");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// ---- Gestor: Transferências ----
const { page: g } = await login(browser, "vitor", { errors });
await go(g, "Transferências");
const req = g.getByRole("listitem", { name: "Pedido: Ana Ribeiro" });
await req.waitFor();
ok(await req.getByText("A Ana me procurou direto pelo Instagram").isVisible() && (await req.getByText("Pendente").isVisible()), "the Gestor sees the pending request with the reason");
await shot(g, "ev3-transferencias-gestor");
await req.getByRole("button", { name: "Aprovar transferência — Ana Ribeiro" }).click();
await g.getByText("Nenhum pedido pendente.").waitFor();
ok((await sql(`SELECT owner_id FROM crm_contacts WHERE id = 'c1'`)) === "u-joao", "approved: Ana is João's");
await g.getByLabel("Situação").selectOption("todas");
await g.getByRole("listitem", { name: "Pedido: Ana Ribeiro" }).getByText("Aprovada", { exact: true }).waitFor();
ok(true, "…and the history of requests shows it");

// ---- Comercial: now his ----
await j.reload();
await j.getByRole("region", { name: "Indicadores do período" }).waitFor();
await go(j, "Funil de vendas");
await j.locator("[role='button'][aria-label^='Abrir ']").filter({ hasText: "d6" }).first().click();
const panel2 = j.getByRole("dialog", { name: "Contato Ana Ribeiro" });
await panel2.getByText("Quero falar sobre o orçamento").waitFor();
ok(await panel2.getByLabel("Etapa da oportunidade").isEnabled(), "João reads the conversation and moves the opportunity now");
ok((await panel2.getByRole("region", { name: "Responsabilidade do lead" }).getByText("Lead de", { exact: false }).count()) === 0, "…no read-only notice");

// ---- phone + dark ----
const { page: p } = await login(browser, "joao", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Transferências");
await p.getByLabel("Situação").selectOption("todas");
await p.getByRole("listitem", { name: "Pedido: Ana Ribeiro" }).waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "phone: no horizontal scroll");
await shot(p, "ev3-transferencias-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("TRANSFERS E2E PASSED");
