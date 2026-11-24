// Personalização e etiquetas (especificação v1.0, Fase 1 · entrega 1) through
// the API, on base + campaign fixtures: who may change the lists, options
// that appear/disappear from forms, archived values kept on old records,
// segment rename, tags with who/how applied, filters, export, import.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false });
const { api: gestor } = await login(browser, "vitor", { open: false });
const { api: comercial } = await login(browser, "joao", { open: false });
const { api: mkt } = await login(browser, "maria", { open: false });
const opts = `${BASE}/api/crm/catalog/options/`;
const tags = `${BASE}/api/crm/catalog/tags/`;
const catalog = async (api = gestor) => (await json(await api.get(`${BASE}/api/crm/catalog/`))).body.catalog;

// ---- permissions ----
for (const [name, api] of [["Gestor", gestor], ["Comercial", comercial], ["Marketing", mkt]]) {
  ok((await gestor.get(`${BASE}/api/crm/catalog/`)).status() === 200 && (await json(await api.post(opts, { data: { kind: "source", label: "X" } }))).status === 403, `${name} reads the catalog but can't change it`);
}
ok((await json(await gestor.get(`${BASE}/api/crm/catalog/?usage=1`))).status === 403, "usage counts are Administrador only");
ok((await fetch(`${BASE}/api/crm/catalog/`)).status === 401, "anonymous refused");

// ---- seeds ----
let cat = await catalog();
const sourceLabels = cat.options.filter((o) => o.kind === "source").map((o) => o.label);
ok(sourceLabels.join(",") === "Tráfego pago,BNI,Site,Evento,Indicação,Prospecção manual,Outro", `origens from the old list (${sourceLabels})`);
ok(
  cat.tags.length === 19 && cat.tags.some((t) => t.category === "classificacao" && t.label === "Em negociação") && cat.tags.filter((t) => t.category === "atendimento").length === 5,
  "initial tags (with the Atendimento ones, Fase 4)"
);
ok(!cat.tags.some((t) => /frio|morno|quente/i.test(t.label)), "temperature is not a tag");

// ---- options ----
const created = await json(await admin.post(opts, { data: { kind: "source", label: "Google Meu Negócio", description: "Perfil da empresa no Google" } }));
ok(created.status === 200 && created.body.option.id === "google_meu_negocio", "Administrador adds an origem (code from the name)");
ok((await json(await admin.post(opts, { data: { kind: "source", label: "google meu negocio" } }))).status === 400, "same name (case/accents) refused");
const newContact = async (data) => json(await gestor.post(`${BASE}/api/crm/contacts/`, { data: { name: "Lead", createDeal: false, ...data } }));
const nc = await newContact({ name: "Lead Google", phone: "15991230001", source: "google_meu_negocio" });
ok(nc.status === 201, "new origem usable right away");
const ncId = nc.body.id;
await json(await gestor.post(`${BASE}/api/crm/contacts/`, { data: { name: "Lead Evento", phone: "15991230002", source: "evento", createDeal: false } }));
const eventoId = await sql(`SELECT id FROM crm_contacts WHERE name = 'Lead Evento'`);
ok((await json(await admin.patch(`${opts}source/evento/`, { data: { archived: true } }))).status === 200, "origem archived");
ok((await newContact({ name: "Lead X", phone: "15991230003", source: "evento" })).status === 400, "archived origem refused on a new contact");
ok((await json(await gestor.patch(`${BASE}/api/crm/contacts/${eventoId}/`, { data: { jobTitle: "Sócia", source: "evento" } }))).status === 200, "…but a contact that has it keeps it when edited");
ok((await sql(`SELECT source FROM crm_contacts WHERE id = '${eventoId}'`)) === "evento", "…and the value is unchanged");
ok((await json(await admin.patch(`${opts}source/outro/`, { data: { archived: true } }))).status === 400, "the fallback 'Outro' can't be archived");
ok((await json(await admin.put(opts, { data: { kind: "source", ids: ["google_meu_negocio"] } }))).status === 200, "reorder");
cat = await catalog();
ok(cat.options.filter((o) => o.kind === "source").sort((a, b) => a.sort - b.sort)[0].id === "google_meu_negocio", "new order is kept");
ok((await json(await admin.patch(`${opts}source/evento/`, { data: { archived: false } }))).status === 200, "origem reactivated");

