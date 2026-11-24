// Evolução v1.0 · segurança e LGPD (item 13) through the API, on base +
// campaign fixtures: a 2FA code works once (replay refused); the titular's
// data exported and anonymized by an Administrador (who may, password,
// reason, what goes and what stays, history and audit). Logins: 5 (the
// per-IP limit).
import { BASE, PASSWORD, closeDb, inbound, launchBrowser, login, ok, sql, totpCode } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false }); // 1 (password + 2FA)
const { api: vitor } = await login(browser, "vitor", { open: false }); // 2 — Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // 3 — Comercial

// ---- a 2FA code works once ----
const raw = (await browser.newContext()).request;
ok(
  (await json(await raw.post(`${BASE}/api/analise/login/`, { data: { username: "admin", password: PASSWORD } }))).body?.stage === "verify",
  "an Administrador's password opens the 2FA step",
); // 4
const code = await totpCode();
ok((await raw.post(`${BASE}/api/analise/login/totp/`, { data: { code } })).ok(), "the code opens the session");
const raw2 = (await browser.newContext()).request;
await raw2.post(`${BASE}/api/analise/login/`, { data: { username: "admin", password: PASSWORD } }); // 5
const replay = await json(await raw2.post(`${BASE}/api/analise/login/totp/`, { data: { code } }));
ok(replay.status === 401 && /já foi usado/.test(replay.body?.error ?? ""), `…the same code can't open another one (${replay.body?.error})`);
ok((await raw2.get(`${BASE}/api/crm/deals/`)).status() === 401, "…no session");

// ---- the titular's data: Bruno (c2, João's) ----
ok((await inbound("5515990000002", "Meu CPF é 123.456.789-00, pode anotar")) === 200, "Bruno writes");
await json(await joao.patch(`${BASE}/api/crm/contacts/c2/`, { data: { email: "bruno@exemplo.com", jobTitle: "Sócio" } }));
await json(await joao.post(`${BASE}/api/crm/contacts/c2/notes/`, { data: { text: "Bruno mora na Rua das Flores, 10" } }));
await json(await joao.post(`${BASE}/api/crm/contacts/c2/diagnoses/`, { data: { need: "Captar pacientes", problem: "Depende de indicação" } }));
await json(
  await joao.post(`${BASE}/api/crm/contacts/c2/scheduled-messages/`, {
    data: { kind: "text", body: "Oi Bruno", sendAt: new Date(Date.now() + 3_600_000).toISOString() },
  }),
);
await sql(
  `INSERT INTO crm_files (id, contact_id, name, mime, size_bytes, sha256, content, uploaded_by, uploaded_by_name) VALUES ('f-rg', 'c2', 'rg-bruno.pdf', 'application/pdf', 4, 'x', '\\x25504446', 'u-joao', 'João')`,
);
const U = `${BASE}/api/crm/contacts/c2/lgpd/`;
ok((await vitor.get(U)).status() === 403 && (await joao.get(U)).status() === 403, "only an Administrador handles the titular's requests");
let res = await admin.get(U);
const data = await res.json();
ok(
  res.status() === 200 && /attachment; filename="dados-do-titular-bruno-souza\.json"/.test(res.headers()["content-disposition"]),
  "export: a JSON file named after the titular",
);
ok(
  data.contato.name === "Bruno Souza" && data.contato.email === "bruno@exemplo.com" && data.mensagens.some((m) => /CPF/.test(m.body ?? "")),
  "…with the contact and the messages",
);
ok(
  data.historico.length > 0 && data.diagnosticos.length === 1 && data.mensagensAgendadas.length === 1 && data.oportunidades.some((d) => d.id === "d2"),
  "…the history, diagnosis, scheduled message and opportunities",
);
ok(
  data.documentos.length === 1 && data.documentos[0].name === "rg-bruno.pdf" && !("content" in data.documentos[0]),
  "…the documents listed, without their content",
);
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.lgpd_export' AND target_id = 'c2'`)) === "1", "the export is audited");

// ---- anonymize ----
const anonymize = (api, body) => api.post(U, { data: { action: "anonymize", ...body } }).then(json);
ok((await anonymize(vitor, { reason: "Pedido do titular", password: PASSWORD })).status === 403, "a Gestor can't anonymize");
ok((await anonymize(admin, { reason: "Pedido do titular" })).status === 400, "the Administrador confirms with the password…");
ok((await anonymize(admin, { reason: "Pedido do titular", password: "errada" })).status === 401, "…the right one");
ok((await anonymize(admin, { reason: "oi", password: PASSWORD })).status === 400, "…and says why");
const lostBefore = await sql(`SELECT count(*) FROM crm_deals WHERE stage = 'perdido'`);
let r = await anonymize(admin, { reason: "Pedido do titular por e-mail em 24/11", password: PASSWORD });
ok(
  r.status === 200 && r.body.done.documents === 1 && r.body.done.diagnoses === 1 && r.body.done.scheduledMessages === 1,
  `anonymized (${JSON.stringify(r.body?.done)})`,
);
const c = JSON.parse(await sql(`SELECT row_to_json(c)::text FROM crm_contacts c WHERE id = 'c2'`));
ok(c.name === "Titular anonimizado" && c.phone === null && c.email === null && c.job_title === null && c.anonymized_at, "name, phone, e-mail, job title gone");
ok(c.archived_at && c.opted_out_at, "…archived and opted out");
ok((await sql(`SELECT count(*) FROM crm_messages WHERE contact_id = 'c2' AND body IS NOT NULL`)) === "0", "message texts gone");
ok((await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c2' AND payload::text LIKE '%Flores%'`)) === "0", "…the note's text too");
ok(
  (await sql(`SELECT count(*) FROM crm_files WHERE contact_id = 'c2'`)) === "0" &&
    (await sql(`SELECT count(*) FROM crm_diagnostics WHERE contact_id = 'c2'`)) === "0",
  "documents and diagnoses deleted",
);
ok(
  (await sql(`SELECT title FROM crm_deals WHERE id = 'd2'`)) === "Oportunidade (dados removidos)" &&
    (await sql(`SELECT count(*) FROM crm_deals WHERE stage = 'perdido'`)) === lostBefore,
  "the opportunity stays (stage, value), without the name",
);
ok((await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c2' AND kind = 'lgpd'`)) === "1", "in the contact's history");
const audit = JSON.parse(await sql(`SELECT row_to_json(a)::text FROM audit_log a WHERE action = 'crm.lgpd_anonymize'`));
ok(
  audit.target_label === "Titular anonimizado" && audit.metadata.reason === "Pedido do titular por e-mail em 24/11" && !JSON.stringify(audit).includes("Bruno"),
  "audited, without the personal data",
);
ok((await anonymize(admin, { reason: "De novo, por favor", password: PASSWORD })).status === 409, "once");
ok((await (await admin.get(U)).json()).contato.name === "Titular anonimizado", "a new export shows what's left");

await browser.close();
await closeDb();
console.log("SECURITY API PASSED");
