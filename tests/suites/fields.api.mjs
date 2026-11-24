// Fase 1 · entrega 2 through the API, on base + campaign fixtures: contact
// fields (temperatura, serviço de interesse, retorno, decisor, última
// interação, próxima atividade), companies (razão social, CNPJ validado e
// único, UF, endereço, responsável pela conta, situação, etiquetas,
// decisores, oportunidades), opportunities (serviço, valores estimado e
// negociado, origem, temperatura, motivo de ganho) and the requirement that
// grows with the stage. Runs under tsx so the pure helpers can be imported.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";
import { normalizeCnpj, formatCnpj, missingForStage } from "../../src/lib/crm-types.ts";
import { withExplicitSslMode } from "../../src/lib/db.ts";

// ---- pure rules ----
ok(normalizeCnpj("11.222.333/0001-81") === "11222333000181", "CNPJ with punctuation normalized");
ok(normalizeCnpj("11.222.333/0001-82") === null, "wrong check digit refused");
ok(normalizeCnpj("00.000.000/0000-00") === null, "repeated digits refused");
ok(normalizeCnpj("12.abc.345/01de-35") === "12ABC34501DE35", "alphanumeric CNPJ (July 2026) accepted, upper-cased");
ok(normalizeCnpj("12.ABC.345/01DE-36") === null, "alphanumeric CNPJ with a wrong check digit refused");
ok(formatCnpj("12ABC34501DE35") === "12.ABC.345/01DE-35", "CNPJ formatted for display");
ok(
  missingForStage("proposta", { service: null, valueCents: null, negotiatedCents: null, wonReason: null }).join() === "service,value" &&
    missingForStage("ganho", { service: "x", valueCents: 1, negotiatedCents: null, wonReason: null }).join() === "negotiated,wonReason" &&
    missingForStage("reuniao", { service: null, valueCents: null, negotiatedCents: null, wonReason: null }).length === 0,
  "stage requirements: Proposta asks service + value; Ganho asks negotiated value + reason; earlier stages ask nothing"
);
ok(withExplicitSslMode("postgres://u:p@h/db?sslmode=require") === "postgres://u:p@h/db?sslmode=verify-full", "sslmode=require spelled out as verify-full");
ok(withExplicitSslMode("postgres://u:p@h/db?sslmode=prefer&channel_binding=require") === "postgres://u:p@h/db?sslmode=verify-full&channel_binding=require", "…prefer too, other parameters untouched");
ok(withExplicitSslMode("postgres://u@localhost/db") === "postgres://u@localhost/db", "no sslmode → unchanged");
ok(withExplicitSslMode("postgres://u@h/db?sslmode=disable") === "postgres://u@h/db?sslmode=disable", "sslmode=disable → unchanged");

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: gestor } = await login(browser, "vitor", { open: false });
const { api: comercial } = await login(browser, "joao", { open: false });
const opts = `${BASE}/api/crm/catalog/options/`;
const contactUrl = (id) => `${BASE}/api/crm/contacts/${id}/`;
const dealUrl = (id) => `${BASE}/api/crm/deals/${id}/`;
const detail = async (id, api = gestor) => (await json(await api.get(contactUrl(id)))).body.contact;

// Serviços starts empty (Personalização); the team fills it in.
for (const label of ["Gestão de tráfego", "Social media", "Site institucional"]) await json(await admin.post(opts, { data: { kind: "service", label } }));
await json(await admin.patch(`${opts}service/site_institucional/`, { data: { archived: true } }));

