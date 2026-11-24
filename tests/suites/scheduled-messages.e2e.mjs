// Evolução v1.0 · mensagens agendadas in the browser, on base + campaign
// fixtures: João schedules a message to Bruno from the conversation (with
// the warning when the time is past the 24h window), sees it above the
// composer, cancels it, schedules again; a failure shows its reason; the
// Gestor sees who scheduled; phone width and dark theme.
import { go, inbound, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
ok((await inbound("5515990000002", "Bom dia, me chama mais tarde", "Bruno")) === 200, "Bruno writes");
/** "YYYY-MM-DDTHH:MM", `hours` from now, in the page's own time zone (what a datetime-local input takes). */
const inHours = (page, hours) =>
  page.evaluate((h) => {
    const d = new Date(Date.now() + h * 3_600_000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }, hours);

const { page: j } = await login(browser, "joao", { errors, width: 1500 });
await go(j, "Conversas");
await j
  .getByRole("region", { name: "Conversas" })
  .getByRole("button", { name: /Bruno Souza/ })
  .click();
const panel = j.getByRole("region", { name: "Contato Bruno Souza" });
await panel.getByLabel("Mensagem", { exact: true }).fill("Bom dia, Bruno! Como combinado, seguem as opções.");
await panel.getByRole("button", { name: "Agendar", exact: true }).click();
const when = panel.getByLabel("Data e hora do envio");
await when.fill(await inHours(j, 30));
await panel.getByText(/A janela de 24h fecha em/).waitFor();
ok(true, "a time past the 24h window warns that a free text won't go");
await when.fill(await inHours(j, 2));
ok((await panel.getByText(/A janela de 24h fecha em/).count()) === 0, "…and not inside it");
await shot(j, "ev8-agendar");
await panel.getByRole("button", { name: "Agendar envio" }).click();
const scheduled = panel.getByRole("region", { name: "Mensagens agendadas" });
await scheduled.getByText(/^1 agendada · próxima \d{2}\/\d{2},? \d{2}:\d{2}$/).waitFor();
ok(true, "scheduled: one line above the composer, with the time");
await scheduled.getByRole("button", { name: /agendada/ }).click();
await scheduled.getByText("Bom dia, Bruno! Como combinado, seguem as opções.").waitFor();
ok(await scheduled.getByText(/^Agendada para \d{2}\/\d{2},? \d{2}:\d{2}/).isVisible(), "…the details open on demand");
ok(
  (await panel.getByLabel("Mensagem", { exact: true }).inputValue()) === "" && (await panel.getByRole("button", { name: "Enviar", exact: true }).isVisible()),
  "the composer is back to sending now",
);
await scheduled.getByRole("button", { name: "Cancelar" }).click();
await scheduled.waitFor({ state: "detached" });
ok((await sql(`SELECT status FROM crm_scheduled_messages`)) === "cancelada", "cancelled");

await panel.getByLabel("Mensagem", { exact: true }).fill("Oi Bruno, passando para lembrar da nossa conversa.");
await panel.getByRole("button", { name: "Agendar", exact: true }).click();
await panel.getByLabel("Data e hora do envio").fill(await inHours(j, 3));
await panel.getByRole("button", { name: "Agendar envio" }).click();
const toggle = scheduled.getByRole("button", { name: /1 agendada/ });
if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click(); // stays open while the panel is
await scheduled.getByText("Oi Bruno, passando para lembrar da nossa conversa.").waitFor();
ok(true, "scheduled again");

// A message that couldn't go shows why (the sending itself is covered by the API suite).
await sql(
  `INSERT INTO crm_scheduled_messages (id, contact_id, kind, body, send_at, status, error, created_by, created_by_name, updated_at)
   VALUES ('m-falhou', 'c2', 'text', 'Oi', now() - interval '1 hour', 'falhou', 'O contato se descadastrou.', 'u-joao', 'João', now())`,
);
await j.reload();
await go(j, "Conversas");
await j
  .getByRole("region", { name: "Conversas" })
  .getByRole("button", { name: /Bruno Souza/ })
  .click();
const again = j.getByRole("region", { name: "Contato Bruno Souza" }).getByRole("region", { name: "Mensagens agendadas" });
await again.getByText(/^1 agendada · próxima .* · 1 não enviada$/).waitFor();
await again.getByRole("button", { name: /não enviada/ }).click();
await again.getByText("O contato se descadastrou.", { exact: false }).waitFor();
ok(true, "a failure is counted, and shows its reason");
await shot(j, "ev8-agendadas");

// ---- the Gestor sees who scheduled; phone + dark ----
const { page: m } = await login(browser, "vitor", { errors, width: 390, height: 844, dark: true });
await m.getByRole("button", { name: "Abrir menu" }).click();
await go(m, "Conversas");
await m
  .getByRole("region", { name: "Conversas" })
  .getByRole("button", { name: /Bruno Souza/ })
  .click();
const dialog = m.getByRole("dialog", { name: "Contato Bruno Souza" });
const mine = dialog.getByRole("region", { name: "Mensagens agendadas" });
await mine.getByRole("button", { name: /agendada/ }).click();
await mine.getByText("· por João").waitFor();
ok(true, "the Gestor sees João's scheduled message");
await dialog.getByRole("button", { name: "Agendar", exact: true }).click();
await dialog.getByLabel("Data e hora do envio").waitFor();
await m.waitForTimeout(300);
ok((await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "no horizontal scroll on the phone");
await shot(m, "ev8-agendar-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("SCHEDULED MESSAGES E2E PASSED");
process.exit(0);
