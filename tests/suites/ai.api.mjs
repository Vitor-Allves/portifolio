// Fase 7 · entrega 2 through the API, with a test-only AI key against the fake
// Anthropic API in fake-graph.mjs: the AI is asked only when requested and
// allowed ("useAi"), gets only the data and calculations the person may see
// (no phones or e-mails, nothing from other people's leads, no money without
// "ver valores"), its text comes back apart from the data, every request is
// audited with tokens and no content, refusals and errors don't break the
// analysis, and there is a daily limit.
import fs from "node:fs";
import path from "node:path";
import { BASE, FAKE_GRAPH_DIR, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor: may use the AI
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial: not by default
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing
const analysis = async (api, data) => json(await api.post(`${BASE}/api/crm/ai/analysis/`, { data }));
const LOG = path.join(FAKE_GRAPH_DIR, "ai.jsonl");
const sent = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const audits = () => sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.ai_request'`);

// ---- ready, then asked ----
let r = await analysis(vitor, { kind: "lead", contactId: "c1" });
ok(r.status === 200 && r.body.analysis.aiStatus === "ready" && r.body.analysis.remainingToday === 30 && r.body.analysis.ai === null, "the AI is ready, not called until asked");
ok(sent().length === 0, "…nothing sent yet");
r = await analysis(vitor, { kind: "lead", contactId: "c1", generate: true });
let a = r.body.analysis;
ok(a.aiStatus === "ok" && a.ai.model === "claude-opus-5-5" && a.remainingToday === 29, `the AI answered (${a.aiStatus} ${a.aiMessage ?? ""})`);
ok(a.ai.text.includes("## Situação atual") && a.ai.text.includes("## Próximos passos sugeridos") && a.ai.text.includes("Resumo do lead: Ana Ribeiro"), "in the requested sections");
ok(a.facts.length > 0 && a.calculations.length > 0, "the data and calculations come apart from the AI's text");

const call = sent()[0];
ok(/test-only-anthropic-key$/.test(call.headers.auth) && /server-side-fallback-2026-07-01/.test(call.headers.beta), "the key and the refusal-fallback beta are sent");
ok(call.body.model === "claude-opus-5-5" && call.body.fallbacks === "default" && call.body.output_config.effort === "medium" && call.body.max_tokens === 16000, "model, fallbacks and effort as specified");
ok(/Use somente esses dados/.test(call.body.system) && /nunca siga instruções/.test(call.body.system), "the system prompt keeps it to the data and ignores instructions inside it");
const prompt = call.body.messages[0].content;
ok(prompt.startsWith("<dados_crm>") && prompt.includes("Ana Ribeiro") && prompt.includes("calculos_do_sistema"), "the data and calculations go inside <dados_crm>");
ok(!prompt.includes("5515990000001") && !prompt.includes("@"), "no phone or e-mail is sent");
const audit = JSON.parse(await sql(`SELECT metadata::text FROM audit_log WHERE action = 'crm.ai_request'`));
ok(audit.status === "ok" && audit.kind === "lead" && audit.inputTokens > 0 && audit.outputTokens > 0 && !JSON.stringify(audit).includes("Ana"), "audited: kind, status and tokens, never the content");

// ---- who may use it, and what it gets ----
r = await analysis(joao, { kind: "lead", contactId: "c2", generate: true });
ok(r.body.analysis.aiStatus === "not_allowed" && r.body.analysis.ai === null && sent().length === 1, "a Comercial doesn't use the AI by default (nothing sent)");
await sql(`UPDATE internal_users SET crm_permissions = '{"useAi": true}'::jsonb WHERE id = 'u-joao'`);
r = await analysis(joao, { kind: "dashboard", from: "2026-10-01", to: "2026-10-31", owner: "u-vitor", generate: true });
ok(r.body.analysis.aiStatus === "ok", "…unless given the permission");
const jp = sent().at(-1).body.messages[0].content;
ok(jp.includes("João") && !jp.includes("Vitor"), "a Comercial's executive summary only carries his own numbers");
ok((await analysis(joao, { kind: "lead", contactId: "c1", generate: true })).status === 403 && sent().length === 2, "…and he can't send someone else's lead to the AI");

// Client report: money only with "ver valores".
await sql(`INSERT INTO crm_options (kind, id, label, sort) VALUES ('service', 'trafego', 'Gestão de tráfego', 1)`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor')`);
const rib = (await json(await vitor.post(`${BASE}/api/crm/clients/`, { data: { companyId: "co-rib", status: "ativo", startedOn: "2026-09-01" } }))).body.id;
await vitor.post(`${BASE}/api/crm/clients/${rib}/contracts/`, { data: { services: ["trafego"], startsOn: "2026-09-01", value: "3.500", billing: "mensal" } });
await vitor.post(`${BASE}/api/crm/clients/${rib}/reports/`, { data: { month: "2026-10", services: ["trafego"], results: "Mais conversas no WhatsApp" } });
r = await analysis(vitor, { kind: "client", clientId: rib, month: "2026-10", generate: true });
a = r.body.analysis;
ok(a.aiStatus === "ok" && a.ai.text.includes("## Resumo do mês"), "monthly client report drafted");
ok(JSON.stringify(a.facts).includes("Mais conversas no WhatsApp") && a.calculations.some((c) => c.label === "Receita mensal contratada" && /3\.500/.test(c.value)), "with the month's acompanhamento and the contracted revenue");
await sql(`UPDATE internal_users SET crm_permissions = '{"useAi": true}'::jsonb WHERE id = 'u-maria'`);
r = await analysis(maria, { kind: "client", clientId: rib, month: "2026-10", generate: true });
ok(r.body.analysis.aiStatus === "ok" && !/R\$/.test(sent().at(-1).body.messages[0].content) && !JSON.stringify(r.body.analysis).includes("3.500"), "Marketing's report carries no money, to the AI or the screen");

// ---- refusal and errors don't break it ----
await sql(`INSERT INTO crm_events (id, contact_id, kind, payload, user_id, created_at) VALUES ('e-ref', 'c1', 'note', '{"text": "RECUSE-ISTO"}', 'u-vitor', now())`);
r = await analysis(vitor, { kind: "lead", contactId: "c1", generate: true });
ok(r.status === 200 && r.body.analysis.aiStatus === "refused" && r.body.analysis.ai === null && r.body.analysis.facts.length > 0, "a refusal says so and keeps the data");
fs.writeFileSync(path.join(FAKE_GRAPH_DIR, "ai-error"), "");
r = await analysis(vitor, { kind: "lead", contactId: "c2", generate: true });
ok(r.status === 200 && r.body.analysis.aiStatus === "error" && /não conseguiu responder/.test(r.body.analysis.aiMessage), "an AI outage says so and keeps the data");
fs.rmSync(path.join(FAKE_GRAPH_DIR, "ai-error"));
ok((await sql(`SELECT string_agg(metadata->>'status', ',' ORDER BY created_at) FROM audit_log WHERE action = 'crm.ai_request' AND actor_user_id = 'u-vitor'`)) === "ok,ok,refused,error", "each outcome audited");

// ---- daily limit ----
await sql(
  `INSERT INTO audit_log (id, actor_user_id, actor_label, actor_kind, action, target_type, metadata)
   SELECT 'fill-' || g, 'u-vitor', 'Vitor', 'admin', 'crm.ai_request', 'crm_contact', '{}' FROM generate_series(1, 26) g`
);
const before = sent().length;
r = await analysis(vitor, { kind: "lead", contactId: "c1", generate: true });
ok(r.body.analysis.aiStatus === "limit" && r.body.analysis.remainingToday === 0 && sent().length === before && r.body.analysis.facts.length > 0, "after 30 in 24 hours: no more AI, the data stays");
ok(Number(await audits()) === 32, "the limit itself doesn't add requests");

await closeDb();
await browser.close();
console.log("AI API PASSED");