// ---- segments (stored as text) ----
await json(await admin.post(opts, { data: { kind: "segment", label: "Odontologia" } }));
ok((await json(await gestor.patch(`${BASE}/api/crm/contacts/${ncId}/`, { data: { segment: "Odontologia" } }))).status === 200, "segment from the list accepted");
ok((await json(await gestor.patch(`${BASE}/api/crm/contacts/${ncId}/`, { data: { segment: "Inexistente" } }))).status === 400, "segment off the list refused");
const segId = (await catalog()).options.find((o) => o.kind === "segment" && o.label === "Odontologia").id;
const ren = await json(await admin.patch(`${opts}segment/${segId}/`, { data: { label: "Odonto" } }));
ok(ren.status === 200 && (await sql(`SELECT segment FROM crm_contacts WHERE id = '${ncId}'`)) === "Odonto", "renaming a segment renames it on the records");
const usage = (await json(await admin.get(`${BASE}/api/crm/catalog/?usage=1`))).body.usage;
ok(usage.options[`segment:${segId}`] === 1 && usage.options["source:google_meu_negocio"] === 1, "usage counts");

// ---- lost reasons and task kinds ----
await json(await admin.post(opts, { data: { kind: "lost_reason", label: "Fechou com agência interna" } }));
const dealId = await sql(`SELECT id FROM crm_deals WHERE stage = 'novo' AND owner_id IS NULL LIMIT 1`);
ok(
  (await json(await gestor.patch(`${BASE}/api/crm/deals/${dealId}/`, { data: { stage: "perdido", lostReason: "fechou_com_agencia_interna", lostNote: "Montaram equipe própria" } }))).status === 200,
  "new loss reason usable"
);
ok((await sql(`SELECT close_group FROM crm_deals WHERE id = '${dealId}'`)) === "negativo", "…a new reason counts as perda comercial by default");
ok((await json(await gestor.patch(`${BASE}/api/crm/deals/${dealId}/`, { data: { stage: "novo", reopenReason: "Voltou a conversar" } }))).status === 200, "reopened");
await json(await admin.patch(`${opts}lost_reason/fechou_com_agencia_interna/`, { data: { archived: true } }));
ok(
  (await json(await gestor.patch(`${BASE}/api/crm/deals/${dealId}/`, { data: { stage: "perdido", lostReason: "fechou_com_agencia_interna", lostNote: "De novo" } }))).status === 400,
  "archived loss reason refused"
);
await json(await admin.post(opts, { data: { kind: "task_kind", label: "Visita" } }));
const task = await json(await gestor.post(`${BASE}/api/crm/tasks/`, { data: { contactId: ncId, kind: "visita" } }));
ok(task.status < 300 && (await sql(`SELECT title FROM crm_tasks WHERE kind = 'visita'`)) === "Visita", "new task kind usable, default title = its name");
ok((await json(await gestor.post(`${BASE}/api/crm/tasks/`, { data: { contactId: ncId, kind: "nao_existe" } }))).status === 400, "unknown task kind refused");

