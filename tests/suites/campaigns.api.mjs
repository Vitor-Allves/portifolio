// Campanhas (Fase 5) through the API, on base + campaign fixtures, with the
// fake Meta API: permissions, audience rules, variables, sending, SAIR,
// parallel batches, delivery/read/reply, rate limit, cancel, abandoned sends.
import { BASE, closeDb, fakeGraphRateLimit, fakeGraphSent as sent, inbound, launchBrowser, ok, sql, webhook as hook } from "../lib/helpers.mjs";

const browser = await launchBrowser();
async function login(username) {
  const ctx = await browser.newContext();
  const r = await ctx.request.post(`${BASE}/api/analise/login/`, { data: { username, password: "crm-teste-123" } });
  ok(r.ok(), `login ${username}`);
  return ctx.request;
}
const PROMO = "Olá {{1}}! A {{2}} tem uma condição especial em novembro. Responda SIM para saber mais ou SAIR para não receber.";
const draft = (audience, extra = {}) => ({ name: "Promo novembro BNI", templateName: "promo_novembro", templateLanguage: "pt_BR", templateBody: PROMO, params: [{ source: "first_name", text: "" }, { source: "company", text: "nossa equipe" }], audience, ...extra });
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
async function runToEnd(api, id) {
  for (let i = 0; i < 20; i++) {
    const r = await json(await api.post(`${BASE}/api/crm/campaigns/${id}/send/`, { data: { action: "batch" } }));
    if (r.status !== 200) return r;
    if (r.body.status !== "enviando") return r;
  }
  throw new Error("batch never ended");
}

const admin = await login("admin");
const gestor = await login("vitor");
const comercial = await login("joao");
const mkt = await login("maria");

// ---- permissions ----
ok((await fetch(`${BASE}/api/crm/campaigns/`)).status === 401, "anonymous refused");
ok((await comercial.get(`${BASE}/api/crm/campaigns/`)).status() === 403, "Comercial can't see campaigns");
ok((await mkt.get(`${BASE}/api/crm/campaigns/`)).status() === 200, "Marketing sees campaigns");
const created = await json(await mkt.post(`${BASE}/api/crm/campaigns/`, { data: draft({ source: "bni" }) }));
ok(created.status === 200 && created.body.id, "Marketing creates a draft");
const id = created.body.id;
ok((await json(await mkt.post(`${BASE}/api/crm/campaigns/${id}/send/`, { data: { action: "start" } }))).status === 403, "Marketing can't start sending");
ok((await json(await comercial.post(`${BASE}/api/crm/campaigns/`, { data: draft({}) }))).status === 403, "Comercial can't create");
ok((await json(await gestor.post(`${BASE}/api/crm/campaigns/`, { data: { name: "  " } }))).status === 400, "a campaign needs a name");

// ---- preview ----
const pv = (await json(await mkt.post(`${BASE}/api/crm/campaigns/preview/`, { data: { audience: { source: "bni" }, params: draft({}).params, templateBody: PROMO } }))).body.preview;
const ex = Object.fromEntries(pv.excluded.map((e) => [e.reason, e.count]));
ok(pv.matched === 7 && pv.eligible === 3, `preview: 7 matched, 3 eligible (got ${pv.matched}/${pv.eligible})`);
ok(ex.sem_consentimento === 2 && ex.descadastrado === 1 && ex.sem_telefone === 1 && !ex.arquivado, "excluded: 2 no consent, 1 unsubscribed, 1 no phone; archived never listed");
ok(pv.sample[0].message.startsWith("Olá Gabriela! A Clínica Sol"), "sample message filled with first name + company");
ok(pv.sample.some((s) => s.message.includes("A nossa equipe")), "missing company → fallback text");

// ---- start ----
ok((await json(await gestor.patch(`${BASE}/api/crm/campaigns/${id}/`, { data: draft({ source: "bni" }, { name: "Promo novembro BNI" }) }))).status === 200, "draft edited");
const st = await json(await gestor.post(`${BASE}/api/crm/campaigns/${id}/send/`, { data: { action: "start" } }));
ok(st.status === 200 && st.body.recipients === 3 && st.body.skipped === 4, `start freezes 3 recipients, 4 left out (${JSON.stringify(st.body)})`);
ok((await json(await gestor.post(`${BASE}/api/crm/campaigns/${id}/send/`, { data: { action: "start" } }))).status === 400, "can't start twice");
ok((await json(await gestor.patch(`${BASE}/api/crm/campaigns/${id}/`, { data: draft({}) }))).status === 400, "can't edit after start");
ok((await json(await gestor.delete(`${BASE}/api/crm/campaigns/${id}/`))).status === 400, "can't delete after start");

