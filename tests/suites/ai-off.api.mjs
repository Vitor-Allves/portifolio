// Fase 7 · entrega 2 through the API, with NO AI key on the server: every
// analysis still answers with the CRM's data and the system's calculations
// (what the person can see), says the AI isn't configured, and never calls
// anything — the CRM works the same without the AI.
import fs from "node:fs";
import path from "node:path";
import { BASE, FAKE_GRAPH_DIR, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: vitor } = await login(browser, "vitor", { open: false });
const { api: joao } = await login(browser, "joao", { open: false });
const analysis = async (api, data) => json(await api.post(`${BASE}/api/crm/ai/analysis/`, { data }));

let r = await analysis(vitor, { kind: "lead", contactId: "c1", generate: true });
ok(r.status === 200, `lead analysis without AI (${r.status} ${r.body?.error ?? ""})`);
const a = r.body.analysis;
ok(a.aiStatus === "not_configured" && a.ai === null && /não está configurada/.test(a.aiMessage), "says the AI isn't configured");
const contact = a.facts.find((f) => f.title === "Contato").items;
ok(contact.find((i) => i.label === "Nome").value === "Ana Ribeiro" && a.calculations.some((c) => c.label === "Dias na etapa atual"), "…and still gives the data and the calculations");
ok(!JSON.stringify(a).includes("5515990000001"), "no phone in the analysis");
ok(!fs.existsSync(path.join(FAKE_GRAPH_DIR, "ai.jsonl")), "nothing was sent anywhere");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.ai_request'`)) === "0", "no AI request in the audit trail");

r = await analysis(vitor, { kind: "dashboard", from: "2026-10-01", to: "2026-10-31" });
ok(r.status === 200 && r.body.analysis.facts[0].items.find((i) => i.label === "Leads cadastrados").value === "4 (antes: 1)", "the Painel's summary uses the Painel's numbers");
r = await analysis(joao, { kind: "dashboard", from: "2026-10-01", to: "2026-10-31", owner: "u-vitor" });
ok(r.body.analysis.subtitle.includes("João") && r.body.analysis.facts.find((f) => f.title === "Por pessoa").items.map((i) => i.label).join() === "João", "a Comercial's summary is only his own");
ok((await analysis(joao, { kind: "lead", contactId: "c1" })).status === 404, "a Comercial can't summarize someone else's lead");
ok((await analysis(vitor, { kind: "nope" })).status === 400 && (await analysis(vitor, { kind: "client", clientId: "x", month: "2026-13" })).status === 400, "invalid requests refused");

await closeDb();
await browser.close();
console.log("AI OFF API PASSED");
