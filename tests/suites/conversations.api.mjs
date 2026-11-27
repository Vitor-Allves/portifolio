// Fase 4 · entrega 1 through the API, on base + campaign fixtures: who is
// attending a WhatsApp conversation — answering takes a free one, someone
// else's needs an explicit takeover (409 otherwise, nothing sent), two
// people answering at the same moment can't both take it; assume,
// transfer (with a notice; only to someone who can answer and see the lead)
// and end; the new filters (atendimento, aguardando, etiqueta); response
// times; everything in the contact's history.
import { BASE, closeDb, fakeGraphSent, inbound, launchBrowser, login, ok, sql, webhook } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial

const say = (api, contactId, text, extra = {}) => api.post(`${BASE}/api/crm/contacts/${contactId}/messages/`, { data: { kind: "text", body: text, ...extra } }).then(json);
const att = (api, contactId, data) => api.post(`${BASE}/api/crm/contacts/${contactId}/attendance/`, { data }).then(json);
const attendant = (contactId) => sql(`SELECT COALESCE(attendant_id, 'none') FROM crm_contacts WHERE id = $1`, [contactId]);
const list = async (api, q) => (await json(await api.get(`${BASE}/api/crm/conversations/?${q}`))).body.rows;
const history = (contactId) => sql(`SELECT string_agg(payload->>'action', ',' ORDER BY created_at) FROM crm_events WHERE contact_id = $1 AND kind = 'attendance'`, [contactId]);

// ---- a free conversation waiting for us ----
ok((await inbound("5515990000005", "Oi, tudo bem? Queria um orçamento", "Eva")) === 200, "Eva (no owner) writes");
let rows = await list(vitor, "waiting=1");
const eva = rows.find((c) => c.id === "c5");
ok(eva && eva.waitingSince && Date.now() - Date.parse(eva.waitingSince) < 120_000 && eva.attendantId === null, "listed as waiting for us, nobody attending");
ok((await list(vitor, "attendant=none")).some((c) => c.id === "c5"), "filter: sem atendimento");

// ---- answering takes it ----
let sent = fakeGraphSent().length;
let r = await say(joao, "c5", "Oi Eva! Já te mando.");
ok(r.status === 200 && (await attendant("c5")) === "u-joao", "João answers → he is attending");
ok((await history("c5")) === "assumed", "…in the history");
ok(!(await list(vitor, "waiting=1")).some((c) => c.id === "c5"), "no longer waiting");
ok((await list(joao, "attendant=mine")).some((c) => c.id === "c5" && c.attendantName === "João"), "filter: meus atendimentos");
ok((await say(joao, "c5", "Segue a tabela")).status === 200 && (await history("c5")) === "assumed", "he keeps answering, nothing new in the history");

// ---- someone else needs an explicit takeover ----
const before = fakeGraphSent().length;
r = await say(vitor, "c5", "Oi, aqui é o Vitor");
ok(r.status === 409 && r.body.conflict === true && /João está atendendo/.test(r.body.error), "Vitor answering João's conversation is refused (409, says who)");
ok(fakeGraphSent().length === before, "…and nothing was sent");
r = await say(vitor, "c5", "Oi, aqui é o Vitor", { takeover: true });
ok(r.status === 200 && (await attendant("c5")) === "u-vitor", "with takeover, Vitor answers and attends");
ok((await sql(`SELECT payload->>'from' || '→' || (payload->>'to') FROM crm_events WHERE contact_id = 'c5' AND kind = 'attendance' AND payload->>'action' = 'takeover'`)) === "João→Vitor", "…history says from whom");
ok(fakeGraphSent().length - sent === 3, "three messages went out in total");

