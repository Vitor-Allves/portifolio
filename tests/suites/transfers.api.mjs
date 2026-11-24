// Evolução v1.0 · responsabilidades through the API, on base + campaign
// fixtures: a Comercial sees every lead, opportunity and history but works
// only on their own (someone else's lead answers 403, its WhatsApp
// conversation stays closed), and the transfer request — asked with the
// reason, decided by a Gestor (approve moves the lead with its open
// opportunities and pending tasks; refuse needs a reason), cancelled by who
// asked, never applied when the lead changed hands meanwhile — with the
// history, the notices and the audit.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false }); // Administrador
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing
const contact = async (api, id) => json(await api.get(`${BASE}/api/crm/contacts/${id}/`));
const transfers = async (api, q = "") => (await json(await api.get(`${BASE}/api/crm/transfers/${q}`))).body.transfers;
const ask = async (api, data) => json(await api.post(`${BASE}/api/crm/transfers/`, { data }));
const decide = async (api, id, data) => json(await api.patch(`${BASE}/api/crm/transfers/${id}/`, { data }));

// Ana (c1) is Vitor's and talked on WhatsApp.
await sql(`INSERT INTO crm_messages (id, contact_id, direction, type, body, created_at) VALUES ('m-ana', 'c1', 'in', 'text', 'Quero falar sobre o orçamento', now())`);
await sql(`UPDATE crm_contacts SET last_message_at = now(), last_message_preview = 'Quero falar sobre o orçamento' WHERE id = 'c1'`);

// ---- sees everything, works only on their own ----
let r = await contact(joao, "c1");
ok(r.status === 200 && r.body.contact.ownerName === "Vitor" && r.body.contact.deals.length === 2, "João opens Vitor's lead, with its opportunities");
ok(r.body.contact.conversationHidden === true && r.body.contact.messages.length === 0 && r.body.contact.lastMessagePreview === null, "…without the WhatsApp conversation");
ok(r.body.contact.events.length > 0, "…with the commercial history");
ok((await contact(vitor, "c1")).body.contact.messages.length === 1, "the Gestor sees the conversation");
const card = (await json(await joao.get(`${BASE}/api/crm/deals/`))).body.deals.find((d) => d.id === "d6");
ok(card && card.lastMessagePreview === null, "the board shows Vitor's card to João, without the last message");
ok(((await json(await joao.get(`${BASE}/api/crm/contacts/?page=1&pageSize=100`))).body.rows.find((c) => c.id === "c1") ?? {}).lastMessagePreview === null, "…the contacts list too");
const convo = (await json(await joao.get(`${BASE}/api/crm/conversations/`))).body;
ok(!(convo.rows ?? convo.conversations ?? []).some((c) => c.id === "c1"), "Conversas lists only the conversations of his leads and the unowned");
r = await json(await joao.patch(`${BASE}/api/crm/contacts/c1/`, { data: { jobTitle: "Sócia" } }));
ok(r.status === 403 && /peça a transferência/.test(r.body.error), `editing someone else's lead is refused, pointing to the transfer (${r.body?.error})`);
ok((await json(await joao.post(`${BASE}/api/crm/contacts/c1/notes/`, { data: { text: "oi" } }))).status === 403, "no notes on it");
ok((await json(await joao.post(`${BASE}/api/crm/contacts/c1/messages/`, { data: { text: "Olá" } }))).status === 403, "no messages");
ok((await json(await joao.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "conversa" } }))).status === 403, "no moving its opportunities");
ok((await json(await joao.post(`${BASE}/api/crm/tasks/`, { data: { contactId: "c1", title: "Ligar" } }))).status === 403, "no tasks on it");
ok((await json(await joao.post(`${BASE}/api/crm/deals/`, { data: { contactId: "c1", title: "Outra" } }))).status === 403, "no new opportunities on it");
ok((await json(await joao.patch(`${BASE}/api/crm/contacts/c2/`, { data: { jobTitle: "Gerente" } }))).status === 200, "his own lead, as always");
ok((await json(await joao.patch(`${BASE}/api/crm/contacts/c5/`, { data: { ownerId: "u-joao" } }))).status === 200, "…and he takes an unowned one");
await sql(`UPDATE crm_contacts SET owner_id = NULL WHERE id = 'c5'`);

// ---- asking for a lead ----
ok((await ask(joao, { contactId: "c1", reason: "oi" })).status === 400, "a transfer needs the reason");
ok((await ask(joao, { contactId: "c5", reason: "Quero esse lead" })).status === 400, "an unowned lead is just taken");
ok((await ask(joao, { contactId: "c2", reason: "Para mim mesmo" })).status === 400, "…and his own is already his");
ok((await ask(vitor, { contactId: "c2", reason: "Quero o Bruno" })).status === 400, "a Gestor changes the owner directly, without asking");
r = await ask(joao, { contactId: "c1", reason: "A Ana me procurou direto pelo Instagram" });
ok(r.status === 201 && r.body.transfer.status === "pendente" && r.body.transfer.fromOwnerName === "Vitor" && r.body.transfer.toOwnerName === "João", "João asks for Ana");
const t1 = r.body.transfer.id;
ok((await ask(joao, { contactId: "c1", reason: "De novo, por favor" })).status === 400, "one open request per lead");
ok((await contact(joao, "c1")).body.contact.pendingTransfer?.id === t1, "the request shows on the lead");
const ev = JSON.parse(await sql(`SELECT payload::text FROM crm_events WHERE contact_id = 'c1' AND kind = 'transfer' ORDER BY created_at DESC LIMIT 1`));
ok(ev.action === "requested" && ev.reason === "A Ana me procurou direto pelo Instagram" && ev.requestedBy === "João", "…and in its history");
const notified = (await sql(`SELECT string_agg(user_id, ',' ORDER BY user_id) FROM crm_notifications WHERE kind = 'transferencia'`)) ?? "";
ok(notified === "u-admin,u-vitor", `the Gestor and the Administrador get a notice (${notified})`);
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.transfer_request'`)) === "1", "…audited");
ok((await transfers(joao)).length === 1 && (await transfers(maria)).length === 0 && (await transfers(vitor, "?status=pendente")).length === 1, "who sees which requests");

