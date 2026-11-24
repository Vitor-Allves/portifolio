// Evolução v1.0 · mensagens agendadas (item 11) through the API, on base +
// campaign fixtures, against the fake WhatsApp API: who may schedule, what
// is refused, cancelling, sending at the time (by the scheduler with its
// secret, and by the CRM's own bell polling), never twice, and every rule
// of a send checked again at the time — window, owner, opt-out, someone
// else attending — with the reason and a notice when it doesn't go.
import { BASE, closeDb, fakeGraphSent, inbound, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const CRON = "test-only-cron-secret"; // tests/run.sh starts this suite's server with it
const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing

const url = (contactId) => `${BASE}/api/crm/contacts/${contactId}/scheduled-messages/`;
const later = (minutes = 60) => new Date(Date.now() + minutes * 60_000).toISOString();
const schedule = (api, contactId, data) => api.post(url(contactId), { data: { kind: "text", sendAt: later(), ...data } }).then(json);
const due = (id) => sql(`UPDATE crm_scheduled_messages SET send_at = now() - interval '1 minute' WHERE id = $1`, [id]);
const cron = (secret = CRON) => fetch(`${BASE}/api/cron/scheduled-messages/`, { headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
const dispatch = async () => (await (await cron()).json()).scheduledMessages;
const row = async (id) => JSON.parse(await sql(`SELECT row_to_json(m)::text FROM crm_scheduled_messages m WHERE id = $1`, [id]));
const BRUNO = "5515990000002"; // c2, João's lead

// Bruno writes: the 24h window is open.
ok((await inbound(BRUNO, "Oi, me chama amanhã cedo")) === 200, "Bruno (João's lead) writes");

// ---- who, and what is refused ----
ok((await schedule(joao, "c1", { body: "Oi Ana" })).status === 403, "the Comercial doesn't schedule on someone else's lead");
ok((await schedule(maria, "c2", { body: "Oi" })).status === 403, "Marketing doesn't send WhatsApp");
ok((await schedule(joao, "c2", { body: "Oi", sendAt: new Date(Date.now() - 60_000).toISOString() })).status === 400, "a time in the past is refused");
ok((await schedule(joao, "c2", { body: "Oi", sendAt: later(31 * 24 * 60) })).status === 400, "at most 30 days ahead");
ok((await schedule(joao, "c2", { body: "Oi", sendAt: "amanhã" })).status === 400, "a date is needed");
ok((await schedule(joao, "c2", { body: "   " })).status === 400, "an empty text is refused");
ok((await schedule(joao, "c2", { body: "x".repeat(4097) })).status === 400, "…and one longer than WhatsApp's limit");
ok((await schedule(joao, "c2", { kind: "audio", body: "Oi" })).status === 400, "only a text or a template");
ok(
  (await schedule(joao, "c2", { kind: "template", name: "boas_vindas", language: "pt_BR", params: ["Bruno", ""] })).status === 400,
  "every field of the template filled",
);
await json(await vitor.patch(`${BASE}/api/crm/contacts/c4/`, { data: { optedOut: true } }));
ok((await schedule(vitor, "c4", { body: "Oi Davi" })).status === 400, "an opted-out contact gets no scheduled message");

// ---- schedule, list, cancel ----
let r = await schedule(joao, "c2", { body: "Bom dia, Bruno! Como combinado, seguem as opções." });
ok(r.status === 201 && r.body.message.status === "pendente" && r.body.message.createdByName === "João", "João schedules a message to Bruno");
const m1 = r.body.message.id;
let list = (await json(await joao.get(url("c2")))).body.messages;
ok(list.length === 1 && list[0].id === m1, "it shows on the conversation");
ok(
  (await json(await joao.get(url("c1")))).status === 403,
  "the Comercial doesn't see the scheduled messages of someone else's lead (its conversation is hidden)",
);
ok((await json(await vitor.get(url("c2")))).body.messages.length === 1, "the Gestor sees them");
ok(
  (await sql(`SELECT payload->>'action' FROM crm_events WHERE contact_id = 'c2' AND kind = 'scheduled_message' ORDER BY created_at DESC LIMIT 1`)) ===
    "scheduled",
  "in the lead's history",
);
ok((await json(await joao.delete(`${url("c2")}${m1}/`))).body.message.status === "cancelada", "João cancels it");
ok((await json(await joao.delete(`${url("c2")}${m1}/`))).status === 409, "…once");
ok((await json(await joao.delete(`${url("c2")}nao-existe/`))).status === 404, "an unknown one is not found");
await due(m1);
ok((await cron(null)).status === 401 && (await cron("errado")).status === 401, "the sending endpoint needs the scheduler's secret");
let sent = fakeGraphSent().length;
ok((await dispatch()).sent === 0 && fakeGraphSent().length === sent, "a cancelled message never goes");

// ---- sending at the time, once ----
r = await schedule(joao, "c2", { body: "Bom dia, Bruno! Seguem as opções." });
const m2 = r.body.message.id;
let res = await dispatch();
ok(res.sent === 0 && (await row(m2)).status === "pendente", "before the time, nothing goes");
await due(m2);
const results = await Promise.all([dispatch(), dispatch(), dispatch()]);
ok(results.reduce((a, x) => a + x.sent, 0) === 1, "three runs at the same moment: sent once");
const out = fakeGraphSent().slice(sent);
ok(out.length === 1 && out[0].to === BRUNO && out[0].type === "text" && out[0].text === "Bom dia, Bruno! Seguem as opções.", "the fake WhatsApp got it once");
let m = await row(m2);
ok(m.status === "enviada" && m.wa_message_id && m.sent_at, "marked sent, with WhatsApp's id");
ok(
  (await sql(`SELECT sent_by FROM crm_messages WHERE contact_id = 'c2' AND direction = 'out' AND body = 'Bom dia, Bruno! Seguem as opções.'`)) === "u-joao",
  "in the conversation, sent by João",
);
ok((await sql(`SELECT attendant_id FROM crm_contacts WHERE id = 'c2'`)) === "u-joao", "…who is now attending it, as when he answers");

// ---- templates: any time ----
await sql(`UPDATE crm_contacts SET last_inbound_at = now() - interval '2 days' WHERE id = 'c2'`);
r = await schedule(joao, "c2", { kind: "template", name: "retomada", language: "pt_BR", params: ["Bruno"] });
ok(r.status === 201, "a template can be scheduled with the window closed");
await due(r.body.message.id);
sent = fakeGraphSent().length;
ok((await dispatch()).sent === 1 && fakeGraphSent()[sent].template === "retomada" && fakeGraphSent()[sent].params[0] === "Bruno", "…and goes out");

// ---- checked again at the time: not sent, with the reason ----
const failed = async (id, re, label) => {
  await due(id);
  const before = fakeGraphSent().length;
  await dispatch();
  const x = await row(id);
  ok(x.status === "falhou" && re.test(x.error) && fakeGraphSent().length === before, `${label} (${x.error})`);
};
r = await schedule(joao, "c2", { body: "Oi Bruno, lembrete" });
await failed(r.body.message.id, /janela de 24h/, "a free text with the window closed at the time is not sent");
ok(
  (await sql(
    `SELECT count(*) FROM crm_notifications WHERE user_id = 'u-joao' AND kind = 'mensagem' AND title = 'Mensagem agendada não enviada: Bruno Souza'`,
  )) === "1",
  "João is told",
);
ok(
  (await sql(`SELECT payload->>'action' FROM crm_events WHERE contact_id = 'c2' AND kind = 'scheduled_message' ORDER BY created_at DESC, seq DESC LIMIT 1`)) ===
    "failed",
  "…and it's in the history",
);
ok((await inbound(BRUNO, "Pode mandar")) === 200, "Bruno writes again");
r = await schedule(joao, "c2", { body: "Oi Bruno" });
await json(await vitor.post(`${BASE}/api/crm/contacts/c2/attendance/`, { data: { action: "assume" } }));
await failed(r.body.message.id, /Vitor está atendendo/, "someone else took over the conversation: not sent over them");
await json(await vitor.post(`${BASE}/api/crm/contacts/c2/attendance/`, { data: { action: "transfer", toUserId: "u-joao" } }));
r = await schedule(joao, "c2", { body: "Oi Bruno" });
await json(await joao.patch(`${BASE}/api/crm/contacts/c2/`, { data: { optedOut: true } }));
await failed(r.body.message.id, /descadastrou/, "the contact opted out meanwhile");
await json(await joao.patch(`${BASE}/api/crm/contacts/c2/`, { data: { optedOut: false } }));
r = await schedule(joao, "c2", { body: "Oi Bruno" });
await json(await vitor.patch(`${BASE}/api/crm/contacts/c2/`, { data: { ownerId: "u-vitor" } }));
await failed(r.body.message.id, /passou para outra pessoa/, "the lead went to someone else");
await json(await vitor.patch(`${BASE}/api/crm/contacts/c2/`, { data: { ownerId: "u-joao" } }));

// ---- interrupted mid-send: never re-sent on its own ----
r = await schedule(joao, "c2", { body: "Oi Bruno" });
await sql(
  `UPDATE crm_scheduled_messages SET status = 'enviando', claimed_at = now() - interval '11 minutes', send_at = now() - interval '11 minutes' WHERE id = $1`,
  [r.body.message.id],
);
sent = fakeGraphSent().length;
res = await dispatch();
ok(
  res.interrupted === 1 && (await row(r.body.message.id)).status === "falhou" && fakeGraphSent().length === sent,
  "one stuck sending becomes 'não enviada', not re-sent",
);

// ---- the CRM's own polling sends them too ----
r = await schedule(joao, "c2", { body: "Bom dia! Enviada pelo sino." });
await due(r.body.message.id);
await joao.get(`${BASE}/api/crm/reminders/`);
let status = "pendente";
for (let i = 0; i < 40 && status !== "enviada"; i++) {
  await new Promise((done) => setTimeout(done, 250));
  status = (await row(r.body.message.id)).status;
}
ok(status === "enviada", "the bell's poll sends a due message after answering");
list = (await json(await joao.get(url("c2")))).body.messages;
ok(
  list.filter((x) => x.status === "falhou").every((x) => x.error),
  "the list shows each failure's reason",
);

// ---- limit per contact ----
for (let i = 0; i < 10; i++) await schedule(joao, "c2", { body: `Lembrete ${i}`, sendAt: later(120 + i) });
ok((await schedule(joao, "c2", { body: "Mais um" })).status === 400, "at most 10 waiting per contact");

await browser.close();
await closeDb();
console.log("SCHEDULED MESSAGES API PASSED");
