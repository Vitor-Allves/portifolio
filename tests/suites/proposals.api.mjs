// Evolução v1.0 · propostas (item 3) through the API, on base + campaign
// fixtures: the service catalog and a template, numbering, who may create and
// change (only on their own opportunities; Marketing doesn't), the draft
// edited in place, the discount above the limit waiting for a Gestor, sending
// (the link, the opportunity moving to "Proposta enviada"), the public page
// ("visualizada" only from the page in a browser, not from the team), a sent
// version frozen (editing makes version 2 with the reason and what changed),
// the client's approval with its evidence, the team recording a refusal,
// expiration, cancelling, the link turned off and renewed, the PDF, the
// history and the audit.
import { request } from "playwright";
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false }); // Administrador
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing
const anon = await request.newContext({ userAgent: "Mozilla/5.0 (Cliente de teste) Chrome/131.0" });
const P = `${BASE}/api/crm/proposals/`;
const get = async (api, id) => (await json(await api.get(`${P}${id}/`))).body?.proposal;
const send = (api, id, channel = "link") => api.post(`${P}${id}/send/`, { data: { channel } }).then(json);
const status = (api, id, data) => api.post(`${P}${id}/status/`, { data }).then(json);
const pub = (token, what, data) => anon.post(`${BASE}/api/proposta/${token}/${what}/`, { data }).then(json);

// ---- catalog and template ----
const svc = async (label, meta) =>
  (await json(await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label, meta } }))).body.option.id;
const trafego = await svc("Gestão de tráfego", { referenceValue: "2.500", billing: "mensal", scope: "Google e Meta Ads, relatório mensal" });
const site = await svc("Site institucional", { referenceValue: "4.000", billing: "unico", scope: "Até 6 páginas" });
ok((await json(await joao.post(`${BASE}/api/crm/proposal-templates/`, { data: { name: "X" } }))).status === 403, "only the Administrador manages templates");
let r = await json(
  await admin.post(`${BASE}/api/crm/proposal-templates/`, {
    data: {
      name: "Tráfego + site",
      validDays: 10,
      billingPeriod: "mensal",
      intro: "Proposta de crescimento.",
      paymentTerms: "Boleto todo dia 10.",
      executionTerm: "30 dias",
      serviceIds: [trafego, site],
    },
  }),
);
ok(r.status === 201 && r.body.template.serviceIds.length === 2, `template created (${r.body?.error ?? ""})`);
const templateId = r.body.template.id;
ok(
  (await json(await admin.post(`${BASE}/api/crm/proposal-templates/`, { data: { name: "Y", serviceIds: ["nao-existe"] } }))).status === 400,
  "template services must be in the catalog",
);
ok(
  (await json(await joao.patch(`${BASE}/api/crm/proposal-settings/`, { data: { discountLimitPct: 50 } }))).status === 403,
  "only the Administrador sets the discount limit",
);
ok((await json(await admin.patch(`${BASE}/api/crm/proposal-settings/`, { data: { discountLimitPct: "150" } }))).status === 400, "limit 0–100");

