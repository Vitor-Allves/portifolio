// Evolução v1.0 · contratos e operação (itens 8 e 9) through the API, on base
// + campaign fixtures: an approved proposal formalized (the sale registered
// as "Proposta aprovada", the client and its numbered contract created with
// the proposal's services, values and conditions, the onboarding checklist
// started); the contract's details (term → end date, renewal, cancellation,
// owners, signed document from the client's files) and its PDF; the
// onboarding checklist, deliverables and satisfaction, with who may change
// them.
import { request } from "playwright";
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing
const anon = await request.newContext();
const P = `${BASE}/api/crm/proposals/`;

// ---- an approved proposal for Carla (João's lead), at her company ----
const svc = async (label, meta) =>
  (await json(await admin.post(`${BASE}/api/crm/catalog/options/`, { data: { kind: "service", label, meta } }))).body.option.id;
const trafego = await svc("Gestão de tráfego", { referenceValue: "2.500", billing: "mensal" });
const site = await svc("Site institucional", { referenceValue: "4.000", billing: "unico" });
await json(await joao.patch(`${BASE}/api/crm/contacts/c3/`, { data: { company: "Clínica Carla" } }));
const p1 = (await json(await joao.post(P, { data: { dealId: "d3" } }))).body.id;
await json(
  await joao.patch(`${P}${p1}/`, {
    data: {
      items: [
        { serviceId: trafego, unitValue: "2.500" },
        { serviceId: site, unitValue: "4.000" },
      ],
      paymentTerms: "Boleto todo dia 10.",
    },
  }),
);
const token = (await json(await joao.post(`${P}${p1}/send/`, { data: { channel: "email" } }))).body.token;
ok(
  (
    await json(
      await anon.post(`${BASE}/api/proposta/${token}/decision/`, {
        data: { decision: "aprovar", name: "Carla Dias", email: "carla@x.com", accept: true, version: 1 },
      }),
    )
  ).status === 200,
  "Carla approves",
);
const wonReason = (await json(await joao.get(`${BASE}/api/crm/catalog/`))).body.catalog.options.find((o) => o.kind === "won_reason" && !o.archived).id;

