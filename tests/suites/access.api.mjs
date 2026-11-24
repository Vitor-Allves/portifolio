// Fase 2 · entrega 2 through the API, on base + campaign fixtures: 2FA for
// CRM Administradores, carteiras (bulk owner change, portfolio transfer,
// leads of deactivated people), Auditoria, each person's activity and
// ending someone's sessions. Logins are kept to 5 (the per-IP limit).
import { BASE, PASSWORD, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false }); // 1 (password + 2FA code)
const { api: joao } = await login(browser, "joao", { open: false }); // 2
const vitorCtx = await browser.newContext();
const vitor = vitorCtx.request;
const first = await json(await vitor.post(`${BASE}/api/analise/login/`, { data: { username: "vitor", password: PASSWORD } })); // 3
ok(first.status === 200 && first.body.stage === "done", "Gestor logs in without 2FA");

// ---- 2FA for CRM Administradores ----
const raw = await (await browser.newContext()).request;
const adminStep = await json(await raw.post(`${BASE}/api/analise/login/`, { data: { username: "admin", password: PASSWORD } })); // 4
ok(adminStep.body?.stage === "verify", "an Administrador's password alone only opens the 2FA step");
ok((await raw.get(`${BASE}/api/crm/deals/`)).status() === 401, "…no CRM session without the code");

// ---- carteiras: bulk owner change ----
const assign = (api, data) => api.post(`${BASE}/api/crm/contacts/assign/`, { data });
ok((await json(await assign(joao, { ids: ["c2"], ownerId: "u-joao" }))).status === 403, "Comercial can't change owners in bulk");
let r = await json(await assign(vitor, { ids: ["c2", "c3"], ownerId: "u-vitor", preview: true }));
ok(r.status === 200 && r.body.contacts === 2 && r.body.deals === 1 && r.body.tasks === 1, `preview: 2 contacts, 1 open opportunity, 1 pending task (${JSON.stringify(r.body)})`);
ok((await sql(`SELECT owner_id FROM crm_contacts WHERE id = 'c2'`)) === "u-joao", "…preview changes nothing");
r = await json(await assign(vitor, { ids: ["c2", "c3"], ownerId: "u-vitor" }));
ok(r.status === 200 && r.body.contacts === 2 && r.body.toName === "Vitor", "Gestor moves Bruno and Carla to himself");
ok((await sql(`SELECT string_agg(id || ':' || owner_id, ',' ORDER BY id) FROM crm_contacts WHERE id IN ('c2', 'c3')`)) === "c2:u-vitor,c3:u-vitor", "contacts moved");
ok((await sql(`SELECT owner_id FROM crm_deals WHERE id = 'd3'`)) === "u-vitor" && (await sql(`SELECT owner_id FROM crm_deals WHERE id = 'd2'`)) === "u-joao", "open opportunity moved, lost one left as it was");
ok((await sql(`SELECT owner_id FROM crm_tasks WHERE id = 't4'`)) === "u-vitor", "pending task moved");
ok(
  (await sql(`SELECT count(*) FROM crm_events WHERE kind = 'owner' AND payload->>'via' = 'carteira' AND contact_id IN ('c2', 'c3')`)) === "3",
  "history: one entry per contact and per opportunity"
);
ok((await sql(`SELECT metadata->>'contacts' FROM audit_log WHERE action = 'crm.portfolio_assign'`)) === "2", "bulk change in the audit trail");
r = await json(await assign(vitor, { ids: ["c3"], ownerId: "u-joao", moveDeals: false, moveTasks: false }));
ok(r.body.contacts === 1 && (await sql(`SELECT owner_id FROM crm_deals WHERE id = 'd3'`)) === "u-vitor", "without 'levar junto', only the contact moves");
r = await json(await assign(vitor, { filters: { q: "Davi" }, ownerId: null }));
ok(r.body.contacts === 1 && (await sql(`SELECT COALESCE(owner_id, 'none') FROM crm_contacts WHERE id = 'c4'`)) === "none", "by filter, to no owner");
ok((await json(await assign(vitor, { ids: ["c1"], ownerId: "u-nobody" }))).status === 400, "unknown owner refused");

