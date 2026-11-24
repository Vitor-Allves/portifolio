// Evolução v1.0 · cadastros (item 2) through the API, on base + campaign
// fixtures: the new fields of a lead and a company, duplicidade (phone,
// e-mail, company name and CNPJ answer 409 with who has it, the owner and the
// situation; the check before saving says the same), a second negotiation
// with the same lead or company (refused to the Comercial; a Gestor
// authorizes it, recorded in the history), the diagnóstico comercial (every
// save a new version) and documentos e anexos (types checked by content,
// 4 MB, who sees / who changes, download headers, archive) — plus the service
// catalog details a proposal starts from.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false }); // Administrador
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing
const contacts = `${BASE}/api/crm/contacts/`;
const companies = `${BASE}/api/crm/companies/`;
const contact = async (api, id) => (await json(await api.get(`${contacts}${id}/`))).body?.contact;
const dupes = async (api, q) => (await json(await api.get(`${BASE}/api/crm/duplicates/?${q}`))).body.duplicates;

// ---- new fields ----
let r = await json(
  await joao.post(contacts, {
    data: {
      name: "Olga Teles",
      phone: "(15) 99125-7001",
      altPhone: "(15) 3222-1000",
      potential: "alto",
      need: "Mais pacientes para implante",
      createDeal: false,
    },
  }),
);
ok(r.status === 201, `João creates a lead with outro telefone, potencial and necessidade (${r.body?.error ?? ""})`);
const olga = r.body.id;
let c = await contact(joao, olga);
ok(c.altPhone === "(15) 3222-1000" && c.potential === "alto" && c.need === "Mais pacientes para implante", "the new fields read back");
ok(
  (await json(await joao.post(contacts, { data: { name: "X", phone: "15991257002", potential: "enorme", createDeal: false } }))).status === 400,
  "unknown potencial refused",
);
ok(
  (await json(await joao.post(contacts, { data: { name: "X", phone: "15991257003", altPhone: "123", createDeal: false } }))).status === 400,
  "outro telefone needs DDD and number",
);
r = await json(await joao.patch(`${contacts}${olga}/`, { data: { potential: "medio", need: "Agenda cheia em março", altPhone: "" } }));
c = await contact(joao, olga);
ok(r.status === 200 && c.potential === "medio" && c.need === "Agenda cheia em março" && c.altPhone === null, "edited and cleared");
ok((await json(await joao.patch(`${contacts}c1/`, { data: { potential: "baixo" } }))).status === 403, "someone else's lead: not his to change");
r = await json(await vitor.post(companies, { data: { name: "Odonto Lagos", phone: "(15) 3333-4444", email: "Contato@OdontoLagos.com.br" } }));
ok(r.status === 201, "company created with telefone and e-mail");
const lagos = r.body.id;
const co = (await json(await vitor.get(`${companies}${lagos}/`))).body.company;
ok(co.phone === "(15) 3333-4444" && co.email === "contato@odontolagos.com.br", `company phone and e-mail read back (${co.phone} ${co.email})`);
ok((await json(await vitor.patch(`${companies}${lagos}/`, { data: { email: "não é email" } }))).status === 400, "invalid company e-mail refused");
const csv = await (await admin.get(`${contacts}export/`)).text();
ok(
  /Outro telefone/.test(csv) && /Potencial comercial/.test(csv) && /Necessidade identificada/.test(csv) && csv.includes("Agenda cheia em março"),
  "the contacts export carries the new columns",
);