// ---- contacts ----
const created = await json(
  await gestor.post(`${BASE}/api/crm/contacts/`, {
    data: { name: "Lia Quente", phone: "15991240001", temperature: "quente", serviceInterest: "gestao_de_trafego", returnAt: "2026-01-10" },
  })
);
ok(created.status === 201, "contact created with temperatura, serviço de interesse and retorno");
const lia = created.body.id;
let c = await detail(lia);
ok(c.temperature === "quente" && c.serviceInterest === "gestao_de_trafego" && c.returnAt === "2026-01-10" && c.isDecisionMaker === false, "fields read back");
ok(c.deals[0]?.service === "gestao_de_trafego", "the opportunity opened with the contact starts with its serviço de interesse");
ok(c.lastInteractionAt === null && c.nextTask === null, "no interaction and no next activity yet");
ok((await json(await gestor.post(`${BASE}/api/crm/contacts/`, { data: { name: "X", phone: "15991240002", temperature: "fervendo" } }))).status === 400, "unknown temperature refused");
ok((await json(await gestor.post(`${BASE}/api/crm/contacts/`, { data: { name: "X", phone: "15991240003", serviceInterest: "site_institucional" } }))).status === 400, "archived service refused");
ok((await json(await gestor.patch(contactUrl(lia), { data: { returnAt: "2026-02-30" } }))).status === 400, "impossible date refused");
ok((await json(await gestor.patch(contactUrl(lia), { data: { returnAt: "2026-02-03", temperature: "morno", isDecisionMaker: true } }))).status === 200, "contact fields edited");
c = await detail(lia);
const edited = c.events.filter((e) => e.kind === "edited").at(-1)?.payload.changes ?? [];
ok(
  edited.some((x) => x.field === "Retorno previsto" && x.from === "10/01/2026" && x.to === "03/02/2026") &&
    edited.some((x) => x.field === "Temperatura" && x.from === "Quente" && x.to === "Morno") &&
    edited.some((x) => x.field === "Decisor" && x.to === "Sim"),
  `edits land in the history (${JSON.stringify(edited)})`
);
await json(await gestor.post(`${contactUrl(lia)}notes/`, { data: { text: "Ligou pedindo proposta" } }));
await json(await gestor.post(`${BASE}/api/crm/tasks/`, { data: { contactId: lia, kind: "ligacao", title: "Retornar a ligação", dueDate: "2030-01-15" } }));
c = await detail(lia);
ok(c.lastInteractionAt && Date.now() - Date.parse(c.lastInteractionAt) < 120_000, "última interação = the note just written");
ok(c.nextTask?.title === "Retornar a ligação", "próxima atividade = the earliest pending task");
const list = async (q, api = gestor) => (await json(await api.get(`${BASE}/api/crm/contacts/?page=1&${q}`))).body.rows.map((r) => r.name);
ok((await list("temperature=morno")).join() === "Lia Quente", "filter by temperature");
ok((await list("service=gestao_de_trafego")).join() === "Lia Quente", "filter by serviço de interesse");
ok((await list("returnDue=atrasado")).join() === "Lia Quente", "filter by overdue return date");
ok((await list("returnDue=7d")).length === 0, "…and by the next 7 days");
const csv = await (await gestor.get(`${BASE}/api/crm/contacts/export/?q=Lia`)).text();
ok(/Temperatura;Serviço de interesse;Retorno previsto;Última interação;Decisor|Temperatura,Serviço de interesse,Retorno previsto,Última interação,Decisor/.test(csv) && csv.includes("Morno") && csv.includes("Gestão de tráfego") && csv.includes("03/02/2026"), "export carries the new columns");