// ---- creating ----
ok((await json(await joao.post(P, { data: { dealId: "d6" } }))).status === 403, "João can't make a proposal on Vitor's opportunity");
ok((await json(await maria.post(P, { data: { dealId: "d3" } }))).status === 403, "Marketing doesn't make proposals");
ok((await json(await joao.post(P, { data: { dealId: "d2" } }))).status === 400, "a closed opportunity needs reopening first");
r = await json(await joao.post(P, { data: { dealId: "d3", templateId } }));
ok(r.status === 201, `João makes a proposal for Carla from the template (${r.body?.error ?? ""})`);
const p1 = r.body.id;
let p = await get(joao, p1);
ok(
  p.number === 1 && p.version === 1 && p.status === "em_elaboracao" && p.ownerName === "João" && p.contactName === "Carla Dias",
  "number 1, version 1, em elaboração, João's",
);
ok(
  p.content.items.length === 2 && p.monthlyCents === 250000 && p.oneTimeCents === 400000 && p.totalCents === 650000,
  "services and values from the catalog (R$ 2.500/mês + R$ 4.000)",
);
ok(
  p.content.intro === "Proposta de crescimento." && p.content.paymentTerms === "Boleto todo dia 10." && p.content.items[0].description.startsWith("Google"),
  "texts from the template, scope as description",
);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
ok(p.issueDate === today && p.validUntil > today, `issued today, valid ${p.validUntil}`);
ok(
  (await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c3' AND kind = 'proposal' AND payload->>'action' = 'created'`)) === "1",
  "in Carla's history",
);

// ---- draft edits in place; discount above the limit ----
const items = (discount) => [
  { serviceId: trafego, quantity: 1, unitValue: "2.500", billing: "mensal", discount },
  { serviceId: site, quantity: 1, unitValue: "4.000", billing: "unico" },
  { name: "Treinamento da equipe", quantity: 2, unitValue: "300", billing: "unico", description: "Duas sessões" },
];
r = await json(await joao.patch(`${P}${p1}/`, { data: { items: items("10%"), dueDate: "2027-01-10", notes: "Inclui relatório." } }));
p = await get(joao, p1);
ok(r.status === 200 && r.body.newVersion === false && p.version === 1, "a draft is edited in place (still version 1)");
ok(
  p.content.items.length === 3 &&
    p.content.items[0].discountCents === 25000 &&
    p.content.items[0].discountPct === 10 &&
    p.totalCents === 225000 + 400000 + 60000,
  "custom item, 10% discount on the traffic line, totals recomputed",
);
ok(p.discountPct === Math.round((25000 / 710000) * 1000) / 10 && !p.discountPending, `discount ${p.discountPct}% within the limit (10%)`);
ok(
  (await json(await joao.patch(`${P}${p1}/`, { data: { items: [{ name: "X", unitValue: "100", discount: "200" }] } }))).status === 400,
  "discount larger than the line refused",
);
ok((await json(await joao.patch(`${P}${p1}/`, { data: { validUntil: "2020-01-01" } }))).status === 400, "validity before the issue date refused");
ok((await json(await joao.patch(`${P}${p1}/`, { data: { items: [{ serviceId: "nao-existe" }] } }))).status === 400, "unknown service refused");
await json(await joao.patch(`${P}${p1}/`, { data: { items: items("2.000") } }));
p = await get(joao, p1);
ok(p.discountPct > 10 && p.discountPending, `R$ 2.000 off (${p.discountPct}%) waits for a Gestor`);
r = await send(joao, p1);
ok(r.status === 400 && /Gestor/.test(r.body.error), "can't send before the authorization");
ok((await json(await joao.post(`${P}${p1}/discount/`))).status === 403, "the Comercial can't authorize it");
ok((await json(await vitor.post(`${P}${p1}/discount/`))).status === 200, "Vitor authorizes it");
p = await get(joao, p1);
ok(!p.discountPending && p.discountAuthorizedByName === "Vitor", "authorized, with who");
ok((await sql(`SELECT count(*) FROM crm_notifications WHERE user_id = 'u-joao' AND kind = 'proposta'`)) === "1", "João is told");

// ---- sending ----
ok((await send(joao, p1, "pombo")).status === 400, "the channel must be one of the list");
r = await send(joao, p1, "whatsapp");
ok(r.status === 200 && typeof r.body.token === "string" && r.body.token.length >= 30, "sent by WhatsApp: the link exists");
const token1 = r.body.token;
p = await get(joao, p1);
ok(p.status === "enviada" && p.sentVersion === 1 && p.link?.token === token1 && p.versions[0].sentAt, "enviada; version 1 marked as sent");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.proposal_send'`)) === "1", "sending is audited");

// ---- the client's page ----
let page = await anon.get(`${BASE}/proposta/${token1}/`);
let html = await page.text();
ok(
  page.status() === 200 && html.includes("Proposta nº 0001") && html.includes("Treinamento da equipe") && html.includes("noindex"),
  "the public page shows the proposal (not indexed)",
);
ok(
  (await anon.get(`${BASE}/proposta/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/`)).status() === 200 &&
    (await (await anon.get(`${BASE}/proposta/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/`)).text()).includes("Link indisponível"),
  "an unknown link says so",
);
ok((await get(joao, p1)).status === "enviada", "opening the page alone (a link preview) doesn't mark it viewed");
r = await json(await joao.post(`${BASE}/api/proposta/${token1}/view/`, { data: { version: 1 } }));
ok(r.body.counted === false && (await get(joao, p1)).status === "enviada", "the team opening it doesn't count");
r = await pub(token1, "view", { version: 1 });
p = await get(joao, p1);
ok(r.body.counted === true && p.status === "visualizada" && p.viewedAt, "the page in the client's browser: visualizada");
ok((await pub(token1, "view", { version: 1 })).body.counted === false, "the same browser again soon: one line only");
const viewed = JSON.parse(await sql(`SELECT row_to_json(e)::text FROM crm_proposal_events e WHERE proposal_id = '${p1}' AND kind = 'viewed'`));
ok(viewed.user_agent.includes("Cliente de teste"), "the view keeps the browser");
ok(
  (await sql(`SELECT count(*) FROM crm_notifications WHERE user_id = 'u-joao' AND kind = 'proposta' AND title LIKE '%visualizada%'`)) === "1",
  "João is told it was viewed",
);
const deal3 = await sql(`SELECT stage FROM crm_deals WHERE id = 'd3'`);
ok(deal3 === "proposta", "Carla's opportunity stays in Proposta enviada");

// ---- a sent version is frozen ----
r = await json(await joao.patch(`${P}${p1}/`, { data: { items: items("5%") } }));
ok(r.status === 400 && /motivo/.test(r.body.error), "changing a sent version asks for the reason");
r = await json(await joao.patch(`${P}${p1}/`, { data: { items: items("5%"), reason: "Cliente pediu desconto menor no tráfego" } }));
ok(r.status === 200 && r.body.newVersion === true && r.body.version === 2, "…and becomes version 2");
p = await get(joao, p1);
ok(p.status === "em_elaboracao" && p.version === 2 && p.sentVersion === 1 && p.versions.length === 2, "back to em elaboração; version 1 kept");
const v2 = p.versions.find((v) => v.version === 2);
ok(
  v2.reason === "Cliente pediu desconto menor no tráfego" &&
    v2.changes.some((c) => c.field.startsWith("Serviço alterado: Gestão de tráfego")) &&
    v2.changes.some((c) => c.field === "Total"),
  "the new version says why and what changed (values before and after)",
);
ok(
  JSON.parse(await sql(`SELECT content::text FROM crm_proposal_versions WHERE proposal_id = '${p1}' AND version = 1`)).items[0].discountCents === 200000,
  "version 1 still has its own discount",
);
html = await (await anon.get(`${BASE}/proposta/${token1}/`)).text();
ok(html.includes("atualizando esta proposta"), "the client sees it is being updated");
r = await pub(token1, "decision", { decision: "aprovar", name: "Carla Dias", email: "carla@exemplo.com", accept: true, version: 1 });
ok(r.status === 409, "…and can't approve the old version meanwhile");
ok((await send(joao, p1, "email")).status === 200 && (await get(joao, p1)).status === "enviada", "version 2 sent by e-mail");

// ---- the client approves ----
const hash2 = (await get(joao, p1)).versions.find((v) => v.version === 2).contentHash;
ok(
  (await pub(token1, "decision", { decision: "aprovar", name: "Carla Dias", email: "carla@exemplo.com", version: 2 })).status === 400,
  "approving needs the 'li e aprovo' box",
);
ok((await pub(token1, "decision", { decision: "aprovar", name: "Carla Dias", email: "x", accept: true, version: 2 })).status === 400, "…and a valid e-mail");
ok(
  (await pub(token1, "decision", { decision: "aprovar", name: "Carla Dias", email: "carla@exemplo.com", accept: true, version: 1 })).status === 409,
  "…of the version on screen",
);
ok(
  (
    await json(
      await joao.post(`${BASE}/api/proposta/${token1}/decision/`, { data: { decision: "aprovar", name: "João", email: "j@x.com", accept: true, version: 2 } }),
    )
  ).status === 403,
  "the team can't answer for the client through the link",
);
r = await pub(token1, "decision", {
  decision: "aprovar",
  name: "Carla Dias",
  email: "Carla@Exemplo.com",
  document: "123.456.789-09",
  comment: "Pode começar",
  accept: true,
  version: 2,
  contentHash: hash2,
});
ok(r.status === 200 && r.body.status === "aprovada", "Carla approves version 2");
p = await get(joao, p1);
const a = p.approvals[0];
ok(
  p.status === "aprovada" &&
    a.via === "cliente" &&
    a.version === 2 &&
    a.email === "carla@exemplo.com" &&
    a.document === "123.456.789-09" &&
    a.contentHash === hash2 &&
    a.userAgent.includes("Cliente de teste"),
  "evidence: who, e-mail, document, version, content fingerprint, browser",
);
ok((await pub(token1, "decision", { decision: "recusar", name: "Carla Dias", version: 2 })).status === 409, "a decided proposal can't be answered again");
ok(
  (await sql(`SELECT count(*) FROM crm_notifications WHERE kind = 'proposta' AND title LIKE '%aprovada%'`)) === "3",
  "João, Vitor and the Administrador are told",
);
ok(
  (await json(await joao.patch(`${P}${p1}/`, { data: { notes: "x" } }))).status === 400 &&
    (await status(joao, p1, { action: "cancelar", reason: "Mudou de ideia" })).status === 400,
  "an approved proposal doesn't change any more",
);
html = await (await anon.get(`${BASE}/proposta/${token1}/`)).text();
ok(html.includes("Proposta aprovada") && html.includes("Carla Dias"), "the page shows the approval");
ok(
  (await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c3' AND kind = 'proposal' AND payload->>'action' = 'aprovada'`)) === "1",
  "in Carla's history",
);
ok(
  (await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.proposal_status' AND metadata->>'via' = 'cliente'`)) === "1",
  "the client's decision is audited",
);

// ---- the PDF ----
let res = await joao.get(`${P}${p1}/pdf/?version=1`);
ok(
  res.status() === 200 &&
    res.headers()["content-type"] === "application/pdf" &&
    (await res.body()).subarray(0, 5).toString() === "%PDF-" &&
    /proposta-0001-v1\.pdf/.test(res.headers()["content-disposition"]),
  "PDF of version 1",
);
res = await anon.get(`${BASE}/api/proposta/${token1}/pdf/`);
ok(res.status() === 200 && (await res.body()).subarray(0, 5).toString() === "%PDF-", "the client downloads the PDF too");
ok((await sql(`SELECT count(*) FROM crm_proposal_events WHERE proposal_id = '${p1}' AND kind = 'pdf'`)) === "1", "generating the PDF is in the timeline");

// ---- the opportunity moves when sent; the team records a refusal ----
r = await json(await joao.post(P, { data: { dealId: "d5", templateId } }));
const p2 = r.body.id;
ok(r.status === 201 && (await get(joao, p2)).number === 2, "a second proposal is number 2 (Eva's unowned opportunity)");
ok((await send(joao, p2, "pdf")).status === 200, "sent as PDF");
const d5 = JSON.parse(await sql(`SELECT row_to_json(d)::text FROM crm_deals d WHERE id = 'd5'`));
ok(
  d5.stage === "proposta" && d5.service === trafego && Number(d5.value_cents) === 650000,
  "Eva's opportunity moved to Proposta enviada, with service and value from the proposal",
);
ok((await status(joao, p2, { action: "aprovar" })).status === 400, "recording an approval needs how it came");
ok((await status(joao, p2, { action: "negociacao" })).body.status === "em_negociacao", "em negociação");
r = await status(joao, p2, { action: "recusar", reason: "Achou caro, vai pensar no ano que vem" });
p = await get(joao, p2);
ok(r.body.status === "recusada" && p.approvals[0].via === "equipe" && p.approvals[0].recordedByName === "João", "refusal recorded by the team");
r = await json(await joao.patch(`${P}${p2}/`, { data: { items: [{ serviceId: trafego, unitValue: "2.000" }], reason: "Nova proposta só com tráfego" } }));
ok(r.status === 200 && r.body.version === 2 && (await get(joao, p2)).status === "em_elaboracao", "a refused proposal can be renegotiated as a new version");

// ---- expiration, cancelling, the link ----
r = await json(await vitor.post(P, { data: { dealId: "d6" } }));
const p3 = r.body.id;
ok(r.status === 201 && (await get(vitor, p3)).content.items.length === 0, "a proposal without template or service starts empty");
ok((await send(vitor, p3)).status === 400, "can't send without services");
await json(await vitor.patch(`${P}${p3}/`, { data: { items: [{ name: "Consultoria", unitValue: "1.500", billing: "unico" }] } }));
const token3 = (await send(vitor, p3)).body.token;
await sql(`UPDATE crm_proposals SET valid_until = (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1 WHERE id = '${p3}'`);
ok((await json(await vitor.get(`${P}?status=expirada`))).body.rows.map((x) => x.id).join() === p3, "past its validity: expirada");
ok(
  (await pub(token3, "decision", { decision: "aprovar", name: "Ana Ribeiro", email: "ana@x.com", accept: true, version: 1 })).body.error.includes("expirou"),
  "the client can't approve an expired one",
);
ok((await send(vitor, p3)).status === 400, "…nor is it sent again without a new version");
ok((await json(await joao.patch(`${P}${p3}/`, { data: { notes: "x", reason: "Tentativa" } }))).status === 403, "João can't change Vitor's proposal");
ok((await json(await joao.get(`${P}${p3}/`))).status === 200, "…but sees it");
ok((await json(await maria.get(P))).body.total === 3, "Marketing sees the list");
r = await status(vitor, p3, { action: "cancelar", reason: "Cliente fechou com outra área" });
ok(r.body.status === "cancelada", "cancelled, with the reason");
html = await (await anon.get(`${BASE}/proposta/${token3}/`)).text();
ok(html.includes("foi cancelada"), "the client's page says it was cancelled");
ok((await json(await joao.delete(`${P}${p2}/link/`))).status === 200, "João turns off a link");
ok((await (await anon.get(`${BASE}/proposta/${token1}/`)).text()).includes("Proposta aprovada"), "other links keep working");
const p2Token = (await json(await joao.post(`${P}${p2}/link/`))).body.token;
ok(typeof p2Token === "string" && (await sql(`SELECT share_token FROM crm_proposals WHERE id = '${p2}'`)) === p2Token, "…and creates a new one");

// ---- list ----
ok((await json(await joao.get(`${P}?q=0002`))).body.rows.map((x) => x.number).join() === "2", "search by number");
ok((await json(await joao.get(`${P}?q=carla`))).body.rows.map((x) => x.number).join() === "1", "search by client");
ok((await json(await joao.get(`${P}?dealId=d3`))).body.rows.length === 1, "by opportunity");

await anon.dispose();
await browser.close();
await closeDb();
console.log("PROPOSALS API PASSED");