// ---- duplicidade ----
r = await json(await joao.post(contacts, { data: { name: "Ana de Novo", phone: "15 99000-0001", createDeal: false } }));
ok(
  r.status === 409 && r.body.duplicate?.kind === "contact" && r.body.duplicate.id === "c1" && r.body.duplicate.by === "phone",
  `same WhatsApp refused, pointing to the lead (${r.body?.error})`,
);
ok(r.body.duplicate.ownerName === "Vitor" && /Vitor/.test(r.body.error) && typeof r.body.duplicate.situation === "string", "…with the owner and the situation");
await sql(`UPDATE crm_contacts SET email = 'bruno@souza.com.br' WHERE id = 'c2'`);
r = await json(await vitor.post(contacts, { data: { name: "Bruno 2", phone: "15991257004", email: "BRUNO@souza.com.br", createDeal: false } }));
ok(
  r.status === 409 && r.body.duplicate?.id === "c2" && r.body.duplicate.by === "email" && r.body.duplicate.ownerName === "João",
  "same e-mail (any case) refused",
);
r = await json(await vitor.patch(`${contacts}${olga}/`, { data: { phone: "5515990000002" } }));
ok(r.status === 409 && r.body.duplicate?.id === "c2", "editing onto another lead's phone refused the same way");
r = await json(await vitor.post(contacts, { data: { name: "Fábio de Volta", phone: "5515990000006", createDeal: false } }));
ok(r.status === 409 && r.body.duplicate?.id === "c6" && r.body.duplicate.situation === "arquivado", "an archived lead counts, said as arquivado");
let d = await dupes(joao, "phone=15990000001&email=bruno@souza.com.br&company=CLINICA SOL");
ok(
  d.map((x) => `${x.kind}:${x.id}`).join() === "contact:c1,contact:c2,company:co-sol",
  `the check before saving finds the lead, the e-mail and the company (${d.map((x) => x.id).join()})`,
);
ok((await dupes(joao, "phone=15991259999&email=ninguem@exemplo.com&company=Empresa Inexistente")).length === 0, "…and nothing when nothing matches");
ok((await json(await maria.get(`${BASE}/api/crm/duplicates/?phone=15990000001`))).status === 200, "Marketing checks too (it registers leads)");
r = await json(await vitor.post(companies, { data: { name: "Clinica  SOL" } }));
ok(r.status === 409 && r.body.duplicate?.kind === "company" && r.body.duplicate.id === "co-sol", `same company name refused (${r.body?.error})`);
await json(await vitor.patch(`${companies}${lagos}/`, { data: { cnpj: "11.222.333/0001-81" } }));
r = await json(await vitor.post(companies, { data: { name: "Lagos Filial", cnpj: "11222333000181" } }));
ok(
  r.status === 409 && r.body.duplicate?.id === lagos && r.body.duplicate.by === "cnpj" && /Odonto Lagos/.test(r.body.error),
  "same CNPJ refused, naming the company",
);
ok((await dupes(vitor, "cnpj=11.222.333/0001-81"))[0]?.id === lagos, "the check finds the CNPJ");

