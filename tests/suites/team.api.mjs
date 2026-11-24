// Fase 2 · entrega 1 through the API, on base + campaign fixtures:
// permissions by module and action with individual exceptions (enforced on
// the server), profiles unchanged, cargo/departamento, CRM-only logins
// (create, first access, new password, deactivation) and the audit trail.
// Runs under tsx so the pure permission rules can be imported.
import { BASE, PASSWORD, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";
import { crmCapabilities, effectiveCapabilities, sanitizeOverrides } from "../../src/lib/crm-permissions.ts";

// ---- pure rules ----
for (const role of ["administrador", "gestor", "comercial", "marketing"]) {
  ok(JSON.stringify(effectiveCapabilities(role, {})) === JSON.stringify(crmCapabilities(role)), `${role}: no exceptions = exactly the profile`);
}
ok(JSON.stringify(sanitizeOverrides({ exportContacts: true, editPipeline: true, manageTeam: true, nope: true, seeAllLeads: "yes" }, "comercial")) === '{"exportContacts":true}', "exceptions keep only real changes (not the profile's own value, not manageTeam, not unknown keys)");
ok(effectiveCapabilities("marketing", { sendCampaigns: true, editCampaigns: false }).sendCampaigns === false, "dispatching campaigns needs the campaigns screen");
ok(effectiveCapabilities("gestor", { editContacts: false }).archiveContacts === false && effectiveCapabilities("gestor", { editContacts: false }).importContacts === false, "archiving and importing need contact editing");

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: gestor } = await login(browser, "vitor", { open: false });
const { api: comercial } = await login(browser, "joao", { open: false });
const { api: mkt } = await login(browser, "maria", { open: false });
const team = `${BASE}/api/crm/team/`;
const person = (id) => `${team}${id}/`;
const roster = async (q = "") => (await json(await admin.get(`${team}${q}`))).body.team;

// ---- who manages the team ----
for (const [name, api] of [["Gestor", gestor], ["Comercial", comercial], ["Marketing", mkt]]) {
  ok((await api.get(team)).status() === 403 && (await json(await api.patch(person("u-joao"), { data: { jobTitle: "x" } }))).status === 403, `${name} can't see or change the team`);
}
let rows = await roster();
ok(rows.every((r) => r.caps === null || JSON.stringify(r.caps) === JSON.stringify(crmCapabilities(r.access))), "everyone starts exactly with their profile's permissions");