// ---- opt-out before the batch reaches him: Henrique answers SAIR ----
ok((await inbound("5515990000012", "Sair.")) === 200, "signed inbound SAIR accepted");
ok(await sql("SELECT opted_out_at IS NOT NULL FROM crm_contacts WHERE id='k2'") === "t", "SAIR unsubscribes the contact");
ok(sent().some((s) => s.to === "5515990000012" && s.type === "text" && s.text.includes("não vai mais receber")), "confirmation sent to him");
ok(await sql("SELECT payload->>'auto' FROM crm_events WHERE contact_id='k2' AND kind='opt_out'") === "true", "opt-out event logged as automatic");
await inbound("5515990000011", "quero sair mais cedo hoje");
ok(await sql("SELECT opted_out_at IS NULL FROM crm_contacts WHERE id='k1'") === "t", "a sentence with 'sair' doesn't unsubscribe");

// ---- two batches at once ----
const [a, b] = await Promise.all([runToEnd(gestor, id), runToEnd(admin, id)]);
ok(a.status === 200 && b.status === 200, "two parallel batch loops both finish");
const tpl = sent().filter((s) => s.template === "promo_novembro");
ok(tpl.length === 2 && tpl.filter((s) => s.to === "5515990000011").length === 1, `each contact got the template once (sends: ${tpl.map((s) => s.to).join(",")})`);
ok(!tpl.some((s) => s.to === "5515990000012"), "the one who said SAIR was skipped at send time");
ok(JSON.stringify(tpl.find((s) => s.to === "5515990000011").params) === JSON.stringify(["Gabriela", "Clínica Sol"]), "variables resolved per contact");
let det = (await json(await mkt.get(`${BASE}/api/crm/campaigns/${id}/`))).body.campaign;
ok(det.status === "concluida" && det.finishedAt, "campaign concluded");
ok(det.counts.audience === 7 && det.counts.skipped === 5 && det.counts.sent === 1 && det.counts.failed === 1, `counts 7/5/1/1 (${JSON.stringify(det.counts)})`);
const lucas = det.recipients.find((r) => r.name === "Lucas Erro");
ok(lucas.status === "falhou" && /sem WhatsApp/i.test(lucas.detail), "failure reason shown");
ok(det.recipients.find((r) => r.name === "Henrique Alves").detail === "Pediu para não receber", "skip reason shown");

// ---- delivery, read, reply, new opportunity ----
const wamid = await sql("SELECT wa_message_id FROM crm_campaign_recipients WHERE contact_id='k1' AND campaign_id='" + id + "'");
await hook({ statuses: [{ id: wamid, status: "delivered" }] });
await hook({ statuses: [{ id: wamid, status: "read" }] });
await inbound("5515990000011", "Quero saber mais!");
det = (await json(await mkt.get(`${BASE}/api/crm/campaigns/${id}/`))).body.campaign;
ok(det.counts.delivered === 1 && det.counts.read === 1, "delivered/read follow WhatsApp statuses");
ok(det.counts.replied === 1 && det.recipients.find((r) => r.name === "Gabriela Mota").replied, "reply counted");
ok(det.counts.newDeals === 0, "no opportunity yet");
const contact = (await json(await gestor.get(`${BASE}/api/crm/contacts/k1/`))).body;
const msgs = (contact.contact ?? contact).messages;
ok(msgs.some((m) => m.campaignName === "Promo novembro BNI" && m.body.startsWith("Olá Gabriela")), "message in the conversation, tagged with the campaign");
ok(await sql("SELECT count(*) FROM audit_log WHERE action='crm.campaign_send' AND target_id='" + id + "'") === "1", "start logged in the audit trail");