// ---- tags ----
const vip = await json(await admin.post(tags, { data: { category: "classificacao", label: "Cliente VIP", color: "verde" } }));
ok(vip.status === 200, "Administrador creates a tag");
const vipId = vip.body.tag.id;
ok((await json(await admin.post(tags, { data: { category: "classificacao", label: "cliente vip", color: "azul" } }))).status === 400, "duplicate tag refused");
ok((await json(await gestor.post(tags, { data: { category: "acao", label: "X", color: "azul" } }))).status === 403, "Gestor can't create tags");
const ctag = (api, contact, tagId) => api.post(`${BASE}/api/crm/contacts/${contact}/tags/`, { data: { tagId } });
// João (Comercial) owns c2 (Bruno); c1 (Ana) is Vitor's.
ok((await ctag(comercial, "c2", vipId)).status() === 200, "Comercial tags their own lead");
ok((await ctag(comercial, "c1", vipId)).status() === 403, "Comercial can't tag someone else's lead (sees it, doesn't work on it)");
ok((await ctag(mkt, "c1", "origem-bni")).status() === 200, "Marketing tags any lead");
ok((await ctag(mkt, "c1", "origem-bni")).status() === 200 && (await sql(`SELECT count(*) FROM crm_contact_tags WHERE contact_id = 'c1'`)) === "1", "applying twice keeps one");
ok((await sql(`SELECT applied_via || '/' || applied_by_name FROM crm_contact_tags WHERE contact_id = 'c2'`)) === "manual/João", "who/how applied is recorded");
ok((await sql(`SELECT payload->>'label' FROM crm_events WHERE contact_id = 'c2' AND kind = 'tag'`)) === "Cliente VIP", "tag in the contact history");
const list = (await json(await gestor.get(`${BASE}/api/crm/contacts/?page=1&tag=${vipId}`))).body;
ok(list.total === 1 && list.rows[0].id === "c2" && list.rows[0].tagIds.includes(vipId), "contacts filtered by tag");
await admin.patch(`${tags}${vipId}/`, { data: { archived: true } });
ok((await ctag(gestor, "c1", vipId)).status() === 400, "archived tag can't be applied");
ok((await sql(`SELECT count(*) FROM crm_contact_tags WHERE tag_id = '${vipId}'`)) === "1", "…but stays on the contacts that have it");
await admin.patch(`${tags}${vipId}/`, { data: { archived: false } });
ok((await gestor.delete(`${BASE}/api/crm/contacts/c1/tags/?tagId=origem-bni`)).status() === 200, "tag removed");
ok((await sql(`SELECT count(*) FROM crm_events WHERE contact_id = 'c1' AND kind = 'tag' AND payload->>'action' = 'removed'`)) === "1", "removal in the history");
const csv = await (await gestor.get(`${BASE}/api/crm/contacts/export/?tag=${vipId}`)).text();
ok(/Etiquetas/.test(csv.split("\n")[0]) && /Cliente VIP/.test(csv), "export carries the tags");
const camp = (await json(await gestor.post(`${BASE}/api/crm/campaigns/preview/`, { data: { audience: { tag: vipId } } }))).body.preview;
ok(camp.matched === 1, "campaign audience by tag");
ok(Number(await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.catalog_change'`)) >= 8, "Personalização changes in the audit trail");

// ---- import ----
const rows = [
  { line: 2, name: "Importada Um", phone: "15991239001", segment: "Estética", source: "google meu negócio", tags: "BNI, Inexistente" },
  { line: 3, name: "Importada Dois", phone: "15991239002", segment: "odonto", tags: "Cliente VIP" },
];
const pv = (await json(await mkt.post(`${BASE}/api/crm/import/preview/`, { data: { rows } }))).body;
ok(pv.newSegments.join() === "Estética" && pv.unknownTags.join() === "Inexistente", `preview: new segment and unknown tag (${JSON.stringify([pv.newSegments, pv.unknownTags])})`);
const imp = await json(await mkt.post(`${BASE}/api/crm/import/`, { data: { fileName: "lista.xlsx", rows } }));
ok(imp.status === 201 && imp.body.counts.novo === 2, "imported");
const one = await sql(`SELECT id FROM crm_contacts WHERE name = 'Importada Um'`);
ok((await sql(`SELECT source FROM crm_contacts WHERE id = '${one}'`)) === "google_meu_negocio", "origem matched to the new option by name");
ok((await sql(`SELECT applied_via FROM crm_contact_tags WHERE contact_id = '${one}' AND tag_id = 'origem-bni'`)) === "importacao", "tag applied by the import");
ok((await sql(`SELECT segment FROM crm_contacts WHERE name = 'Importada Dois'`)) === "Odonto", "segment spelled as on the list");
ok((await sql(`SELECT count(*) FROM crm_options WHERE kind = 'segment' AND label = 'Estética'`)) === "1", "new segment joined the list");
const undo = await json(await mkt.post(`${BASE}/api/crm/import/${imp.body.importId}/undo/`));
ok(undo.status === 200 && (await sql(`SELECT count(*) FROM crm_contacts WHERE name LIKE 'Importada%'`)) === "0", "undo still removes untouched imported contacts (their import tags don't count as touched)");

await browser.close();
await closeDb();
console.log("CATALOG API PASSED");
