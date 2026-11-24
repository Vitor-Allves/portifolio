// Fase 7 · entrega 1 through the API, on base + campaign fixtures and the fake
// Meta Ads in fake-graph.mjs: an active client linked to its client in the
// Legado Intelligence (Administrador / Gestor, audited, in the history, one
// CRM client per Intelligence client), the month's media numbers read the
// way the Intelligence reads them (and matching its own API), every sync
// kept as history, accounts that fail left out and said so, and nobody
// seeing more than their Intelligence access (or "ver valores") allows.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

// Intelligence clients and each person's Intelligence ad accounts.
await sql(
  `INSERT INTO client_access (id, slug, label, account_ids) VALUES
   ('ca-rib', 'ribeiro', 'Ribeiro Odonto', '{act_111}'),
   ('ca-sol', 'sol', 'Clínica Sol', '{act_222}'),
   ('ca-mix', 'mix', 'Grupo Misto', '{act_111,act_999}'),
   ('ca-err', 'err', 'Só erro', '{act_999}')`
);
await sql(`UPDATE internal_users SET account_ids = '{act_111,act_222,act_999}' WHERE id = 'u-vitor'`);
await sql(`UPDATE internal_users SET account_ids = '{act_111}' WHERE id = 'u-joao'`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor'), ('co-mix', 'Grupo Misto', 'grupo misto', 'u-vitor'), ('co-joao', 'Padaria do João', 'padaria do joao', 'u-joao')`);

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing

const newClient = async (companyId, api = vitor) => (await json(await api.post(`${BASE}/api/crm/clients/`, { data: { companyId, status: "ativo" } }))).body.id;
const rib = await newClient("co-rib");
const sol = await newClient("co-sol");
const mix = await newClient("co-mix");
const padaria = await newClient("co-joao", joao);
const media = async (api, id, month = "2026-10") => json(await api.get(`${BASE}/api/crm/clients/${id}/media/?month=${month}`));
const link = async (api, id, clientAccessId) => json(await api.put(`${BASE}/api/crm/clients/${id}/media/`, { data: { clientAccessId } }));
const sync = async (api, id, month = "2026-10") => json(await api.post(`${BASE}/api/crm/clients/${id}/media/`, { data: { month } }));

// ---- before linking ----
let m = (await media(vitor, rib)).body.media;
ok(m.link === null && m.canLink && !m.canSync && m.latest === null && m.history.length === 0, "not linked yet: nothing to sync");
ok((await sync(vitor, rib)).status === 400, "syncing before linking is refused");
const list = (await json(await vitor.get(`${BASE}/api/crm/intelligence/clients/`))).body.clients;
ok(list.map((c) => c.label).join() === "Clínica Sol,Grupo Misto,Ribeiro Odonto,Só erro" && list.every((c) => c.linkedClientId === null), `the Gestor sees the Intelligence clients within his access (${list.map((c) => c.label).join()})`);
ok((await json(await joao.get(`${BASE}/api/crm/intelligence/clients/`))).status === 403, "a Comercial can't link");
ok((await link(joao, padaria, "ca-rib")).status === 403, "…not even his own client");

// ---- linking ----
let r = await link(vitor, rib, "ca-rib");
ok(r.status === 200 && r.body.media.link.label === "Ribeiro Odonto" && r.body.media.link.accountCount === 1 && r.body.media.canSync, "linked to Ribeiro Odonto in the Intelligence");
ok((await link(vitor, sol, "ca-rib")).status === 409, "one Intelligence client links to one active client only");
ok((await link(vitor, sol, "ca-nope")).status === 400, "an unknown Intelligence client is refused");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.intelligence_link'`)) === "1", "the link is in the audit trail");
const history = (await json(await vitor.get(`${BASE}/api/crm/clients/${rib}/`))).body.client.events;
ok(history.some((e) => e.kind === "intelligence" && e.payload.to === "Ribeiro Odonto"), "…and in the client's history");
ok((await json(await vitor.get(`${BASE}/api/crm/intelligence/clients/`))).body.clients.find((c) => c.id === "ca-rib").linkedClientName === "Ribeiro Odonto", "the list says who it's linked to");

// ---- syncing October ----
r = await sync(vitor, rib);
ok(r.status === 200, `October synced (${r.status} ${r.body?.error ?? ""})`);
m = r.body.media;
const t = m.latest.totals;
ok(t.spend === 1500.5 && t.impressions === 150000 && t.clicks === 3000 && t.linkClicks === 2300 && t.conversations === 120, `investimento R$ 1.500,50, 150 mil impressões, 3 mil cliques, 120 conversas (${JSON.stringify(t)})`);
ok(t.reach === 50000, "alcance = the account's own (deduplicated) reach, not the campaigns' sum");
ok(t.ctr === 2 && Math.abs(t.cpc - 1500.5 / 3000) < 1e-9 && Math.abs(t.cpm - 10.003333) < 1e-5 && Math.abs(t.costPerConversation - 1500.5 / 120) < 1e-9, "CTR, CPC, CPM and custo por conversa from the summed totals");
ok(m.latest.periodFrom === "2026-10-01" && m.latest.periodTo === "2026-10-31" && m.latest.source === "Meta Ads (Legado Intelligence)" && m.latest.intelligenceClient === "Ribeiro Odonto", "period, source and Intelligence client kept");
ok(m.latest.campaigns.map((c) => `${c.id}:${c.status}:${c.objective}`).join() === "cmp-11:ACTIVE:OUTCOME_ENGAGEMENT,cmp-12:PAUSED:OUTCOME_TRAFFIC", "each campaign with its objective and status");
ok(m.latest.syncedByName === "Vitor" && m.latest.missingAccounts.length === 0, "who synced, nothing missing");

// The same month in the Intelligence's own API.
const intel = (await json(await vitor.get(`${BASE}/api/meta-ads/campaigns/?since=2026-10-01&until=2026-10-31`))).body;
const ic = intel.campaigns.filter((c) => c.accountId === "act_111");
ok(
  ic.reduce((s, c) => s + c.spend, 0) === t.spend && ic.reduce((s, c) => s + c.impressions, 0) === t.impressions && intel.accountReach.find((a) => a.accountId === "act_111").reach === t.reach,
  "the CRM's numbers are the Intelligence's numbers for the same month"
);

// ---- history ----
r = await sync(vitor, rib);
ok(r.body.media.history.length === 1, "a second sync within a minute reuses the one just made");
await sql(`UPDATE crm_media_syncs SET synced_at = synced_at - interval '2 minutes'`);
r = await sync(vitor, rib);
ok(r.body.media.history.length === 2 && r.body.media.latest.id === r.body.media.history[0].id, "a later sync is a new entry; the older one stays in the history");
const month = await sql(`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')`);
const today = await sql(`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text`);
r = await sync(vitor, rib, month);
ok(r.status === 200 && r.body.media.latest.periodTo === today && r.body.media.latest.totals.spend === 150 * Number(month.slice(5)) + 0.5, `the current month runs up to today (${r.body.media.latest.periodTo})`);
ok((await media(vitor, rib)).body.media.history.length === 2, "each month keeps its own history");
const next = month.endsWith("-12") ? `${Number(month.slice(0, 4)) + 1}-01` : `${month.slice(0, 5)}${String(Number(month.slice(5)) + 1).padStart(2, "0")}`;
ok((await sync(vitor, rib, next)).status === 400 && (await sync(vitor, rib, "2026-13")).status === 400, "a month that hasn't started (or doesn't exist) is refused");

// ---- accounts that fail ----
await link(vitor, mix, "ca-mix");
r = await sync(vitor, mix);
ok(r.status === 200 && r.body.media.latest.missingAccounts.join() === "act_999" && r.body.media.latest.totals.spend === 1500.5, "an account that can't be read is left out and named");
ok(r.body.media.history[0].partial === true, "…and the sync is marked partial");
await link(vitor, sol, "ca-err");
r = await sync(vitor, sol);
ok(r.status === 400 && /Nenhuma conta/.test(r.body.error), "if no account can be read, nothing is stored");
ok((await sql(`SELECT count(*) FROM crm_media_syncs WHERE client_id = $1`, [sol])) === "0", "…really nothing");

// ---- who sees what ----
m = (await media(maria, rib)).body.media;
ok(m.blocked && m.latest === null && m.history.length === 0, `Marketing without Intelligence access sees no numbers (${m.blocked})`);
await sql(`UPDATE internal_users SET account_ids = '{act_111}' WHERE id = 'u-maria'`);
m = (await media(maria, rib)).body.media;
ok(m.blocked === null && m.latest.totals.impressions === 150000 && m.latest.totals.spend === null && m.latest.totals.cpc === null && m.latest.campaigns.every((c) => c.spend === null), "with access: the numbers, but no money (no \"ver valores\")");
ok(!m.canLink && !m.canSync && (await sync(maria, rib)).status === 403, "Marketing doesn't sync");
m = (await media(joao, rib)).body.media;
ok(m && !m.canSync && (await sync(joao, rib)).status === 403, "a Comercial sees someone else's client's numbers but doesn't sync them");
await link(vitor, padaria, "ca-sol");
m = (await media(joao, padaria)).body.media;
ok(m.link.label === "Clínica Sol" && m.blocked && !m.canSync, "his own client, linked to accounts outside his Intelligence access: blocked");
ok((await sync(joao, padaria)).status === 403, "…and can't sync it");
await sql(`UPDATE internal_users SET account_ids = '{act_111,act_222}' WHERE id = 'u-joao'`);
r = await sync(joao, padaria);
ok(r.status === 200 && r.body.media.latest.totals.spend === 300, "with access to the account, the Comercial syncs his own client");

// ---- unlinking keeps the history ----
r = await link(vitor, rib, null);
ok(r.status === 200 && r.body.media.link === null, "link undone");
m = (await media(vitor, rib)).body.media;
ok(m.latest && m.history.length === 2 && !m.canSync, "the synced numbers stay; no new sync without a link");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.intelligence_link'`)) === "5", "every link change audited");

await closeDb();
await browser.close();
console.log("MEDIA API PASSED");
