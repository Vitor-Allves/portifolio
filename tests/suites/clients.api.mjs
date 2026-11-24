// Fase 5 · entrega 1 through the API, on base + campaign fixtures: Clientes
// ativos. Who sees and edits clients (Comercial only theirs, Marketing without
// contract values), turning a won opportunity or a company into a client (once,
// even with two clicks at once), contracts (validation, renewal filters),
// ending and reactivating a client, the history and the audit trail.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing

const list = async (api, q = "") => json(await api.get(`${BASE}/api/crm/clients/${q ? `?${q}` : ""}`));
const create = async (api, data) => json(await api.post(`${BASE}/api/crm/clients/`, { data }));
const get = async (api, id) => json(await api.get(`${BASE}/api/crm/clients/${id}/`));
const patch = async (api, id, data) => json(await api.patch(`${BASE}/api/crm/clients/${id}/`, { data }));
const addContract = async (api, id, data) => json(await api.post(`${BASE}/api/crm/clients/${id}/contracts/`, { data }));
const editContract = async (api, id, k, data) => json(await api.patch(`${BASE}/api/crm/clients/${id}/contracts/${k}/`, { data }));
const day = (offset) => sql(`SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date + $1::int)::text`, [offset]);

// Data for this suite: two services, Ana's company (Ribeiro Odonto, Vitor's), a company of João's,
// Ana's won opportunity d1 closed 5 days ago with a negotiated value; Clínica Sol marked "Cliente ativo".
await sql(`INSERT INTO crm_options (kind, id, label, sort) VALUES ('service', 'trafego', 'Gestão de tráfego', 1), ('service', 'social', 'Social media', 2)`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor'), ('co-souza', 'Souza Pet', 'souza pet', 'u-joao')`);
await sql(`UPDATE crm_contacts SET company_id = 'co-rib', is_decision_maker = true WHERE id = 'c1'`);
await sql(`UPDATE crm_contacts SET company_id = 'co-souza' WHERE id = 'c2'`);
await sql(`UPDATE crm_deals SET closed_at = now() - interval '5 days', service = 'trafego', negotiated_cents = 450000 WHERE id = 'd1'`);
await sql(`UPDATE crm_deals SET closed_at = now() - interval '3 days' WHERE id IN ('d4', 'd7')`);
await sql(`UPDATE crm_companies SET status = 'cliente_ativo' WHERE id = 'co-sol'`);
const closedOn = await sql(`SELECT ((now() - interval '5 days') AT TIME ZONE 'America/Sao_Paulo')::date::text`);

// ---- who sees what ----
ok((await fetch(`${BASE}/api/crm/clients/`)).status === 401, "anonymous refused");
let r = await list(maria);
ok(r.status === 200 && r.body.valuesHidden === true && r.body.suggestions === null, "Marketing sees Clientes ativos, without values or suggestions");
ok((await create(maria, { companyId: "co-sol" })).status === 403, "Marketing can't create clients");
r = await list(vitor);
ok(r.body.clients.length === 0 && r.body.valuesHidden === false, "nobody is a client yet (nothing created by itself)");
const sug = r.body.suggestions;
ok(sug.deals.map((d) => d.dealId).sort().join() === "d1,d4", `ready to become clients: the won opportunities d1 and d4, not the archived contact's d7 (${sug.deals.map((d) => d.dealId)})`);
ok(sug.deals.find((d) => d.dealId === "d1").companyName === "Ribeiro Odonto" && sug.deals.find((d) => d.dealId === "d4").companyId === null, "…with their company (or none)");
ok(sug.companies.map((c) => c.companyName).join() === "Clínica Sol", "…and the company marked Cliente ativo without a record");
await sql(`UPDATE internal_users SET crm_permissions = '{"viewClients": false}'::jsonb WHERE id = 'u-vitor'`);
ok((await list(vitor)).status === 403, "an exception can take the clients screen away");
await sql(`UPDATE internal_users SET crm_permissions = '{}'::jsonb WHERE id = 'u-vitor'`);

// ---- turning a won opportunity into a client ----
r = await create(vitor, { dealId: "d4" });
ok(r.status === 400 && /Vincule Davi Lima a uma empresa/.test(r.body.error), "an opportunity without a company can't become a client");
ok((await create(vitor, { dealId: "d3" })).status === 400, "only a won opportunity");
ok((await create(joao, { dealId: "d1" })).status === 404, "a Comercial can't use someone else's opportunity");
r = await create(vitor, { dealId: "d1" });
ok(r.status === 201 && r.body.created === true, "Vitor turns Ana's won opportunity into a client");
const rib = r.body.id;
let c = (await get(vitor, rib)).body.client;
ok(c.companyName === "Ribeiro Odonto" && c.ownerName === "Vitor" && c.status === "onboarding" && c.startedOn === closedOn, `company, responsible, Onboarding, since the day it was won (${c.startedOn})`);
ok(c.contracts.length === 1 && c.contracts[0].services.join() === "trafego" && c.contracts[0].valueCents === 450000 && c.contracts[0].dealId === "d1" && c.contracts[0].billing === "mensal", "first contract: the service and the negotiated value");
ok(c.monthlyCents === 450000 && c.services.join() === "trafego" && c.decisionMakers.map((d) => d.name).join() === "Ana Ribeiro", "monthly value, services, decisores");
ok((await sql(`SELECT status FROM crm_companies WHERE id = 'co-rib'`)) === "cliente_ativo", "the company becomes Cliente ativo");
r = await create(vitor, { dealId: "d1" });
ok(r.status === 200 && r.body.created === false && r.body.id === rib, "doing it again changes nothing");
const ana = (await json(await vitor.get(`${BASE}/api/crm/contacts/c1/`))).body;
ok((ana.contact ?? ana).deals.find((d) => d.id === "d1").clientId === rib, "the opportunity points to its client");
// Another won opportunity of the same company: a new contract of the same client.
await sql(`INSERT INTO crm_deals (id, contact_id, title, value_cents, stage, owner_id, closed_at, service) VALUES ('d9', 'c1', 'Social Ribeiro', 120000, 'ganho', 'u-vitor', now(), 'social')`);
r = await create(vitor, { dealId: "d9" });
ok(r.status === 200 && r.body.created === false && r.body.id === rib, "a second won opportunity of the company adds a contract");
c = (await get(vitor, rib)).body.client;
ok(c.contracts.length === 2 && c.monthlyCents === 570000 && c.services.join() === "social,trafego", `two contracts, R$ 5.700/mês (${c.monthlyCents})`);

// ---- from a company; two clicks at once ----
const [a1, a2] = await Promise.all([create(vitor, { companyId: "co-sol", ownerId: "u-vitor" }), create(admin, { companyId: "co-sol", ownerId: "u-vitor" })]);
ok([a1.status, a2.status].sort().join() === "201,409", `one client per company, even with two clicks at once (${a1.status}, ${a2.status})`);
const sol = (a1.status === 201 ? a1 : a2).body.id;
ok((await get(vitor, sol)).body.client.companyName === "Clínica Sol", "…the one created is Clínica Sol's");
ok((await create(vitor, { companyId: "co-sol" })).status === 409, "a company that is already a client is refused");
ok((await sql(`SELECT count(*) FROM crm_clients WHERE company_id = 'co-sol'`)) === "1", "…only one record");

// ---- Comercial: only theirs ----
r = await list(joao);
ok(r.body.clients.length === 0, "João doesn't see Vitor's clients");
ok((await get(joao, rib)).status === 404, "…nor open them");
ok((await create(joao, { companyId: "co-souza", ownerId: "u-vitor" })).status === 403, "João can't give a client to someone else");
r = await create(joao, { companyId: "co-souza", status: "ativo", startedOn: "2026-11-01" });
ok(r.status === 201, "João makes his company a client");
const souza = r.body.id;
c = (await get(joao, souza)).body.client;
ok(c.ownerName === "João" && c.status === "ativo" && c.startedOn === "2026-11-01", "…his, Ativo, since 01/11");
ok((await list(joao)).body.clients.map((x) => x.companyName).join() === "Souza Pet", "João lists only his");
ok((await patch(joao, souza, { ownerId: "u-vitor" })).status === 403, "…and can't hand it to someone else");
ok((await create(joao, { companyId: "co-souza", status: "encerrado" })).status === 409, "already a client");

// ---- Marketing: no values ----
c = (await get(maria, rib)).body.client;
ok(c.monthlyCents === null && c.contracts.every((k) => k.valueCents === null), "Marketing sees the contracts without values");
ok(c.events.every((e) => e.payload.value === undefined), "…nor in the history");
ok((await patch(maria, rib, { notes: "x" })).status === 403, "Marketing can't edit clients");
ok((await addContract(maria, rib, { services: ["social"], startsOn: "2026-11-01" })).status === 403, "…nor add contracts");

// ---- contracts ----
ok((await addContract(vitor, rib, { services: [], startsOn: "2026-11-01" })).status === 400, "a contract needs a service");
ok((await addContract(vitor, rib, { services: ["trafego"] })).status === 400, "…and a start date");
ok((await addContract(vitor, rib, { services: ["trafego"], startsOn: "2026-11-01", endsOn: "2026-10-01" })).status === 400, "the end can't be before the start");
ok((await addContract(vitor, rib, { services: ["nope"], startsOn: "2026-11-01" })).status === 400, "only services from Personalização");
ok((await addContract(vitor, rib, { services: ["trafego"], startsOn: "2026-11-01", value: "abc" })).status === 400, "invalid value refused");
const in20 = await day(20);
r = await addContract(vitor, rib, { services: ["trafego", "social"], startsOn: await day(-10), endsOn: in20, value: "1.500,00", billing: "mensal", notes: "Reajuste anual" });
ok(r.status === 201 && r.body.contractId, "contract registered");
const k3 = r.body.contractId;
c = r.body.client;
const k = c.contracts.find((x) => x.id === k3);
ok(k.valueCents === 150000 && k.endsOn === in20 && k.daysLeft === 20 && c.daysLeft === 20 && c.nextEndsOn === in20, `ends in 20 days (${k.daysLeft})`);
ok(c.monthlyCents === 720000, "monthly value adds up the vigente monthly contracts");
const ids = async (api, q) => (await list(api, q)).body.clients.map((x) => x.companyName).sort().join();
ok((await ids(vitor, "renewal=30")) === "Ribeiro Odonto" && (await ids(vitor, "renewal=60")) === "Ribeiro Odonto", "filter: vence em até 30 / 60 dias");
ok((await ids(vitor, "renewal=vencido")) === "", "…nothing expired");
r = await editContract(vitor, rib, k3, { endsOn: await day(-1), value: "1.800" });
ok(r.status === 200 && r.body.client.contracts.find((x) => x.id === k3).daysLeft === -1, "contract edited: ended yesterday");
ok((await ids(vitor, "renewal=vencido")) === "Ribeiro Odonto" && (await ids(vitor, "renewal=30")) === "", "filter: contrato vencido");
const edited = r.body.client.events.find((e) => e.kind === "contract_edited");
ok(edited.payload.changes.map((x) => x.field).join() === "Vigência,Valor", `history: what changed (${edited.payload.changes.map((x) => x.field)})`);
ok((await get(maria, rib)).body.client.events.find((e) => e.kind === "contract_edited").payload.changes.map((x) => x.field).join() === "Vigência", "Marketing doesn't see the value change in the history");
ok((await editContract(vitor, rib, k3, { status: "rascunho" })).status === 400, "invalid contract situation refused");
ok((await editContract(vitor, souza, k3, { notes: "x" })).status === 404, "a contract only through its own client");
ok((await ids(vitor, "service=social")) === "Ribeiro Odonto" && (await ids(vitor, "owner=mine")) === "Clínica Sol,Ribeiro Odonto", "filters: service, mine");
ok((await ids(vitor, "q=sol")) === "Clínica Sol", "search by company");

// ---- ending and reactivating ----
ok((await patch(vitor, rib, { status: "encerrado" })).status === 400, "ending needs the reason");
r = await patch(vitor, rib, { status: "encerrado", endReason: "Corte de orçamento" });
c = r.body.client;
ok(r.status === 200 && c.status === "encerrado" && c.endReason === "Corte de orçamento" && c.endedOn && c.activeContracts === 0 && c.monthlyCents === null, "Encerrado: reason, date, vigente contracts closed");
ok((await sql(`SELECT status FROM crm_companies WHERE id = 'co-rib'`)) === "ex_cliente", "the company becomes Ex-cliente");
ok(!(await ids(vitor, "")).includes("Ribeiro"), "the default list leaves encerrados out");
ok((await ids(vitor, "status=todos")).includes("Ribeiro") && (await ids(vitor, "status=encerrado")) === "Ribeiro Odonto", "…Todos / Encerrado show it");
ok((await addContract(vitor, rib, { services: ["trafego"], startsOn: "2026-12-01" })).status === 400, "no vigente contract on an encerrado client");
r = await patch(vitor, rib, { status: "ativo", ownerId: "u-joao", notes: "Volta com tráfego em dezembro" });
ok(r.status === 200 && r.body.client.status === "ativo" && r.body.client.endReason === null && r.body.client.ownerName === "João", "reactivated, now with João");
ok((await sql(`SELECT status FROM crm_companies WHERE id = 'co-rib'`)) === "cliente_ativo", "…the company is Cliente ativo again");
ok((await get(joao, rib)).status === 200, "João sees it now");

// ---- an imported company that became a client survives "desfazer importação" ----
const imp = await json(await vitor.post(`${BASE}/api/crm/import/`, { data: { fileName: "lista.xlsx", rows: [{ line: 2, name: "Importado Ícaro", phone: "15991238001", company: "Ícaro Fit" }] } }));
ok(imp.status === 201, "imported a lead with a new company");
const icaro = await sql(`SELECT id FROM crm_companies WHERE name = 'Ícaro Fit'`);
ok((await create(vitor, { companyId: icaro })).status === 201, "…the company becomes a client");
ok((await json(await vitor.post(`${BASE}/api/crm/import/${imp.body.importId}/undo/`))).status === 200, "undoing the import still works");
ok((await sql(`SELECT count(*) FROM crm_contacts WHERE name = 'Importado Ícaro'`)) === "0" && (await sql(`SELECT count(*) FROM crm_companies WHERE id = $1`, [icaro])) === "1", "…the untouched lead goes, the client's company stays");

// ---- history and audit ----
ok((await json(await joao.post(`${BASE}/api/crm/clients/${rib}/notes/`, { data: { text: "  " } }))).status === 400, "an empty note is refused");
r = await json(await joao.post(`${BASE}/api/crm/clients/${rib}/notes/`, { data: { text: "Reunião de alinhamento: quer foco em implantes" } }));
ok(r.status === 201 && r.body.client.events[0].kind === "note" && r.body.client.events[0].userName === "João", "Registrar no histórico");
const kinds = (await sql(`SELECT string_agg(kind, ',' ORDER BY created_at, id) FROM crm_client_events WHERE client_id = $1`, [rib])).split(",");
ok(["created", "contract_added", "contract_edited", "status", "edited", "note"].every((x) => kinds.includes(x)), `history: ${kinds.join(",")}`);
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.client_create'`)) === "4", "four clients created in the audit trail");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.client_update' AND target_id = $1`, [rib])) === "2", "ending and reactivating (with the new responsible) audited");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.contract_change' AND target_id = $1`, [rib])) === "2", "contract created and edited audited");

await closeDb();
await browser.close();
console.log("CLIENTS API PASSED");
