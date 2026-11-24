// Fase 4 · entrega 2 through the API, on base + campaign fixtures (fake Meta
// API): taking people out of one campaign by hand (preview, the "Quem vai
// receber" list, sending), the sign-up period filter (Brasília days), saved
// audiences, and "interessados" in the results.
import { BASE, closeDb, fakeGraphSent as sent, inbound, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: gestor } = await login(browser, "vitor", { open: false });
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: mkt } = await login(browser, "maria", { open: false }); // Marketing

const PROMO = "Olá {{1}}! A {{2}} tem uma condição especial em novembro. Responda SIM para saber mais ou SAIR para não receber.";
const PARAMS = [{ source: "first_name", text: "" }, { source: "company", text: "nossa equipe" }];
const preview = async (audience) => (await json(await mkt.post(`${BASE}/api/crm/campaigns/preview/`, { data: { audience, params: PARAMS, templateBody: PROMO } }))).body.preview;
const members = (api, audience, extra = {}) => api.post(`${BASE}/api/crm/campaigns/preview/list/`, { data: { audience, ...extra } }).then(json);

// BNI fixture: Gabriela (k1), Henrique (k2) and Lucas (k6) can receive; four others can't.
// ---- taking someone out by hand ----
let pv = await preview({ source: "bni" });
ok(pv.eligible === 3 && pv.excludedByHand === 0, `BNI: 3 can receive (${pv.eligible})`);
pv = await preview({ source: "bni", exclude: ["k6"] });
ok(pv.eligible === 2 && pv.excludedByHand === 1 && pv.matched === 6, `Lucas taken out: 2 receive, 1 by hand, 6 left in the filter (${JSON.stringify(pv)})`);
pv = await preview({ source: "bni", exclude: ["k4"] });
ok(pv.eligible === 3 && pv.excludedByHand === 0, "taking out someone who couldn't receive anyway changes nothing");

let r = await members(mkt, { source: "bni", exclude: ["k6"] });
ok(r.status === 200 && r.body.total === 3 && r.body.rows.map((m) => m.name).join() === "Gabriela Mota,Henrique Alves,Lucas Erro", `list: the 3 who can receive (${r.body?.rows?.map((m) => m.name)})`);
ok(r.body.rows.find((m) => m.id === "k6").excluded === true && r.body.rows.filter((m) => m.excluded).length === 1, "…Lucas flagged as taken out");
ok(r.body.rows[0].company === "Clínica Sol" && r.body.rows[0].ownerName === "Vitor", "…with company and owner");
r = await members(mkt, { source: "bni" }, { q: "gab" });
ok(r.body.total === 1 && r.body.rows[0].id === "k1", "search by name");
r = await members(mkt, { source: "bni" }, { q: "0012" });
ok(r.body.total === 1 && r.body.rows[0].id === "k2", "search by phone");
r = await members(mkt, { source: "bni" }, { page: 2 });
ok(r.body.rows.length === 0 && r.body.page === 2 && r.body.pageSize === 50, "pages of 50");
ok((await members(joao, { source: "bni" })).status === 403, "a Comercial can't see campaign audiences");
await sql(`UPDATE internal_users SET crm_permissions = '{"editCampaigns": true}'::jsonb WHERE id = 'u-joao'`);
r = await members(joao, { source: "bni" });
ok(r.status === 200 && r.body.rows.map((m) => m.id).join() === "k1,k2,k6", `…given the campaigns screen, he lists every lead he sees (${r.body?.rows?.map((m) => m.id)})`);
await sql(`UPDATE internal_users SET crm_permissions = '{"editCampaigns": true, "seeAllLeads": false}'::jsonb WHERE id = 'u-joao'`);
r = await members(joao, { source: "bni" });
ok(r.status === 200 && r.body.rows.map((m) => m.id).join() === "k2,k6", `…and without "ver todos os leads", only his own and the unowned (${r.body?.rows?.map((m) => m.id)})`);
await sql(`UPDATE internal_users SET crm_permissions = '{}'::jsonb WHERE id = 'u-joao'`);

// ---- sign-up period, in Brasília days ----
// 02:00 UTC on Jan 15 is still Jan 14 in Brasília.
await sql(`UPDATE crm_contacts SET created_at = '2026-01-15T02:00:00Z' WHERE id = 'k2'`);
pv = await preview({ source: "bni", createdTo: "2026-01-14" });
ok(pv.eligible === 1 && pv.sample[0].name === "Henrique Alves", "cadastrados até 14/01: Henrique (signed up on the 14th, Brasília time)");
pv = await preview({ source: "bni", createdFrom: "2026-01-15", createdTo: "2026-01-15" });
ok(pv.matched === 0, "nobody on the 15th (the UTC date doesn't count)");
pv = await preview({ source: "bni", createdFrom: "2026-01-15" });
ok(pv.eligible === 2 && !pv.sample.some((s) => s.name === "Henrique Alves"), "cadastrados a partir de 15/01: the other two");
pv = await preview({ source: "bni", createdFrom: "ontem", createdTo: "2026-02-31" });
ok(pv.eligible === 3, "invalid dates are ignored");