// ---- template no longer approved ----
const bad = (await json(await gestor.post(`${BASE}/api/crm/campaigns/`, { data: draft({ source: "site" }, { name: "Pendente", templateName: "pendente" }) }))).body.id;
const badStart = await json(await gestor.post(`${BASE}/api/crm/campaigns/${bad}/send/`, { data: { action: "start" } }));
ok(badStart.status === 400 && /não está mais aprovado/.test(badStart.body.error), "template not approved → refused");
ok((await json(await gestor.delete(`${BASE}/api/crm/campaigns/${bad}/`))).status === 200, "draft deleted");

// ---- rate limit pauses, resume finishes ----
const rl = (await json(await gestor.post(`${BASE}/api/crm/campaigns/`, { data: draft({ source: "site" }, { name: "Site" }) }))).body.id;
ok((await json(await gestor.post(`${BASE}/api/crm/campaigns/${rl}/send/`, { data: { action: "start" } }))).body.recipients === 1, "site audience: 1 recipient");
fakeGraphRateLimit(true);
let r = await runToEnd(gestor, rl);
ok(r.body.status === "pausada" && /limitou/.test(r.body.pauseReason), "Meta rate limit pauses the campaign");
ok(await sql(`SELECT status FROM crm_campaign_recipients WHERE campaign_id='${rl}' AND contact_id='k8'`) === "pendente", "the throttled recipient goes back to pending");
fakeGraphRateLimit(false);
ok((await json(await gestor.post(`${BASE}/api/crm/campaigns/${rl}/send/`, { data: { action: "batch" } }))).body.sentNow === 0, "a paused campaign doesn't send");
await gestor.post(`${BASE}/api/crm/campaigns/${rl}/send/`, { data: { action: "resume" } });
r = await runToEnd(gestor, rl);
ok(r.body.status === "concluida" && r.body.counts.sent === 1, "resume finishes it");

// ---- cancel ----
const cx = (await json(await gestor.post(`${BASE}/api/crm/campaigns/`, { data: draft({}, { name: "Todos" }) }))).body.id;
await gestor.post(`${BASE}/api/crm/campaigns/${cx}/send/`, { data: { action: "start" } });
const before = sent().length;
const cc = await json(await gestor.post(`${BASE}/api/crm/campaigns/${cx}/send/`, { data: { action: "cancel" } }));
ok(cc.body.status === "cancelada" && cc.body.counts.pending === 0, "cancel: nobody left pending");
await gestor.post(`${BASE}/api/crm/campaigns/${cx}/send/`, { data: { action: "batch" } });
ok(sent().length === before, "nothing sent after cancel");
ok(await sql("SELECT count(*) FROM audit_log WHERE action='crm.campaign_cancel'") === "1", "cancel logged");

// ---- stale claim: never resent ----
const sc = (await json(await gestor.post(`${BASE}/api/crm/campaigns/`, { data: draft({ owner: "u-vitor" }, { name: "Vitor" }) }))).body.id;
ok((await json(await gestor.post(`${BASE}/api/crm/campaigns/${sc}/send/`, { data: { action: "start" } }))).body.recipients === 2, "owner audience: 2 recipients");
await sql(`UPDATE crm_campaign_recipients SET status='enviando', claimed_at=now()-interval '5 minutes' WHERE campaign_id='${sc}' AND contact_id='k8'`);
const before2 = sent().filter((s) => s.to === "5515990000018").length;
r = await runToEnd(gestor, sc);
ok(sent().filter((s) => s.to === "5515990000018").length === before2, "abandoned mid-send recipient is not resent");
ok(await sql(`SELECT status FROM crm_campaign_recipients WHERE campaign_id='${sc}' AND contact_id='k8'`) === "falhou", "…it is marked failed for a person to check");
ok(r.body.status === "concluida", "campaign still concludes");

// ---- list ----
const list = (await json(await mkt.get(`${BASE}/api/crm/campaigns/`))).body.campaigns;
ok(list.length === 4 && list.every((c) => c.counts), "list shows the 4 campaigns with numbers");
ok((await fetch(`${BASE}/api/whatsapp/webhook/`, { method: "POST", body: "{}" })).status === 401, "unsigned webhook still refused");
await browser.close();
await closeDb();
console.log("CAMPAIGNS API PASSED");