// ---- stage requirements ----
// d5 = Eva Prado, "Novo", no value, no owner (Comercial may act on it).
let r = await json(await gestor.patch(dealUrl("d5"), { data: { stage: "proposta" } }));
ok(r.status === 400 && r.body.error.includes("serviço e valor estimado"), `Proposta without service and value refused (${r.body?.error})`);
ok((await json(await gestor.patch(dealUrl("d5"), { data: { stage: "reuniao" } }))).status === 200, "earlier stages ask nothing");
r = await json(await comercial.patch(dealUrl("d5"), { data: { stage: "proposta", service: "social_media", value: "3.500" } }));
ok(r.status === 200, "Proposta with service and value accepted (Comercial on an unowned lead)");
ok((await json(await gestor.patch(dealUrl("d5"), { data: { service: "" } }))).status === 400, "a field the stage requires can't be emptied");
ok((await json(await gestor.patch(dealUrl("d5"), { data: { value: null } }))).status === 400, "…the estimated value either");
ok((await json(await gestor.patch(dealUrl("d3"), { data: { title: "Proposta antiga" } }))).status === 200, "a deal already in Proposta without service can still be edited (no retroactive requirement)");
r = await json(await gestor.patch(dealUrl("d5"), { data: { stage: "ganho" } }));
ok(r.status === 400 && r.body.error.includes("valor negociado e motivo do ganho"), `Ganho without negotiated value and reason refused (${r.body?.error})`);
await json(await admin.patch(`${opts}won_reason/preco/`, { data: { archived: true } }));
ok((await json(await gestor.patch(dealUrl("d5"), { data: { stage: "ganho", negotiatedValue: "3.200", wonReason: "preco" } }))).status === 400, "archived win reason refused");
r = await json(await gestor.patch(dealUrl("d5"), { data: { stage: "ganho", negotiatedValue: "3.200,50", wonReason: "resultado", wonNote: "plano anual" } }));
ok(r.status === 200 && r.body.stage === "ganho", "Ganho with negotiated value and reason accepted");
let row = (await sql(`SELECT negotiated_cents || '|' || won_reason || '|' || won_note || '|' || value_cents FROM crm_deals WHERE id = 'd5'`));
ok(row === "320050|resultado|plano anual|350000", `negotiated and estimated values kept apart (${row})`);
c = await detail("c5");
const won = c.events.filter((e) => e.kind === "stage" && e.payload.to === "ganho").at(-1);
ok(won?.payload.wonReason === "resultado" && won.payload.valueCents === 320050, "the win (reason, value) is in the history");
const valueEdit = c.events.filter((e) => e.kind === "deal" && e.payload.action === "edited").flatMap((e) => e.payload.changes);
ok(valueEdit.some((x) => x.field === "Valor negociado" && x.to === "320050") && valueEdit.some((x) => x.field === "Serviço" && x.to === "Social media"), "value and service changes are in the history");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dash = (await json(await gestor.get(`${BASE}/api/crm/dashboard/?from=${today}&to=${today}`))).body;
ok(dash.dashboard?.current.wonValueCents === 320050, `Painel counts a won deal by its negotiated value (${JSON.stringify(dash.dashboard?.current ?? dash)})`);
ok((await json(await gestor.patch(dealUrl("d5"), { data: { stage: "proposta" } }))).status === 200, "reopened to Proposta (service and value already there)");
ok((await sql(`SELECT COALESCE(won_reason, 'none') FROM crm_deals WHERE id = 'd5'`)) === "none", "leaving Ganho clears the win reason");
ok((await json(await gestor.post(`${BASE}/api/crm/deals/`, { data: { contactId: lia, stage: "ganho" } }))).status === 400, "a new opportunity can't start in Ganho without what Ganho requires");
r = await json(await gestor.post(`${BASE}/api/crm/deals/`, { data: { contactId: lia, stage: "proposta", value: "1.000" } }));
ok(r.status === 201, "…but can start in Proposta when the contact's service fills the gap");

// ---- opportunity origin and temperature ----
ok((await json(await gestor.patch(dealUrl("d6"), { data: { source: "bni", temperature: "frio" } }))).status === 200, "deal origin and temperature edited");
let board = (await json(await gestor.get(`${BASE}/api/crm/deals/`))).body.deals;
const d6 = board.find((d) => d.id === "d6");
ok(d6.source === "bni" && d6.temperature === "frio", "board shows the deal's own origin and temperature");
const liaDeal = board.find((d) => d.contactId === lia && d.stage === "novo");
ok(liaDeal?.temperature === "morno" && liaDeal.source === "outro", "a deal without its own temperature shows the contact's; origin starts as the contact's");
ok((await sql(`SELECT source FROM crm_contacts WHERE id = 'c1'`)) === "indicacao", "changing the deal's origin leaves the contact's alone");