// ---- leads of a deactivated person, and transferring a whole portfolio ----
await sql(`INSERT INTO internal_users (id, name, password_hash, role, username, revoked_at) VALUES ('u-old', 'Ex Vendedor', 'x', 'analista', 'exvendedor', now())`);
await sql(`UPDATE crm_contacts SET owner_id = 'u-old' WHERE id = 'c5'`);
await sql(`UPDATE crm_deals SET owner_id = 'u-old' WHERE id = 'd5'`);
await sql(`INSERT INTO crm_tasks (id, contact_id, kind, title, owner_id) VALUES ('t-old', 'c1', 'tarefa', 'Ligar', 'u-old')`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-old', 'Empresa do Ex', 'empresa do ex', 'u-old')`);
const inactive = (await json(await vitor.get(`${BASE}/api/crm/contacts/?page=1&owner=inactive`))).body.rows.map((c) => c.name);
ok(inactive.join() === "Eva Prado", "filter: leads still with a deactivated person");
const transferUrl = `${BASE}/api/crm/team/u-old/transfer/`;
r = await json(await admin.get(transferUrl));
ok(JSON.stringify(r.body.counts) === '{"contacts":1,"deals":1,"tasks":1,"companies":1}', `portfolio counts (${JSON.stringify(r.body.counts)})`);
ok((await json(await vitor.post(transferUrl, { data: { toUserId: "u-vitor" } }))).status === 403, "only the Administrador transfers a whole portfolio");
ok((await json(await admin.post(transferUrl, { data: { toUserId: "u-old" } }))).status === 403, "…not to the same person");
ok((await json(await admin.post(transferUrl, { data: { toUserId: "u-geral-inexistente" } }))).status === 400, "…nor to someone who isn't active");
r = await json(await admin.post(transferUrl, { data: { toUserId: "u-joao", preview: true } }));
ok(r.body.contacts === 1 && (await sql(`SELECT owner_id FROM crm_contacts WHERE id = 'c5'`)) === "u-old", "transfer preview changes nothing");
r = await json(await admin.post(transferUrl, { data: { toUserId: "u-joao" } }));
ok(r.status === 200 && r.body.contacts === 1 && r.body.deals === 1 && r.body.tasks === 1 && r.body.companies === 1, "portfolio transferred to João");
ok(
  (await sql(`SELECT (SELECT owner_id FROM crm_contacts WHERE id = 'c5') || (SELECT owner_id FROM crm_deals WHERE id = 'd5') || (SELECT owner_id FROM crm_tasks WHERE id = 't-old') || (SELECT owner_id FROM crm_companies WHERE id = 'co-old')`)) ===
    "u-joaou-joaou-joaou-joao",
  "contact, opportunity, task (even on Vitor's contact) and company account all moved"
);
ok((await sql(`SELECT payload->>'from' FROM crm_events WHERE contact_id = 'c5' AND kind = 'owner' AND payload->>'dealId' IS NULL ORDER BY created_at DESC LIMIT 1`)) === "Ex Vendedor", "history says from whom");

// ---- activity ----
ok((await json(await vitor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "conversa" } }))).status === 200, "Vitor moves a deal");
ok((await vitor.get(`${BASE}/api/crm/team/u-vitor/activity/`)).status() === 403, "only the Administrador sees someone's activity");
const act = (await json(await admin.get(`${BASE}/api/crm/team/u-vitor/activity/?days=7`))).body.activity;
ok(act.days === 7 && act.stageMoves === 1 && act.recent.some((e) => e.kind === "stage" && e.contactName === "Ana Ribeiro"), `Vitor's activity: stage moves and latest actions (${act.stageMoves})`);
ok(act.lastActivityAt && Date.now() - Date.parse(act.lastActivityAt) < 120_000, "…last activity is now");

// ---- Auditoria ----
const audit = (q) => admin.get(`${BASE}/api/crm/audit/?${q}`);
ok((await vitor.get(`${BASE}/api/crm/audit/`)).status() === 403, "Auditoria is Administrador only");
let rows = (await json(await audit("tab=admin"))).body.rows;
ok(rows.some((x) => x.action === "crm.portfolio_transfer") && rows.some((x) => x.action === "crm.portfolio_assign") && rows.every((x) => x.action.startsWith("crm.")), "administrative actions listed (CRM only)");
rows = (await json(await audit("tab=admin&action=crm.portfolio_transfer"))).body.rows;
ok(rows.length === 1 && rows[0].targetLabel === "Ex Vendedor" && rows[0].metadata.to === "João", "filter by action, with details");
rows = (await json(await audit("tab=admin&actor=u-vitor"))).body.rows;
ok(rows.length >= 1 && rows.every((x) => x.actorName === "Vitor"), "filter by person");
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
ok((await json(await audit(`tab=admin&from=${tomorrow}`))).body.total === 0, "filter by period");
rows = (await json(await audit("tab=comercial&kind=owner&actor=u-vitor"))).body.rows;
ok(rows.length >= 3 && rows.every((x) => x.kind === "owner" && x.userName === "Vitor") && rows.some((x) => x.contactName === "Bruno Souza"), "commercial changes: owner changes by Vitor, with the contact");
rows = (await json(await audit("tab=comercial&kind=stage"))).body.rows;
ok(rows[0]?.payload.to === "conversa", "…stage moves, newest first");

// ---- 2FA required when promoted to Administrador; ending sessions ----
r = await json(await admin.patch(`${BASE}/api/crm/team/u-vitor/`, { data: { access: "administrador" } }));
ok(r.status === 200 && r.body.endedSessions === true, "promoting someone without 2FA to Administrador ends their sessions");
ok((await vitor.get(`${BASE}/api/crm/deals/`)).status() === 401, "…Vitor is signed out");
const again = await json(await vitor.post(`${BASE}/api/analise/login/`, { data: { username: "vitor", password: PASSWORD } })); // 5
ok(again.body?.stage === "enroll", "…and his next login asks him to set up 2FA");
await admin.patch(`${BASE}/api/crm/team/u-vitor/`, { data: { access: "gestor" } });
ok((await json(await admin.delete(`${BASE}/api/crm/team/u-joao/sessions/`, { data: { adminPassword: "errada" } }))).status === 401, "ending sessions needs the administrator's password");
ok((await json(await admin.delete(`${BASE}/api/crm/team/u-admin/sessions/`, { data: { adminPassword: PASSWORD } }))).status === 403, "…not for oneself");
ok((await joao.get(`${BASE}/api/crm/deals/`)).status() === 200, "João is signed in");
ok((await json(await admin.delete(`${BASE}/api/crm/team/u-joao/sessions/`, { data: { adminPassword: PASSWORD } }))).status === 200, "Administrador ends João's sessions");
ok((await joao.get(`${BASE}/api/crm/deals/`)).status() === 401, "…João is signed out everywhere");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.session_end' AND target_id = 'u-joao'`)) === "1", "…recorded in the audit trail");

await closeDb();
await browser.close();
console.log("ACCESS API PASSED");