// ---- saved audiences ----
ok((await joao.get(`${BASE}/api/crm/campaigns/audiences/`)).status() === 403, "a Comercial can't see saved audiences");
r = await json(await mkt.post(`${BASE}/api/crm/campaigns/audiences/`, { data: { name: "  ", audience: { source: "bni" } } }));
ok(r.status === 400, "a saved audience needs a name");
r = await json(await mkt.post(`${BASE}/api/crm/campaigns/audiences/`, { data: { name: "Leads do BNI", audience: { source: "bni", exclude: ["k6"], createdFrom: "2026-01-01" } } }));
ok(r.status === 200 && r.body.audience.name === "Leads do BNI" && r.body.audience.createdByName === "Maria Marketing", "Marketing saves the filters under a name");
ok(JSON.stringify(r.body.audience.audience) === JSON.stringify({ source: "bni", createdFrom: "2026-01-01" }), "…without the people taken out by hand");
const savedId = r.body.audience.id;
r = await json(await gestor.post(`${BASE}/api/crm/campaigns/audiences/`, { data: { name: "LEADS DO BNÍ", audience: { source: "bni", owner: "u-vitor" } } }));
ok(r.status === 200 && r.body.audience.id === savedId && r.body.audience.audience.owner === "u-vitor", "the same name (any case or accent) replaces the filters");
await gestor.post(`${BASE}/api/crm/campaigns/audiences/`, { data: { name: "Site", audience: { source: "site" } } });
r = await json(await mkt.get(`${BASE}/api/crm/campaigns/audiences/`));
ok(r.body.audiences.map((a) => a.name).join() === "LEADS DO BNÍ,Site", `listed by name (${r.body.audiences.map((a) => a.name)})`);
ok((await json(await mkt.delete(`${BASE}/api/crm/campaigns/audiences/${savedId}/`))).status === 200, "deleted");
ok((await json(await mkt.delete(`${BASE}/api/crm/campaigns/audiences/${savedId}/`))).status === 404, "…once");

// ---- sending without the people taken out ----
const draft = { name: "BNI sem o Lucas", templateName: "promo_novembro", templateLanguage: "pt_BR", templateBody: PROMO, params: PARAMS, audience: { source: "bni", exclude: ["k6"] } };
const id = (await json(await mkt.post(`${BASE}/api/crm/campaigns/`, { data: draft }))).body.id;
let det = (await json(await mkt.get(`${BASE}/api/crm/campaigns/${id}/`))).body.campaign;
ok(JSON.stringify(det.audience.exclude) === '["k6"]', "the draft keeps who was taken out");
const st = await json(await gestor.post(`${BASE}/api/crm/campaigns/${id}/send/`, { data: { action: "start" } }));
ok(st.status === 200 && st.body.recipients === 2, `start: 2 recipients (${JSON.stringify(st.body)})`);
ok((await sql(`SELECT count(*) FROM crm_campaign_recipients WHERE campaign_id = '${id}' AND contact_id = 'k6'`)) === "0", "Lucas isn't among the recipients at all");
for (let i = 0; i < 10; i++) {
  const b = await json(await gestor.post(`${BASE}/api/crm/campaigns/${id}/send/`, { data: { action: "batch" } }));
  if (b.body.status !== "enviando") break;
}
const tpl = sent().filter((s) => s.template === "promo_novembro");
ok(tpl.map((s) => s.to).sort().join() === "5515990000011,5515990000012", `sent to Gabriela and Henrique only (${tpl.map((s) => s.to)})`);

// ---- interessados ----
await json(await admin.patch(`${BASE}/api/crm/automations/resposta_campanha/`, { data: { status: "ativa" } }));
ok((await inbound("5515990000011", "Quero saber mais!", "Gabriela")) === 200, "Gabriela answers");
ok((await inbound("5515990000012", "Obrigado", "Henrique")) === 200, "Henrique answers");
det = (await json(await mkt.get(`${BASE}/api/crm/campaigns/${id}/`))).body.campaign;
ok(det.counts.replied === 2 && det.counts.interested === 2, `the automation flags both replies as interest (${JSON.stringify(det.counts)})`);
ok(det.recipients.filter((x) => x.interested).map((x) => x.name).sort().join() === "Gabriela Mota,Henrique Alves", "…per recipient too");
await inbound("5515990000012", "SAIR", "Henrique");
det = (await json(await mkt.get(`${BASE}/api/crm/campaigns/${id}/`))).body.campaign;
ok(det.counts.interested === 1 && det.counts.optedOut === 1 && !det.recipients.find((x) => x.name === "Henrique Alves").interested, "whoever then asks to leave isn't interested");
// Without the automation: a reply from a "quente" contact counts.
await sql(`DELETE FROM crm_automation_runs WHERE automation_id = 'resposta_campanha'`);
await sql(`UPDATE crm_contacts SET temperature = 'morno' WHERE id = 'k1'`);
ok((await json(await mkt.get(`${BASE}/api/crm/campaigns/${id}/`))).body.campaign.counts.interested === 0, "replied but not quente, no automation: not counted");
await sql(`UPDATE crm_contacts SET temperature = 'quente' WHERE id = 'k1'`);
const list = (await json(await mkt.get(`${BASE}/api/crm/campaigns/`))).body.campaigns;
ok(list.find((c) => c.id === id).counts.interested === 1, "replied and quente: counted (in the list too)");

await closeDb();
await browser.close();
console.log("CAMPAIGN AUDIENCE API PASSED");