// ---- companies ----
const companies = `${BASE}/api/crm/companies/`;
r = await json(await gestor.post(companies, { data: { name: "Clínica Sorriso", cnpj: "11.222.333/0001-81", state: "sp" } }));
ok(r.status === 201, "company created with CNPJ");
const sorriso = r.body.id;
ok((await sql(`SELECT cnpj || '|' || state || '|' || status FROM crm_companies WHERE id = '${sorriso}'`)) === "11222333000181|SP|prospeccao", "CNPJ stored without punctuation, UF upper-cased, starts in Prospecção");
r = await json(await gestor.post(companies, { data: { name: "Outra Clínica", cnpj: "11222333000181" } }));
ok(r.status === 400 && r.body.error.includes("Clínica Sorriso"), "same CNPJ refused, naming the company that has it");
ok((await json(await gestor.post(companies, { data: { name: "Inválida", cnpj: "11.222.333/0001-80" } }))).status === 400, "invalid CNPJ refused");
r = await json(await gestor.post(companies, { data: { name: "Nova Era Tech", cnpj: "12.ABC.345/01DE-35" } }));
ok(r.status === 201, "alphanumeric CNPJ accepted");
const novaEra = r.body.id;
ok((await json(await gestor.patch(`${companies}${novaEra}/`, { data: { cnpj: "11.222.333/0001-81" } }))).status === 400, "editing onto another company's CNPJ refused");
ok((await json(await gestor.patch(`${companies}${sorriso}/`, { data: { state: "XX" } }))).status === 400, "unknown UF refused");
ok((await json(await gestor.patch(`${companies}${sorriso}/`, { data: { status: "fechada" } }))).status === 400, "unknown situação refused");
r = await json(
  await gestor.patch(`${companies}${sorriso}/`, {
    data: { legalName: "Sorriso Odontologia LTDA", address: "Rua XV, 100 — Centro", status: "cliente_ativo", ownerId: "u-joao" },
  })
);
ok(r.status === 200, "Gestor sets razão social, endereço, situação and responsável pela conta");
ok((await json(await comercial.patch(`${companies}${sorriso}/`, { data: { ownerId: "u-vitor" } }))).status === 403, "Comercial can't hand an account to someone else");
ok((await json(await comercial.patch(`${companies}${novaEra}/`, { data: { ownerId: "u-joao" } }))).status === 200, "…but can take an account with no owner");
// Lia works at Clínica Sorriso and decides.
await json(await gestor.patch(contactUrl(lia), { data: { company: "Clínica Sorriso" } }));
await json(await admin.post(`${BASE}/api/crm/catalog/tags/`, { data: { category: "classificacao", label: "Conta estratégica", color: "roxo" } }));
const tagId = (await sql(`SELECT id FROM crm_tags WHERE label = 'Conta estratégica'`));
ok((await json(await gestor.post(`${companies}${sorriso}/tags/`, { data: { tagId } }))).status === 200, "tag applied to a company");
const co = (await json(await gestor.get(`${companies}${sorriso}/`))).body.company;
ok(co.legalName === "Sorriso Odontologia LTDA" && co.ownerName === "João" && co.status === "cliente_ativo" && co.address.startsWith("Rua XV"), "company fields read back");
ok(co.tagIds.join() === tagId && co.tagLinks[0]?.byName === "Vitor", "company tag with who applied it");
ok(co.decisionMakers.map((d) => d.name).join() === "Lia Quente", "decisores listed on the company");
ok(co.deals.length === 2 && co.deals.every((d) => d.contactName === "Lia Quente"), "the company shows its contacts' opportunities");
const companyList = async (q, api = gestor) => (await json(await api.get(`${companies}?page=1&${q}`))).body.rows.map((x) => x.name);
ok((await companyList("status=cliente_ativo")).join() === "Clínica Sorriso", "filter by situação");
ok((await companyList("owner=mine", comercial)).sort().join() === "Clínica Sorriso,Nova Era Tech", "filter by 'my accounts'");
ok((await companyList("state=SP")).join() === "Clínica Sorriso", "filter by UF");
ok((await companyList(`tag=${tagId}`)).join() === "Clínica Sorriso", "filter by tag");
ok((await companyList("q=11.222.333")).join() === "Clínica Sorriso" && (await companyList("q=Odontologia LTDA")).join() === "Clínica Sorriso", "search by CNPJ or razão social");
ok((await json(await gestor.delete(`${companies}${sorriso}/tags/?tagId=${tagId}`))).body.removed === true, "company tag removed");
// Comercial sees only their own (and unowned) contacts' opportunities in a company.
await json(await gestor.patch(contactUrl("c2"), { data: { company: "Clínica Sorriso" } }));
await json(await gestor.patch(contactUrl(lia), { data: { ownerId: "u-vitor" } }));
const coJoao = (await json(await comercial.get(`${companies}${sorriso}/`))).body.company;
ok(coJoao.contacts.map((x) => x.name).join() === "Bruno Souza" && coJoao.deals.every((d) => d.contactName === "Bruno Souza"), "Comercial sees only their own contacts' opportunities in the company");