// ---- exceptions enforced on the server ----
const exportUrl = `${BASE}/api/crm/contacts/export/`;
ok((await comercial.get(exportUrl)).status() === 403, "Comercial can't export (profile)");
let r = await json(await admin.patch(person("u-joao"), { data: { permissions: { exportContacts: true, seeAllLeads: true, manageTeam: true } } }));
ok(r.status === 200, "Administrador grants João exceptions");
ok((await comercial.get(exportUrl)).status() === 200, "…João now exports");
ok((await comercial.get(`${BASE}/api/crm/contacts/c1/`)).status() === 200, "…and sees Vitor's lead (Ana)");
ok((await comercial.get(team)).status() === 403, "…but managing the team can't be granted as an exception");
ok((await sql(`SELECT crm_permissions::text FROM internal_users WHERE id = 'u-joao'`)) === '{"seeAllLeads": true, "exportContacts": true}', "only the real exceptions are stored");
const audit = await sql(`SELECT metadata::text FROM audit_log WHERE action = 'crm.permission_change' AND target_id = 'u-joao' ORDER BY created_at DESC LIMIT 1`);
ok(audit.includes('"to"') && audit.includes("exportContacts"), `permission change in the audit trail (${audit})`);
ok((await json(await admin.patch(person("u-vitor"), { data: { permissions: { editPipeline: false } } }))).status === 200, "Vitor (Gestor) loses funnel editing");
ok((await json(await gestor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "conversa" } }))).status === 403, "…and the server refuses his stage change");
ok((await json(await admin.patch(person("u-vitor"), { data: { permissions: {} } }))).status === 200, "back to the profile's default");
ok((await json(await gestor.patch(`${BASE}/api/crm/deals/d6/`, { data: { stage: "conversa" } }))).status === 200, "…and he moves deals again");
await json(await admin.patch(person("u-maria"), { data: { permissions: { archiveContacts: false } } }));
ok((await json(await mkt.patch(`${BASE}/api/crm/contacts/c5/`, { data: { archived: true } }))).status === 403, "Marketing without 'arquivar' can't archive");
ok((await json(await mkt.patch(`${BASE}/api/crm/contacts/c5/`, { data: { jobTitle: "Sócia" } }))).status === 200, "…but still edits the contact");
ok((await json(await admin.patch(person("u-admin"), { data: { permissions: { exportContacts: false } } }))).status === 403, "nobody changes their own permissions");
ok((await json(await admin.patch(person("u-admin"), { data: { access: "gestor" } }))).status === 403, "…nor their own profile");
await sql(`INSERT INTO internal_users (id, name, password_hash, role, username) VALUES ('u-geral', 'Geral', 'x', 'administrador_geral', 'geral')`);
ok((await json(await admin.patch(person("u-geral"), { data: { permissions: { customize: false } } }))).status === 403, "the general administrator always has every permission");
// Changing the profile keeps only the exceptions that still differ from the new one.
await json(await admin.patch(person("u-joao"), { data: { access: "gestor" } }));
ok((await sql(`SELECT crm_permissions::text FROM internal_users WHERE id = 'u-joao'`)) === "{}", "profile change: exceptions the new profile already has are dropped");
await json(await admin.patch(person("u-joao"), { data: { access: "comercial" } }));

// ---- cargo and departamento ----
ok((await json(await admin.patch(person("u-joao"), { data: { jobTitle: "SDR", department: "comercial" } }))).status === 200, "cargo and departamento saved");
ok((await json(await admin.patch(person("u-joao"), { data: { department: "nao-existe" } }))).status === 400, "unknown departamento refused");
rows = await roster();
const joao = rows.find((x) => x.id === "u-joao");
ok(joao.jobTitle === "SDR" && joao.department === "comercial", "read back");
ok(joao.crmOnly === true && rows.find((x) => x.id === "u-vitor").crmOnly === false, "CRM-only = Analista with no Intelligence companies (João in the fixture); Vitor (Gestor) also uses the Intelligence");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.user_update' AND target_id = 'u-joao'`)) === "1", "cargo/departamento change audited");

// ---- CRM-only logins ----
const newUser = { name: "Nina Vendas", username: "nina.vendas", email: "nina@example.com", access: "comercial", jobTitle: "SDR", department: "comercial" };
ok((await json(await admin.post(team, { data: newUser }))).status === 400, "creating needs the administrator's password");
ok((await json(await admin.post(team, { data: { ...newUser, adminPassword: "errada" } }))).status === 401, "…the right one");
ok((await json(await gestor.post(team, { data: { ...newUser, adminPassword: PASSWORD } }))).status === 403, "Gestor can't create logins");
r = await json(await admin.post(team, { data: { ...newUser, adminPassword: PASSWORD } }));
ok(r.status === 201 && r.body.username === "nina.vendas" && r.body.password.length >= 16, "CRM-only login created, temporary password returned once");
const nina = r.body.id;
let temp = r.body.password;
ok(
  (await sql(`SELECT role || '|' || cardinality(account_ids) || '|' || must_change_password || '|' || crm_role || '|' || crm_department FROM internal_users WHERE id = '${nina}'`)) === "analista|0|true|comercial|comercial",
  "Analista with no companies (sees nothing in the Intelligence), must change the password, Comercial in the CRM"
);
ok((await json(await admin.post(team, { data: { ...newUser, adminPassword: PASSWORD } }))).status === 409, "same username refused");
ok((await json(await admin.post(team, { data: { ...newUser, username: "1x", adminPassword: PASSWORD } }))).status === 400, "invalid username refused");
ok(!(await sql(`SELECT metadata::text FROM audit_log WHERE action = 'crm.user_create'`)).includes(temp), "the password never goes to the audit trail");

