// Fase 4 · entrega 1 in the browser, on base + campaign fixtures: Conversas
// with the response-time strip, the "Aguardando" view and badge; answering
// takes the conversation; Atendimento tag; transfer with a notice in the
// other person's bell; "Assumir e responder"; + Tarefa / + Oportunidade from
// the conversation; Enter sends (Shift+Enter breaks the line, never a
// takeover); the atendimento filter; phone and dark theme.
import { go, inbound, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
ok((await inbound("5515990000005", "Oi! Vocês fazem gestão de tráfego?", "Eva")) === 200, "Eva writes");
ok((await inbound("5515990000002", "Bom dia", "Bruno")) === 200, "Bruno writes");

const { page: g } = await login(browser, "vitor", { errors });
await go(g, "Conversas");
const strip = g.getByRole("region", { name: "Tempo de resposta" });
await strip.getByText(/Aguardando resposta agora:/).waitFor();
ok((await strip.locator("strong").nth(1).textContent()) === "2", "response-time strip: 2 conversations waiting");
const list = g.getByRole("region", { name: "Conversas" });
await list.getByRole("button", { name: "Aguardando", exact: true }).click();
const evaRow = list.getByRole("button", { name: /Eva Prado/ });
await evaRow.getByText(/Aguardando · \d+ min/).waitFor();
ok(true, "Aguardando view with the waiting badge");

// ---- answering takes the conversation ----
await evaRow.click();
const panel = g.getByRole("region", { name: "Contato Eva Prado" });
const bar = panel.getByRole("region", { name: "Atendimento" });
await bar.getByText("Ninguém está atendendo.").waitFor();
await panel.getByLabel("Mensagem", { exact: true }).fill("Fazemos sim! Posso te ligar?");
await panel.getByRole("button", { name: "Enviar", exact: true }).click();
await bar.getByText(/Você está atendendo desde/).waitFor();
ok(true, "answering takes the conversation");

// ---- Enter sends, Shift+Enter breaks the line ----
const box = panel.getByLabel("Mensagem", { exact: true });
const outbound = () => sql(`SELECT count(*) FROM crm_messages WHERE contact_id = 'c5' AND direction = 'out'`);
const sentBefore = await outbound();
await box.fill("Segue o horário:");
await box.press("Shift+Enter");
await box.pressSequentially("amanhã às 10h");
ok((await box.inputValue()) === "Segue o horário:\namanhã às 10h", "Shift+Enter breaks the line");
await box.press("Enter");
await panel.getByText("amanhã às 10h").waitFor();
await g.waitForFunction(() => document.querySelector('textarea[aria-label="Mensagem"]')?.value === ""); // cleared once sent
ok(Number(await outbound()) === Number(sentBefore) + 1, "Enter sends the message (one message, with both lines)");
await bar.getByLabel("Etiqueta de atendimento").selectOption({ label: "Dúvida" });
await bar.getByText("Dúvida", { exact: true }).waitFor();
await list.getByRole("button", { name: "Todas", exact: true }).click();
await list.getByRole("button", { name: /Eva Prado/ }).getByText("Atende: você").waitFor();
ok(await list.getByRole("button", { name: /Eva Prado/ }).getByText("Dúvida").isVisible(), "the list shows who attends and the Atendimento tag");
await shot(g, "f4e1-conversa-atendimento");

// ---- transfer to João: he gets a notice ----
await bar.getByLabel("Transferir atendimento").selectOption({ label: "João" });
await bar.getByText(/João está atendendo desde/).waitFor();
ok(true, "transferred to João");
const { page: j } = await login(browser, "joao", { errors });
await j.getByRole("button", { name: /^Lembretes: \d+ novos?$/ }).click();
await j.getByRole("dialog", { name: "Lembretes" }).getByText("Conversa transferida para você: Eva Prado").click();
const jp = j.getByRole("dialog", { name: "Contato Eva Prado" });
await jp.getByRole("region", { name: "Atendimento" }).getByText(/Você está atendendo desde/).waitFor();
ok(true, "João opens it from the bell and sees it's his");

// ---- Vitor answers João's conversation: explicit takeover ----
await g.reload();
await go(g, "Conversas");
await g.getByRole("region", { name: "Conversas" }).getByRole("button", { name: /Eva Prado/ }).click();
await panel.getByText(/João está atendendo esta conversa\. Ao enviar, você assume/).waitFor();
await panel.getByLabel("Mensagem", { exact: true }).fill("Oi Eva, aqui é o Vitor, gestor da conta");
await panel.getByLabel("Mensagem", { exact: true }).press("Enter");
ok(
  (await panel.getByLabel("Mensagem", { exact: true }).inputValue()) === "Oi Eva, aqui é o Vitor, gestor da conta",
  "Enter doesn't take over someone else's conversation: that stays a click",
);
await panel.getByRole("button", { name: "Assumir e responder" }).click();
await bar.getByText(/Você está atendendo desde/).waitFor();
ok(true, "\"Assumir e responder\" takes it over");
await panel.getByRole("tab", { name: "Detalhes e histórico" }).click();
await panel.getByText("Vitor assumiu o atendimento no lugar de João").waitFor();
ok(true, "…and the history says so");
await panel.getByRole("tab", { name: "Conversa" }).click();

// ---- shortcuts: + Tarefa, + Oportunidade ----
await bar.getByRole("button", { name: "+ Tarefa" }).click();
const dlg = g.getByRole("dialog", { name: "Nova tarefa" });
ok(await dlg.getByText("Eva Prado").isVisible(), "+ Tarefa opens the task form on this contact");
await dlg.getByLabel("Título", { exact: true }).fill("Ligar para a Eva");
await dlg.getByRole("button", { name: "Criar tarefa" }).click();
await dlg.waitFor({ state: "detached" });
await bar.getByRole("button", { name: "+ Oportunidade" }).click();
await panel.getByLabel("Título da nova oportunidade").waitFor();
ok(await panel.getByRole("button", { name: "Detalhes: Ligar para a Eva" }).isVisible(), "+ Oportunidade opens the new-opportunity form, the new task is listed");
await panel.getByRole("tab", { name: "Conversa" }).click();

// ---- filter: meus atendimentos ----
await list.getByLabel("Filtrar por atendimento").selectOption("mine");
await list.getByRole("button", { name: /Bruno Souza/ }).waitFor({ state: "detached" });
ok(await list.getByRole("button", { name: /Eva Prado/ }).isVisible(), "filter: meus atendimentos");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Conversas");
await p.getByRole("region", { name: "Conversas" }).getByRole("button", { name: /Eva Prado/ }).waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "Conversas: no horizontal scroll on the phone");
await p.getByRole("region", { name: "Conversas" }).getByRole("button", { name: /Eva Prado/ }).click();
await p.getByRole("dialog", { name: "Contato Eva Prado" }).getByRole("region", { name: "Atendimento" }).waitFor();
await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "conversation: no horizontal scroll on the phone");
await shot(p, "f4e1-conversa-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("CONVERSATIONS E2E PASSED");
process.exit(0); // the sql pool would keep the process alive