// ---- a second negotiation with the same lead or company ----
// Gabriela (k1, Vitor's) works at Clínica Sol and Vitor is negotiating with her.
await sql(`INSERT INTO crm_deals (id, contact_id, title, stage, owner_id) VALUES ('d-sol', 'k1', 'Clínica Sol — tráfego', 'negociacao', 'u-vitor')`);
ok(
  (await json(await vitor.post(`${BASE}/api/crm/deals/`, { data: { contactId: "k1", title: "Gabriela — redes" } }))).status === 201,
  "the same salesperson opening another opportunity is not a second negotiation",
);
const before = Number(await sql(`SELECT count(*) FROM crm_contacts`));
r = await json(await joao.post(contacts, { data: { name: "Paulo Sol", phone: "15991257005", company: "Clínica Sol" } }));
const vitorSol = (await sql(`SELECT string_agg(id, ',') FROM crm_deals WHERE contact_id = 'k1'`)).split(",");
ok(
  r.status === 409 &&
    r.body.duplicate?.kind === "deal" &&
    vitorSol.includes(r.body.duplicate.id) &&
    r.body.duplicate.ownerName === "Vitor" &&
    r.body.duplicate.by === "company",
  `a new lead at the company with an opportunity is refused (${r.body?.error})`,
);
ok(
  /Vitor/.test(r.body.error) && /Gestor/.test(r.body.error) && Number(await sql(`SELECT count(*) FROM crm_contacts`)) === before,
  "…saying who negotiates and that a Gestor authorizes; nothing saved",
);
ok(
  (await json(await joao.post(contacts, { data: { name: "Paulo Sol", phone: "15991257005", company: "Clínica Sol", allowParallel: true } }))).status === 409,
  "the Comercial can't authorize it himself",
);
r = await json(await joao.post(contacts, { data: { name: "Paulo Sol", phone: "15991257005", company: "Clínica Sol", ownerId: "u-joao", createDeal: false } }));
ok(r.status === 201, "the lead alone (no opportunity) is fine");
const paulo = r.body.id;
r = await json(await joao.post(`${BASE}/api/crm/deals/`, { data: { contactId: paulo, title: "Paulo — site" } }));
ok(r.status === 409 && vitorSol.includes(r.body.duplicate?.id), "an opportunity for him is refused too");
r = await json(await vitor.post(`${BASE}/api/crm/deals/`, { data: { contactId: paulo, title: "Paulo — site" } }));
ok(r.status === 409, "the Gestor too, unless he says so");
r = await json(await vitor.post(`${BASE}/api/crm/deals/`, { data: { contactId: paulo, title: "Paulo — site", allowParallel: true } }));
ok(r.status === 201, "the Gestor authorizes the second negotiation");
const ev = JSON.parse(
  await sql(
    `SELECT payload::text FROM crm_events WHERE contact_id = '${paulo}' AND kind = 'deal' AND payload->>'action' = 'created' AND payload->>'dealId' = '${r.body.id}'`,
  ),
);
ok(
  vitorSol.includes(ev.parallelTo) && /^Gabriela|^Clínica Sol/.test(ev.parallelTitle) && ev.authorizedBy === "Vitor",
  "…recorded in the history with who authorized it",
);
ok((await sql(`SELECT owner_id FROM crm_deals WHERE id = '${r.body.id}'`)) === "u-joao", "the opportunity is Paulo's owner's");
ok(
  (await json(await vitor.post(`${BASE}/api/crm/deals/`, { data: { contactId: "c2", title: "Bruno — novo" } }))).status === 201,
  "a lead with only closed opportunities: no conflict",
);
r = await json(await vitor.post(`${BASE}/api/crm/deals/`, { data: { contactId: "k1", title: "Gabriela — loja" } }));
ok(
  r.status === 409 && r.body.duplicate?.by === "company" && /João/.test(r.body.error),
  "now João negotiates at the company too: Vitor's next one is a second negotiation as well",
);