// ---- import with CNPJ ----
const rows = [
  { line: 2, name: "Pessoa Um", phone: "15991250001", company: "Sorriso Clínica Odonto", cnpj: "11.222.333/0001-81" },
  { line: 3, name: "Pessoa Dois", phone: "15991250002", company: "Empresa Nova", cnpj: "11.444.777/0001-61" },
  { line: 4, name: "Pessoa Três", phone: "15991250003", company: "Qualquer", cnpj: "123" },
  { line: 5, name: "Pessoa Quatro", phone: "15991250004", company: "Nova Era Tech", cnpj: "22.333.444/0001-81" },
  { line: 6, name: "Pessoa Cinco", phone: "15991250005", company: "Outro Nome", cnpj: "11444777000161" },
];
const pv = (await json(await gestor.post(`${BASE}/api/crm/import/preview/`, { data: { rows } }))).body;
const status = Object.fromEntries(pv.results.map((x) => [x.line, `${x.status}${x.message ? `: ${x.message}` : ""}`]));
ok(status[2] === "novo" && status[3] === "novo" && status[6] === "novo", `CNPJ rows accepted (${JSON.stringify(status)})`);
ok(status[4].startsWith("erro: CNPJ inválido"), "invalid CNPJ is a row error");
ok(status[5].startsWith("erro: A empresa Nova Era Tech já está cadastrada com outro CNPJ"), "a company name registered with another CNPJ is a row error");
ok(pv.newCompanies === 1, `only one new company (${pv.newCompanies})`);
const imp = await json(await gestor.post(`${BASE}/api/crm/import/`, { data: { fileName: "cnpj.xlsx", rows } }));
ok(imp.status === 201 && imp.body.counts.novo === 3, "imported");
ok((await sql(`SELECT co.name FROM crm_contacts c JOIN crm_companies co ON co.id = c.company_id WHERE c.name = 'Pessoa Um'`)) === "Clínica Sorriso", "a known CNPJ links to that company whatever name the sheet uses");
ok((await sql(`SELECT co.cnpj FROM crm_contacts c JOIN crm_companies co ON co.id = c.company_id WHERE c.name = 'Pessoa Dois'`)) === "11444777000161", "a new company is created with its CNPJ");
ok((await sql(`SELECT co.name FROM crm_contacts c JOIN crm_companies co ON co.id = c.company_id WHERE c.name = 'Pessoa Cinco'`)) === "Empresa Nova", "the same CNPJ under another name in the sheet links to the same new company");

await closeDb();
await browser.close();
console.log("FIELDS API PASSED");