// First access: the temporary password only opens the password change.
const ninaCtx = await browser.newContext();
const ninaApi = ninaCtx.request;
ok((await ninaApi.post(`${BASE}/api/analise/login/`, { data: { username: "nina.vendas", password: temp } })).ok(), "Nina logs in with the temporary password");
ok((await ninaApi.get(`${BASE}/api/crm/deals/`)).status() === 401, "…but can't use the CRM before choosing her own password");
const own = "senha-da-nina-123";
ok((await ninaApi.post(`${BASE}/api/analise/change-password/`, { data: { currentPassword: temp, newPassword: own, confirmPassword: own } })).ok(), "she chooses her password");
ok((await ninaApi.get(`${BASE}/api/crm/deals/`)).status() === 200, "…and uses the CRM");
const intel = await ninaApi.get(`${BASE}/intelligence/`, { maxRedirects: 0 });
ok(intel.status() >= 300 && intel.status() < 400 && (intel.headers().location ?? "").includes("/crm"), "the Intelligence home sends a CRM-only login to the CRM");
const ninaContacts = (await json(await ninaApi.get(`${BASE}/api/crm/contacts/?page=1&pageSize=100`))).body.rows.map((c) => c.id);
ok(!ninaContacts.includes("c1") && ninaContacts.includes("c5"), "as Comercial she sees only her own and unowned leads");
await sql(`UPDATE crm_contacts SET owner_id = '${nina}' WHERE id = 'c5'`);

// New temporary password and deactivation: CRM-only logins only, never oneself.
ok((await json(await admin.post(`${person("u-vitor")}reset-password/`, { data: { adminPassword: PASSWORD } }))).status === 403, "someone who also uses the Intelligence is managed there");
ok((await json(await admin.post(`${person("u-admin")}deactivate/`, { data: { adminPassword: PASSWORD } }))).status === 403, "nobody deactivates themselves");
r = await json(await admin.post(`${person(nina)}reset-password/`, { data: { adminPassword: PASSWORD } }));
ok(r.status === 200 && r.body.password && r.body.password !== temp, "new temporary password");
ok((await ninaApi.get(`${BASE}/api/crm/deals/`)).status() === 401, "…her open session ends");
temp = r.body.password;
ok((await sql(`SELECT must_change_password::text FROM internal_users WHERE id = '${nina}'`)) === "true", "…and she must change it again");
ok((await json(await admin.post(`${person(nina)}deactivate/`, { data: { adminPassword: PASSWORD } }))).status === 200, "Nina deactivated");
const again = await (await browser.newContext()).request.post(`${BASE}/api/analise/login/`, { data: { username: "nina.vendas", password: temp } });
ok(!again.ok(), "a deactivated login can't sign in");
ok((await sql(`SELECT owner_id FROM crm_contacts WHERE id = 'c5'`)) === nina, "her leads keep her as the owner (nothing is removed)");
ok(!(await roster()).some((x) => x.id === nina) && (await roster("?inactive=1")).find((x) => x.id === nina)?.active === false, "out of the team list, still listed among the deactivated");
ok(!((await json(await gestor.get(`${BASE}/api/crm/deals/`))).body.deals.length === 0), "the board still loads");
for (const action of ["crm.user_create", "crm.user_password_reset", "crm.user_deactivate"]) {
  ok((await sql(`SELECT count(*) FROM audit_log WHERE action = '${action}' AND target_id = '${nina}'`)) === "1", `${action} in the audit trail`);
}

await closeDb();
await browser.close();
console.log("TEAM API PASSED");