// ---- formalizing ----
const formalize = (api, data) => api.post(`${P}${p1}/formalize/`, { data }).then(json);
ok((await formalize(maria, { wonReason })).status === 403, "Marketing doesn't formalize");
ok((await formalize(joao, {})).status === 400, "the sale needs its won reason");
let r = await formalize(joao, {
  wonReason,
  startsOn: "2026-12-01",
  termMonths: 12,
  dueDay: 10,
  renewal: "automatica",
  cancellationRules: "Aviso prévio de 30 dias.",
  opsOwnerId: "u-vitor",
});
ok(r.status === 201 && r.body.clientId && r.body.contractId, `João formalizes (${r.body?.error ?? ""})`);
const { clientId, contractId } = r.body;
const deal = JSON.parse(await sql(`SELECT row_to_json(d)::text FROM crm_deals d WHERE id = 'd3'`));
ok(
  deal.stage === "ganho" &&
    deal.won_result === "proposta_aprovada" &&
    Number(deal.negotiated_cents) === 650000 &&
    deal.won_note.includes("Proposta nº 0001 aprovada por Carla Dias"),
  "sale registered: Venda fechada, proposta aprovada, R$ 6.500",
);
const k = JSON.parse(await sql(`SELECT row_to_json(k)::text FROM crm_contracts k WHERE id = '${contractId}'`));
ok(
  k.number === 1 && k.proposal_id === p1 && Number(k.value_cents) === 250000 && k.billing === "mensal" && Number(k.one_time_cents) === 400000,
  "contract nº 1: R$ 2.500/mês + R$ 4.000 único, from the proposal",
);
ok(
  k.services.join() === [trafego, site].join() && k.payment_terms === "Boleto todo dia 10." && k.due_day === 10 && k.term_months === 12,
  "services, payment terms, due day and term",
);
ok(
  k.starts_on === "2026-12-01" && k.ends_on === "2027-11-30" && k.renewal === "automatica" && k.cancellation_rules === "Aviso prévio de 30 dias.",
  "starts 01/12/2026, 12 months → ends 30/11/2027; renewal and cancellation rules",
);
ok(k.sales_owner_id === "u-joao" && k.ops_owner_id === "u-vitor", "sales owner João, operations owner Vitor");
ok((await sql(`SELECT status FROM crm_clients WHERE id = '${clientId}'`)) === "onboarding", "the client starts in Onboarding");
ok(
  (await sql(`SELECT count(*) FROM crm_client_onboarding WHERE client_id = '${clientId}' AND owner_id = 'u-vitor'`)) === "8",
  "the 8-item onboarding checklist, for the operations owner",
);
const prop = (await json(await joao.get(`${P}${p1}/`))).body.proposal;
ok(
  prop.contract?.number === 1 && prop.contract.clientId === clientId && prop.events.some((e) => e.kind === "formalized"),
  "the proposal points to its contract",
);
ok((await formalize(joao, { wonReason })).status === 400, "a proposal becomes a contract once");
ok(
  (await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c3' AND kind = 'proposal' AND payload->>'action' = 'formalized'`)) === "1",
  "in Carla's history",
);
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.contract_change' AND metadata->>'action' = 'formalizado'`)) === "1", "audited");
let client = (await json(await joao.get(`${BASE}/api/crm/clients/${clientId}/`))).body.client;
const kc = client.contracts[0];
ok(
  kc.number === 1 &&
    kc.proposalNumber === 1 &&
    kc.oneTimeCents === 400000 &&
    kc.salesOwnerName === "João" &&
    kc.opsOwnerName === "Vitor" &&
    kc.renewal === "automatica",
  "the client shows the contract's details",
);
ok(
  client.events.some((e) => e.kind === "contract_details"),
  "…and the formalization in its history",
);

// ---- contract details ----
const details = (api, data) => api.patch(`${BASE}/api/crm/clients/${clientId}/contracts/${contractId}/details/`, { data }).then(json);
ok((await details(joao, { dueDay: 40 })).status === 400, "due day 1–31");
ok((await details(joao, { renewal: "sempre" })).status === 400, "renewal from the list");
r = await details(joao, { termMonths: 6 });
ok(
  r.status === 200 && r.body.client.contracts[0].endsOn === "2027-05-31" && r.body.client.contracts[0].termMonths === 6,
  "a 6-month term recomputes the end date",
);
ok(
  r.body.client.events.some((e) => e.kind === "contract_edited" && e.payload.changes.some((c) => c.field === "Vencimento")),
  "…in the history",
);
// The signed document must be one of this client's files.
const pdf = Buffer.from("%PDF-1.4\n%%EOF\n");
const otherFile = (
  await json(
    await vitor.post(`${BASE}/api/crm/files/`, { multipart: { contactId: "c1", file: { name: "outro.pdf", mimeType: "application/pdf", buffer: pdf } } }),
  )
).body.file.id;
ok((await details(joao, { signedFileId: otherFile })).status === 400, "a file of another record can't be the signed contract");
const signed = (
  await json(
    await joao.post(`${BASE}/api/crm/files/`, { multipart: { clientId, file: { name: "Contrato assinado.pdf", mimeType: "application/pdf", buffer: pdf } } }),
  )
).body.file.id;
r = await details(joao, { signedFileId: signed, signedOn: "2026-11-28" });
ok(
  r.status === 200 && r.body.client.contracts[0].signedFileName === "Contrato assinado.pdf" && r.body.client.contracts[0].signedOn === "2026-11-28",
  "signed document attached and dated",
);
ok((await details(maria, { dueDay: 5 })).status === 403, "Marketing doesn't edit contracts");
let res = await joao.get(`${BASE}/api/crm/clients/${clientId}/contracts/${contractId}/pdf/`);
ok(
  res.status() === 200 && (await res.body()).subarray(0, 5).toString() === "%PDF-" && /contrato-0001\.pdf/.test(res.headers()["content-disposition"]),
  "the contract as a PDF to review and sign",
);

// ---- onboarding ----
const opUrl = `${BASE}/api/crm/clients/${clientId}/operation/`;
let op = (await json(await joao.get(opUrl))).body.operation;
ok(
  op.onboarding.map((i) => i.label).join() ===
    "Reunião inicial,Briefing,Documentação,Acessos,Materiais,Definição de responsáveis,Cronograma,Início da execução",
  "the checklist, in order",
);
const first = op.onboarding[0].id;
r = await json(await joao.patch(`${BASE}/api/crm/clients/${clientId}/onboarding/${first}/`, { data: { done: true, dueOn: "2026-12-03" } }));
op = r.body.operation;
ok(
  r.status === 200 && op.onboarding[0].doneAt && op.onboarding[0].doneByName === "João" && op.onboarding[0].dueOn === "2026-12-03",
  "an item done, with who and when",
);
ok(
  (await json(await joao.patch(`${BASE}/api/crm/clients/${clientId}/onboarding/${first}/`, { data: { ownerId: "nao-existe" } }))).status === 400,
  "the item's owner must be someone in the CRM",
);
ok(
  (await json(await maria.patch(`${BASE}/api/crm/clients/${clientId}/onboarding/${first}/`, { data: { done: false } }))).status === 403,
  "Marketing reads, doesn't check items",
);
ok((await json(await maria.get(opUrl))).status === 200, "…but sees the operation");
ok(
  (await sql(`SELECT count(*) FROM crm_client_events WHERE client_id = '${clientId}' AND kind = 'onboarding' AND payload->>'action' = 'done'`)) === "1",
  "checking an item goes to the client's history",
);
ok((await json(await joao.post(`${BASE}/api/crm/clients/${clientId}/onboarding/`))).status === 400, "the checklist is not created twice");

// ---- deliverables ----
const dUrl = `${BASE}/api/crm/clients/${clientId}/deliverables/`;
ok((await json(await joao.post(dUrl, { data: { title: "" } }))).status === 400, "a deliverable needs what is delivered");
ok((await json(await joao.post(dUrl, { data: { title: "X", status: "feito" } }))).status === 400, "situation from the list");
r = await json(await joao.post(dUrl, { data: { title: "Relatório de campanhas de dezembro", service: trafego, ownerId: "u-vitor", dueOn: "2026-01-10" } }));
op = r.body.operation;
const del = op.deliverables[0];
ok(
  r.status === 201 && del.title.startsWith("Relatório") && del.ownerName === "Vitor" && del.late === true && del.status === "pendente",
  "deliverable with responsible and date (past: late)",
);
r = await json(await joao.patch(`${dUrl}${del.id}/`, { data: { status: "entregue" } }));
ok(
  r.body.operation.deliverables.find((d) => d.id === del.id).deliveredAt && !r.body.operation.deliverables.find((d) => d.id === del.id).late,
  "delivered: date recorded, no longer late",
);
ok(
  (await sql(`SELECT count(*) FROM crm_client_events WHERE client_id = '${clientId}' AND kind = 'deliverable'`)) === "2",
  "created and delivered in the history",
);

// ---- satisfaction ----
const sUrl = `${BASE}/api/crm/clients/${clientId}/satisfaction/`;
ok((await json(await joao.post(sUrl, { data: { score: 11 } }))).status === 400, "score 0–10");
await json(await joao.post(sUrl, { data: { score: 9, comment: "Gostou do primeiro relatório" } }));
r = await json(await vitor.post(sUrl, { data: { score: 6, comment: "Reclamou do prazo do site" } }));
ok(r.status === 201 && r.body.operation.satisfaction.length === 2 && r.body.operation.satisfactionAvg === 7.5, "two records, average 7,5");
ok((await json(await maria.post(sUrl, { data: { score: 10 } }))).status === 403, "Marketing doesn't record satisfaction");

// ---- a client from a company: no checklist unless in onboarding; numbering goes on ----
await json(await vitor.post(`${BASE}/api/crm/companies/`, { data: { name: "Empresa Antiga" } }));
const coId = await sql(`SELECT id FROM crm_companies WHERE name = 'Empresa Antiga'`);
r = await json(
  await vitor.post(`${BASE}/api/crm/clients/`, {
    data: { companyId: coId, status: "ativo", contract: { services: [trafego], startsOn: "2026-01-01", value: "1.000" } },
  }),
);
const c2 = r.body.id;
ok(
  r.status === 201 && (await sql(`SELECT count(*) FROM crm_client_onboarding WHERE client_id = '${c2}'`)) === "0",
  "an already active client doesn't get a checklist",
);
ok((await sql(`SELECT number FROM crm_contracts WHERE client_id = '${c2}'`)) === "2", "its contract is number 2");
ok(
  (await json(await vitor.post(`${BASE}/api/crm/clients/${c2}/onboarding/`))).status === 201 &&
    (await sql(`SELECT count(*) FROM crm_client_onboarding WHERE client_id = '${c2}'`)) === "8",
  "…but can start one",
);
ok(
  (
    await json(
      await joao.patch(`${BASE}/api/crm/clients/${c2}/contracts/${await sql(`SELECT id FROM crm_contracts WHERE client_id = '${c2}'`)}/details/`, {
        data: { dueDay: 5 },
      }),
    )
  ).status === 403,
  "João can't change Vitor's client",
);

await anon.dispose();
await browser.close();
await closeDb();
console.log("OPERATIONS API PASSED");