// ---- deciding ----
ok((await decide(joao, t1, { decision: "aprovar" })).status === 403, "a Comercial doesn't approve");
ok((await decide(vitor, t1, { decision: "recusar" })).status === 400, "refusing needs the reason");
r = await decide(vitor, t1, { decision: "aprovar", note: "Pode seguir" });
ok(r.status === 200 && r.body.transfer.status === "aprovada" && r.body.transfer.decidedByName === "Vitor", "the Gestor approves");
ok((await sql(`SELECT owner_id FROM crm_contacts WHERE id = 'c1'`)) === "u-joao", "Ana is João's now");
ok((await sql(`SELECT owner_id FROM crm_deals WHERE id = 'd6'`)) === "u-joao" && (await sql(`SELECT owner_id FROM crm_deals WHERE id = 'd1'`)) === "u-vitor", "…with her open opportunity (the closed sale stays Vitor's)");
ok((await sql(`SELECT owner_id FROM crm_tasks WHERE id = 't5'`)) === "u-joao", "…and her pending task");
ok(
  (await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c1' AND kind = 'owner' AND payload->>'via' = 'transferencia'`)) === "2" &&
    (await sql(`SELECT payload->>'action' FROM crm_events WHERE contact_id = 'c1' AND kind = 'transfer' ORDER BY created_at DESC LIMIT 1`)) === "aprovada",
  "the owner changes and the decision are in the history"
);
ok((await sql(`SELECT count(*) FROM crm_notifications WHERE user_id = 'u-joao' AND title = 'Transferência aprovada: Ana Ribeiro'`)) === "1", "João is told");
ok(JSON.parse(await sql(`SELECT metadata::text FROM audit_log WHERE action = 'crm.transfer_decision'`)).status === "aprovada", "…audited");
ok((await json(await joao.patch(`${BASE}/api/crm/contacts/c1/`, { data: { jobTitle: "Sócia" } }))).status === 200, "João works on Ana now");
ok((await contact(joao, "c1")).body.contact.messages.length === 1, "…and reads her conversation");
ok((await decide(vitor, t1, { decision: "recusar", note: "x" })).status === 400, "a decided request can't be decided again");

// ---- handing one's own lead, refused ----
r = await ask(joao, { contactId: "c3", toOwnerId: "u-vitor", reason: "Carla quer falar com o gerente" });
ok(r.status === 201 && r.body.transfer.fromOwnerName === "João" && r.body.transfer.toOwnerName === "Vitor", "João asks to hand Carla to Vitor");
ok((await ask(joao, { contactId: "c4", toOwnerId: "u-maria", reason: "Para a Maria" })).status === 403, "…but can't move someone else's lead to a third person");
r = await decide(vitor, r.body.transfer.id, { decision: "recusar", note: "Continue com ela, você conhece o caso" });
ok(r.status === 200 && r.body.transfer.status === "recusada" && (await sql(`SELECT owner_id FROM crm_contacts WHERE id = 'c3'`)) === "u-joao", "refused: Carla stays João's");

// ---- cancelled; and a lead that changed hands meanwhile ----
r = await ask(joao, { contactId: "c4", reason: "Davi é meu vizinho de escritório" });
ok((await json(await maria.delete(`${BASE}/api/crm/transfers/${r.body.transfer.id}/`))).status === 404, "only who asked cancels");
ok((await json(await joao.delete(`${BASE}/api/crm/transfers/${r.body.transfer.id}/`))).body.transfer.status === "cancelada", "João cancels his request");
r = await ask(joao, { contactId: "c4", reason: "Davi pediu para falar comigo" });
await json(await vitor.patch(`${BASE}/api/crm/contacts/c4/`, { data: { ownerId: "u-admin" } }));
r = await decide(vitor, r.body.transfer.id, { decision: "aprovar" });
ok(r.status === 400 && /mudou/.test(r.body.error) && (await sql(`SELECT owner_id FROM crm_contacts WHERE id = 'c4'`)) === "u-admin", "a lead that changed hands since the request isn't moved");

// ---- the Painel per person, goals and reports: only one's own ----
const dash = (await json(await joao.get(`${BASE}/api/crm/dashboard/?from=2026-10-01&to=2026-10-31&owner=all`))).body.dashboard;
ok(dash.team.length === 1 && dash.team[0].ownerId === "u-joao", "João's Painel: the team's numbers, his line only");
ok((await json(await joao.get(`${BASE}/api/crm/goals/?month=2026-10`))).body.goals.rows.every((x) => x.userId === "u-joao"), "Metas: only his own");

await closeDb();
await browser.close();
console.log("TRANSFERS API PASSED");