// ---- diagnóstico comercial ----
const diag = `${contacts}c2/diagnoses/`;
ok((await json(await joao.post(diag, { data: { problem: "Pouco movimento" } }))).status === 400, "the diagnosis needs the main need");
ok((await json(await joao.post(diag, { data: { need: "x", budget: "muito" } }))).status === 400, "money fields take R$ values");
ok((await json(await joao.post(diag, { data: { need: "x", urgency: "ontem" } }))).status === 400, "urgency from the list");
ok((await json(await joao.post(diag, { data: { need: "x", dealId: "d6" } }))).status === 400, "only one of the lead's own opportunities");
r = await json(
  await joao.post(diag, {
    data: {
      need: "Captar pacientes de implante",
      problem: "Depende de indicação",
      budget: "2.500",
      currentInvestment: "800,50",
      urgency: "alta",
      decisionMaker: "Bruno",
      dealId: "d2",
    },
  }),
);
ok(
  r.status === 201 && r.body.diagnosis.version === 1 && r.body.diagnosis.data.budget === 250000 && r.body.diagnosis.data.currentInvestment === 80050,
  "version 1 saved, money in cents",
);
r = await json(await joao.post(diag, { data: { need: "Captar pacientes de implante e lentes", urgency: "media" } }));
ok(r.status === 201 && r.body.diagnosis.version === 2 && r.body.diagnosis.createdByName === "João", "a new save is version 2");
let list = (await json(await joao.get(diag))).body.diagnoses;
ok(
  list.map((x) => x.version).join() === "2,1" && list[1].data.problem === "Depende de indicação" && list[1].dealTitle,
  "both versions kept, newest first (the first with its opportunity)",
);
ok((await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c2' AND kind = 'diagnosis'`)) === "2", "each version in the history");
ok((await json(await joao.post(`${contacts}c1/diagnoses/`, { data: { need: "x" } }))).status === 403, "someone else's lead: reads, doesn't write");
ok((await json(await joao.get(`${contacts}c1/diagnoses/`))).status === 200, "…but reads it");
ok((await json(await maria.post(diag, { data: { need: "x" } }))).status === 403, "Marketing doesn't write diagnoses");
ok((await json(await vitor.post(diag, { data: { need: "Revisado pelo Gestor" } }))).body.diagnosis.version === 3, "the Gestor updates anyone's");

// ---- documentos e anexos ----
const files = `${BASE}/api/crm/files/`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const up = (api, target, name, mimeType, buffer) => api.post(files, { multipart: { ...target, file: { name, mimeType, buffer } } }).then(json);
r = await up(joao, { contactId: "c2" }, "Briefing — Bruno.pdf", "application/pdf", PDF);
ok(
  r.status === 201 && r.body.file.mime === "application/pdf" && r.body.file.uploadedByName === "João",
  `João attaches a PDF to his lead (${r.body?.error ?? ""})`,
);
const pdfId = r.body.file.id;
ok((await up(joao, { contactId: "c2" }, "logo.png", "image/png", PNG)).status === 201, "…and an image");
r = await up(joao, { contactId: "c2" }, "nota.pdf", "application/pdf", Buffer.from("MZ\x90\x00 not a pdf"));
ok(r.status === 400 && /não confere/.test(r.body.error), "a file whose content doesn't match the extension is refused");
ok((await up(joao, { contactId: "c2" }, "script.exe", "application/octet-stream", Buffer.from("MZ"))).status === 400, "executables refused");
ok((await up(joao, { contactId: "c2" }, "page.html", "text/html", Buffer.from("<script>alert(1)</script>"))).status === 400, "HTML refused");
ok(
  (await up(joao, { contactId: "c2" }, "grande.pdf", "application/pdf", Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)]))).status === 400,
  "over 4 MB refused",
);
ok((await up(joao, { contactId: "c2" }, "vazio.txt", "text/plain", Buffer.alloc(0))).status === 400, "empty refused");
ok((await up(joao, { contactId: "c1" }, "x.pdf", "application/pdf", PDF)).status === 403, "someone else's lead: no attaching");
ok((await up(joao, { contactId: "c2", companyId: "co-sol" }, "x.pdf", "application/pdf", PDF)).status === 400, "one record per file");
ok((await up(joao, { contactId: "c2", dealId: "d6" }, "x.pdf", "application/pdf", PDF)).status === 400, "…and only the lead's own opportunity");
list = (await json(await joao.get(`${files}?contactId=c2`))).body.files;
ok(list.length === 2 && list.some((f) => f.name === "Briefing — Bruno.pdf"), "the lead's documents listed");
ok(
  (await json(await vitor.get(`${files}?contactId=c2`))).body.files.length === 2 && (await json(await maria.get(`${files}?contactId=c2`))).status === 200,
  "who sees the lead sees its documents",
);
let res = await joao.get(`${files}${pdfId}/`);
ok(
  res.status() === 200 &&
    res.headers()["content-type"] === "application/pdf" &&
    /^attachment;/.test(res.headers()["content-disposition"]) &&
    res.headers()["content-disposition"].includes("filename*=UTF-8''Briefing%20%E2%80%94%20Bruno.pdf"),
  "downloaded as an attachment with its name",
);
ok((await res.body()).equals(PDF) && /no-store/.test(res.headers()["cache-control"]), "…byte for byte, not cached");
ok(
  (await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c2' AND kind = 'file' AND payload->>'action' = 'attached'`)) === "2",
  "attaching is in the lead's history",
);
ok((await json(await vitor.delete(`${files}${pdfId}/`))).status === 200, "the Gestor archives one");
ok((await json(await joao.get(`${files}?contactId=c2`))).body.files.length === 1, "archived ones leave the list");
ok(
  (await json(await joao.get(`${files}?contactId=c2&archived=1`))).body.files.find((f) => f.id === pdfId)?.archivedByName === "Vitor",
  "…kept, with who archived it",
);
ok((await sql(`SELECT count(*) FROM crm_files WHERE id = '${pdfId}'`)) === "1", "nothing deleted");
r = await up(vitor, { contactId: "c1" }, "Contrato Ana.pdf", "application/pdf", PDF);
const anaFile = r.body.file.id;
ok((await joao.get(`${files}${anaFile}/`)).status() === 200, "João downloads a document of Vitor's lead (he sees it)…");
ok((await json(await joao.delete(`${files}${anaFile}/`))).status === 403, "…but doesn't archive it");
ok((await json(await joao.get(`${files}not-a-file/`))).status === 404, "unknown file: 404");
// Companies: everyone sees; who may work on the company attaches.
r = await up(vitor, { companyId: lagos }, "Cartão CNPJ.pdf", "application/pdf", PDF);
ok(r.status === 201, "a company document");
ok((await json(await joao.get(`${files}?companyId=${lagos}`))).body.files.length === 1, "everyone sees the company's documents");
await json(await vitor.patch(`${companies}${lagos}/`, { data: { ownerId: "u-vitor" } }));
ok((await up(joao, { companyId: lagos }, "x.pdf", "application/pdf", PDF)).status === 403, "someone else's account: no attaching");
// Active clients.
await json(await vitor.patch(`${contacts}c1/`, { data: { company: "Ribeiro Estética" } }));
const client = await json(await vitor.post(`${BASE}/api/crm/clients/`, { data: { dealId: "d1" } }));
ok(client.status === 201, `client created from Ana's sale (${client.body?.error ?? ""})`);
r = await up(
  vitor,
  { clientId: client.body.id },
  "Contrato assinado.docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]),
);
ok(r.status === 201 && r.body.file.mime.includes("wordprocessingml"), "a client document (Word)");
ok(
  (await json(await maria.get(`${files}?clientId=${client.body.id}`))).body.files.length === 1,
  "client documents follow the clients screen (Marketing sees them)",
);
ok((await up(maria, { clientId: client.body.id }, "x.pdf", "application/pdf", PDF)).status === 403, "…without editing clients, no attaching");
ok((await json(await joao.delete(`${files}${r.body.file.id}/`))).status === 403, "only the client's owner (or a Gestor) archives");

// ---- catálogo de serviços ----
r = await json(
  await admin.post(`${BASE}/api/crm/catalog/options/`, {
    data: {
      kind: "service",
      label: "Gestão de Google Ads",
      meta: {
        scope: "Campanhas de pesquisa e remarketing",
        referenceValue: "2.500",
        billing: "mensal",
        deadline: "Início em 7 dias",
        conditions: "Mínimo 3 meses",
      },
    },
  }),
);
ok(r.status === 200, `service with catalog details (${r.body?.error ?? ""})`);
const svc = r.body.option;
ok(
  svc.meta.referenceCents === 250000 && svc.meta.billing === "mensal" && svc.meta.scope.startsWith("Campanhas") && svc.meta.deadline && svc.meta.conditions,
  "scope, reference value, billing, deadline and conditions stored",
);
ok(
  (await json(await admin.patch(`${BASE}/api/crm/catalog/options/service/${svc.id}/`, { data: { meta: { billing: "anual" } } }))).status === 400,
  "unknown billing refused",
);
ok(
  (await json(await admin.patch(`${BASE}/api/crm/catalog/options/service/${svc.id}/`, { data: { meta: { referenceValue: "abc" } } }))).status === 400,
  "invalid reference value refused",
);
r = await json(await admin.patch(`${BASE}/api/crm/catalog/options/service/${svc.id}/`, { data: { meta: { referenceValue: "3.000,00", conditions: "" } } }));
const listed = (await json(await joao.get(`${BASE}/api/crm/catalog/`))).body.catalog.options.find((o) => o.kind === "service" && o.id === svc.id);
ok(
  r.status === 200 && listed?.meta?.referenceCents === 300000 && listed.meta.conditions === undefined && listed.meta.scope,
  "edited: the rest kept, a cleared field removed; everyone reads the catalog",
);

await browser.close();
await closeDb();
console.log("CADASTRO API PASSED");