// ---- transfer, end ----
ok((await att(joao, "c5", { action: "end" })).status === 403, "João can't end Vitor's attendance");
ok((await att(joao, "c5", { action: "transfer", toUserId: "u-joao" })).status === 403, "…nor transfer it");
ok((await att(vitor, "c5", { action: "transfer", toUserId: "u-maria" })).status === 400, "can't transfer to someone who doesn't send WhatsApp (Marketing)");
r = await att(vitor, "c5", { action: "transfer", toUserId: "u-joao" });
ok(r.status === 200 && r.body.toName === "João" && (await attendant("c5")) === "u-joao", "Vitor transfers to João");
const notices = (await json(await joao.get(`${BASE}/api/crm/reminders/`))).body.notifications;
ok(notices.some((n) => n.title === "Conversa transferida para você: Eva Prado" && n.body === "Por Vitor." && n.contactId === "c5"), "João gets a notice in the bell");
ok((await att(joao, "c5", { action: "end" })).status === 200 && (await attendant("c5")) === "none", "João ends it");
ok((await history("c5")) === "assumed,takeover,transferred,ended", `history: ${await history("c5")}`);
await inbound("5515990000001", "Bom dia!", "Ana");
ok((await att(vitor, "c1", { action: "transfer", toUserId: "u-joao" })).status === 400, "can't give João a conversation of a lead he doesn't work on (Vitor's Ana)");
ok((await att(joao, "c1", { action: "assume" })).status === 403, "a Comercial can't touch someone else's lead");
ok((await att(vitor, "c1", { action: "assume" })).status === 200 && (await attendant("c1")) === "u-vitor", "Assumir");
ok((await att(admin, "c1", { action: "end" })).status === 200, "an Administrador ends anyone's attendance");
ok((await att(vitor, "c1", { action: "dance" })).status === 400, "unknown action refused");
await sql(`INSERT INTO internal_users (id, name, password_hash, role, username, crm_role, revoked_at) VALUES ('u-ex', 'Ex Atendente', 'x', 'analista', 'exatendente', 'comercial', now())`);
await sql(`UPDATE crm_contacts SET attendant_id = 'u-ex', attendant_since = now() WHERE id = 'c1'`);
ok((await say(vitor, "c1", "Olá Ana")).status === 200 && (await attendant("c1")) === "u-vitor", "a deactivated attendant doesn't block anyone");

// ---- two people answering a free conversation at the same moment ----
await inbound("5515990000002", "Vocês atendem sábado?", "Bruno");
sent = fakeGraphSent().length;
const [a1, a2] = await Promise.all([say(vitor, "c2", "Atendemos sim!"), say(admin, "c2", "Sim, até meio-dia")]);
ok([a1.status, a2.status].sort().join() === "200,409", `only one of them answers (${a1.status}, ${a2.status})`);
ok(fakeGraphSent().length - sent === 1, "…exactly one message went out");

// ---- etiquetas de atendimento ----
ok((await joao.post(`${BASE}/api/crm/contacts/c5/tags/`, { data: { tagId: "atendimento-duvida" } })).ok(), "an Atendimento tag on Eva");
ok((await list(vitor, "tag=atendimento-duvida")).map((c) => c.id).join() === "c5", "filter by tag");

// ---- response times ----
const stats = (await json(await vitor.get(`${BASE}/api/crm/conversations/stats/?days=7`))).body;
ok(stats.days === 7 && stats.team.answered === 3 && stats.team.avgMinutes === 0, `team: Eva, Ana and Bruno answered within the minute (${JSON.stringify(stats.team)})`);
ok(stats.people.some((p) => p.name === "João" && p.answered === 1) && stats.people.some((p) => p.name === "Vitor"), "per person: who answered first after each wait");
await inbound("5515990000005", "E o prazo?", "Eva");
ok((await json(await vitor.get(`${BASE}/api/crm/conversations/stats/?days=7`))).body.waitingNow >= 1, "waiting now counts Eva's new question");
const jstats = (await json(await joao.get(`${BASE}/api/crm/conversations/stats/?days=30`))).body;
ok(jstats.days === 30 && jstats.team.answered === 2, `a Comercial's numbers only cover the leads he sees (Eva and Bruno, not Vitor's Ana: ${jstats.team.answered})`);

// ---- a delivery for another number (Meta's "Teste" sample) is acknowledged and ignored ----
const contactsBefore = await sql(`SELECT count(*) FROM crm_contacts`);
const messagesBefore = await sql(`SELECT count(*) FROM crm_messages`);
const sample = await webhook({
  metadata: { display_phone_number: "16505551111", phone_number_id: "123456123" },
  contacts: [{ wa_id: "16315551181", profile: { name: "test user name" } }],
  messages: [{ from: "16315551181", id: "ABGGFlA5Fpa", timestamp: "1504902988", type: "text", text: { body: "this is a text message" } }],
});
ok(sample === 200, "Meta's sample for another number: 200, so Meta doesn't retry");
ok(
  (await sql(`SELECT count(*) FROM crm_contacts`)) === contactsBefore && (await sql(`SELECT count(*) FROM crm_messages`)) === messagesBefore,
  "…and nothing is stored (no made-up contact)",
);

await closeDb();
await browser.close();
console.log("CONVERSATIONS API PASSED");
