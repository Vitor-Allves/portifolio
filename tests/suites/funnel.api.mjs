// Evolução v1.0 · funil e tabulação through the API, on base + campaign
// fixtures: the ten stages in Personalização (rename, probability, create,
// order, archive rules — Administrador only), an opportunity's own
// probability, the tabulação required to close (result / group, reason,
// observation, who closed, the date for a future opportunity and its pick-up
// task), the justification to reopen, the Painel not counting future
// opportunities as losses, and the tabulação report (filters, a Comercial's
// own scope, CSV and PDF, audited).
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: admin } = await login(browser, "admin", { open: false }); // Administrador
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing
const opts = `${BASE}/api/crm/catalog/options/`;
const patch = async (api, id, data) => json(await api.patch(`${BASE}/api/crm/deals/${id}/`, { data }));
const board = async (api = vitor) => (await json(await api.get(`${BASE}/api/crm/deals/`))).body.deals;
const stagesOf = async () =>
  (await json(await admin.get(`${BASE}/api/crm/catalog/`))).body.catalog.options.filter((o) => o.kind === "stage" && !o.archived).sort((a, b) => a.sort - b.sort);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

// ---- the ten stages, in Personalização ----
let stages = await stagesOf();
ok(
  stages.map((s) => s.label).join() ===
    "Novo lead,Primeiro contato,Em qualificação,Diagnóstico realizado,Proposta em elaboração,Proposta enviada,Em negociação,Aguardando aprovação,Venda fechada,Venda perdida",
  `the spec's ten stages, in order (${stages.map((s) => s.label).join()})`
);
ok(stages.map((s) => s.meta.probability).join() === "5,10,20,35,45,55,70,85,100,0", "each with its probability");
let r = await json(await admin.patch(`${opts}stage/diagnostico/`, { data: { label: "Diagnóstico feito", meta: { probability: 40 } } }));
ok(r.status === 200, "Administrador renames a stage and sets its probability");
ok((await json(await admin.patch(`${opts}stage/ganho/`, { data: { meta: { probability: 90 } } }))).status === 400, "Venda fechada is always 100%");
ok((await json(await admin.patch(`${opts}stage/elaboracao/`, { data: { meta: { probability: 140 } } }))).status === 400, "a probability over 100% is refused");
ok((await json(await admin.patch(`${opts}stage/novo/`, { data: { archived: true } }))).status === 400, "Novo lead (fixed) can't be archived");
ok((await json(await admin.patch(`${opts}stage/reuniao/`, { data: { archived: true } }))).status === 400, "a stage with opportunities in it can't be archived");
ok((await json(await vitor.post(opts, { data: { kind: "stage", label: "Visita" } }))).status === 403, "a Gestor can't change the funnel");
r = await json(await admin.post(opts, { data: { kind: "stage", label: "Visita técnica", color: "turquesa", meta: { probability: 30 } } }));
ok(r.status === 200 && r.body.option.id === "visita_tecnica" && r.body.option.meta.probability === 30 && r.body.option.color === "turquesa", "a new stage, with color and probability");
const ids = (await stagesOf()).map((s) => s.id);
const wanted = ["ganho", "visita_tecnica", ...ids.filter((id) => id !== "ganho" && id !== "visita_tecnica")];
ok((await json(await admin.put(opts, { data: { kind: "stage", ids: wanted } }))).status === 200, "reordered");
stages = await stagesOf();
ok(
  stages[0].id === "novo" && stages[1].id === "visita_tecnica" && stages.at(-2).id === "ganho" && stages.at(-1).id === "perdido",
  `Novo lead stays first, Venda fechada and Venda perdida last (${stages.map((s) => s.id).join()})`
);
ok(Number(await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.catalog_change' AND target_id LIKE 'stage%'`)) >= 3, "stage changes are audited");

// ---- an opportunity in the new stage, with its probability ----
// d6 = Ana Ribeiro, Vitor's, in "Em qualificação" with R$ 1.000.
ok((await patch(vitor, "d6", { stage: "nao_existe" })).status === 400, "an unknown stage is refused");
ok((await patch(vitor, "d6", { stage: "visita_tecnica" })).status === 200, "moved to the new stage");
let d6 = (await board()).find((d) => d.id === "d6");
ok(d6.stage === "visita_tecnica" && d6.probability === 30 && d6.probabilityOwn === false, `the stage's probability (${d6.probability})`);
ok((await patch(vitor, "d6", { probability: 120 })).status === 400, "an invalid probability is refused");
ok((await patch(vitor, "d6", { probability: "65" })).status === 200, "the opportunity's own probability");
d6 = (await board()).find((d) => d.id === "d6");
ok(d6.probability === 65 && d6.probabilityOwn === true, "…shown instead of the stage's");
const edited = await sql(`SELECT payload::text FROM crm_events WHERE contact_id = 'c1' AND kind = 'deal' AND payload->>'action' = 'edited' ORDER BY created_at DESC LIMIT 1`);
ok(/Probabilidade/.test(edited) && /65%/.test(edited), "…and the change is in the history");
ok((await patch(vitor, "d6", { probability: null })).status === 200 && (await board()).find((d) => d.id === "d6").probability === 30, "cleared: back to the stage's");
ok((await json(await admin.patch(`${opts}stage/visita_tecnica/`, { data: { archived: true } }))).status === 400, "the new stage can't be archived while d6 is in it");
ok((await patch(vitor, "d6", { stage: "elaboracao" })).status === 400, "Proposta em elaboração asks for the service");

// ---- Venda perdida: tabulação ----
ok((await patch(vitor, "d6", { stage: "perdido" })).status === 400, "closing without a reason is refused");
r = await patch(vitor, "d6", { stage: "perdido", lostReason: "preco" });
ok(r.status === 400 && /observação/.test(r.body.error), `…without an observation too (${r.body?.error})`);
r = await patch(vitor, "d6", { stage: "perdido", lostReason: "retornar", lostNote: "Volta a falar em março" });
ok(r.status === 400 && /data para retomar/.test(r.body.error), `a future opportunity needs the date (${r.body?.error})`);
r = await patch(vitor, "d6", { stage: "perdido", lostReason: "retornar", lostNote: "Volta a falar em março", returnOn: "2027-03-02" });
ok(r.status === 200, "closed as oportunidade futura");
let row = JSON.parse(await sql(`SELECT row_to_json(x)::text FROM (SELECT close_group, return_on::text, closed_by, closed_by_name, lost_reason FROM crm_deals WHERE id = 'd6') x`));
ok(row.close_group === "futuro" && row.return_on === "2027-03-02" && row.closed_by === "u-vitor" && row.closed_by_name === "Vitor", `group, date and who closed it recorded (${JSON.stringify(row)})`);
const task = JSON.parse(await sql(`SELECT row_to_json(x)::text FROM (SELECT title, kind, owner_id, status, (due_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS due FROM crm_tasks WHERE deal_id = 'd6') x`));
ok(task.title === "Retomar: d6" && task.kind === "follow_up" && task.owner_id === "u-vitor" && task.status === "pendente" && task.due === "2027-03-02", `the pick-up task is on the owner's agenda (${JSON.stringify(task)})`);
const closeEv = JSON.parse(await sql(`SELECT payload::text FROM crm_events WHERE contact_id = 'c1' AND kind = 'stage' AND payload->>'to' = 'perdido' ORDER BY created_at DESC LIMIT 1`));
ok(closeEv.group === "futuro" && closeEv.returnOn === "2027-03-02" && closeEv.lostReason === "retornar", "the tabulação is in the history");
let dash = (await json(await vitor.get(`${BASE}/api/crm/dashboard/?from=${today}&to=${today}`))).body.dashboard;
ok(dash.current.lostCount === 0, `a future opportunity isn't counted as lost on the Painel (${dash.current.lostCount})`);

// ---- reopening ----
r = await patch(vitor, "d6", { stage: "conversa" });
ok(r.status === 400 && /justificativa/.test(r.body.error), "reopening asks for the justification");
ok((await patch(vitor, "d6", { stage: "conversa", reopenReason: "Cliente ligou antes de março" })).status === 200, "reopened with the justification");
row = JSON.parse(await sql(`SELECT row_to_json(x)::text FROM (SELECT close_group, return_on, closed_by, closed_at, lost_reason FROM crm_deals WHERE id = 'd6') x`));
ok(row.close_group === null && row.return_on === null && row.closed_by === null && row.closed_at === null && row.lost_reason === null, "reopened: the closing is cleared on the opportunity");
const reopenEv = JSON.parse(await sql(`SELECT payload::text FROM crm_events WHERE contact_id = 'c1' AND kind = 'stage' AND payload ? 'reopenReason' ORDER BY created_at DESC LIMIT 1`));
ok(reopenEv.reopenReason === "Cliente ligou antes de março" && reopenEv.previous.group === "futuro" && reopenEv.previous.lostReason === "retornar", "…and kept in the history with what it was");

// ---- Venda fechada: tabulação ----
const service = (await json(await admin.post(opts, { data: { kind: "service", label: "Gestão de tráfego" } }))).body.option.id;
r = await patch(vitor, "d6", { stage: "ganho", service, negotiatedValue: "1.200", wonReason: "resultado", wonNote: "Plano de 6 meses" });
ok(r.status === 400 && /resultado/.test(r.body.error), `closing a sale asks for the result (${r.body?.error})`);
r = await patch(vitor, "d6", { stage: "ganho", service, negotiatedValue: "1.200", wonReason: "resultado", wonResult: "proposta_aprovada" });
ok(r.status === 400 && /observação/.test(r.body.error), "…and the observation");
r = await patch(vitor, "d6", { stage: "ganho", service, negotiatedValue: "1.200", wonReason: "resultado", wonResult: "proposta_aprovada", wonNote: "Plano de 6 meses" });
ok(r.status === 200, "Venda fechada with the tabulação");
row = JSON.parse(await sql(`SELECT row_to_json(x)::text FROM (SELECT close_group, won_result, closed_by_name FROM crm_deals WHERE id = 'd6') x`));
ok(row.close_group === "positivo" && row.won_result === "proposta_aprovada" && row.closed_by_name === "Vitor", "positive result recorded");
ok((await board()).find((d) => d.id === "d6").probability === 100, "a sale is 100%");

// ---- Sem conversão, by a Comercial on their own opportunity ----
// d3 = Carla Dias, João's, in Proposta enviada.
ok((await patch(joao, "d3", { stage: "perdido", lostReason: "contato_invalido", lostNote: "O número não existe" })).status === 200, "a Comercial closes their own as sem conversão");
ok((await sql(`SELECT close_group || '|' || closed_by_name FROM crm_deals WHERE id = 'd3'`)) === "sem_conversao|João", "group from the reason, closed by João");
dash = (await json(await vitor.get(`${BASE}/api/crm/dashboard/?from=${today}&to=${today}`))).body.dashboard;
ok(dash.current.lostCount === 1 && dash.current.conversion === 0.5, `the Painel: 1 lost, conversion 1 ÷ (1 + 1) (${dash.current.lostCount}, ${dash.current.conversion})`);
ok(dash.funnel.map((f) => f.stage).join() === stages.map((s) => s.id).join(), "the Painel's funnel follows the order set in Personalização");

// ---- the tabulação report ----
const report = async (api, q) => json(await api.get(`${BASE}/api/crm/reports/tabulation/?${q}`));
let rep = (await report(vitor, `from=${today}&to=${today}`)).body.report;
const g = Object.fromEntries(rep.groups.map((x) => [x.group, x.count]));
ok(g.positivo === 1 && g.negativo === 0 && g.sem_conversao === 1 && g.futuro === 0, `today: 1 positive, 1 sem conversão (${JSON.stringify(g)})`);
ok(rep.reopened === 1, "…and 1 reopening");
ok(rep.results.length === 1 && rep.results[0].result === "proposta_aprovada" && rep.groups.find((x) => x.group === "positivo").valueCents === 120000, "the positive one: proposta aprovada, R$ 1.200");
const vit = rep.people.find((p) => p.name === "Vitor");
const jo = rep.people.find((p) => p.name === "João");
ok(vit.positivo === 1 && vit.conversion === 1 && jo.sem_conversao === 1 && jo.conversion === 0, "by seller, with conversion");
const d3row = rep.rows.find((x) => x.id === "d3");
ok(d3row.group === "sem_conversao" && d3row.reason === "contato_invalido" && d3row.note === "O número não existe" && d3row.closedByName === "João", "each closing listed with reason, observation and who closed it");
ok((await report(vitor, `from=${today}&to=${today}&group=sem_conversao`)).body.report.rows.map((x) => x.id).join() === "d3", "filter by group");
ok((await report(vitor, `from=${today}&to=${today}&reason=contato_invalido`)).body.report.total === 1, "filter by reason");
ok((await report(vitor, `from=${today}&to=${today}&service=${service}`)).body.report.rows.map((x) => x.id).join() === "d6", "filter by service");
ok((await report(vitor, `from=${today}&to=${today}&owner=u-joao`)).body.report.rows.map((x) => x.id).join() === "d3", "filter by seller");
ok((await report(joao, `from=${today}&to=${today}&owner=u-vitor`)).body.report.rows.map((x) => x.id).join() === "d3", "a Comercial only gets their own, whatever is asked");
rep = (await report(vitor, "from=2026-10-01&to=2026-10-31")).body.report;
ok(
  rep.groups.find((x) => x.group === "positivo").count === 1 && rep.groups.find((x) => x.group === "negativo").count === 1 && rep.rows.find((x) => x.id === "d2").reason === "concorrente",
  "October (closed before this version): Ana's sale and Bruno's loss to a competitor; the archived contact left out"
);
ok((await report(vitor, "from=2026-10-31&to=2026-10-01")).status === 400, "an invalid period is refused");

// ---- export ----
let res = await vitor.get(`${BASE}/api/crm/reports/tabulation/export/?from=${today}&to=${today}&format=csv`);
let text = await res.text();
ok(res.status() === 200 && /text\/csv/.test(res.headers()["content-type"]) && text.includes("Relatório de tabulação comercial") && text.includes("Contato inválido") && text.includes("O número não existe"), "planilha (CSV)");
res = await vitor.get(`${BASE}/api/crm/reports/tabulation/export/?from=${today}&to=${today}&format=pdf`);
const pdf = await res.body();
ok(res.status() === 200 && res.headers()["content-type"] === "application/pdf" && pdf.subarray(0, 5).toString() === "%PDF-" && pdf.length > 20_000, `PDF with the Legado identity (${pdf.length} bytes)`);
ok((await joao.get(`${BASE}/api/crm/reports/tabulation/export/?from=${today}&to=${today}&format=csv`)).status() === 403, "a Comercial can't export");
ok((await maria.get(`${BASE}/api/crm/reports/tabulation/export/?from=${today}&to=${today}&format=pdf`)).status() === 200, "Marketing can");
const audits = (await sql(`SELECT string_agg(metadata->>'format', ',' ORDER BY created_at) FROM audit_log WHERE action = 'crm.report_export' AND target_type = 'crm_report'`)) ?? "";
ok(audits === "csv,pdf,pdf", `every export audited (${audits})`);

await closeDb();
await browser.close();
console.log("FUNNEL API PASSED");
