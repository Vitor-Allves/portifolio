// Fase 6 · entrega 2 through the API, on base + campaign fixtures: monthly
// goals per person and for the team (only Administrador / Gestor set them,
// every change audited), what was achieved counted exactly like the Painel,
// each person's productivity in a period (tasks, conversations, response
// time), CSV export, and a Comercial only ever seeing their own line.
import { BASE, closeDb, launchBrowser, login, ok, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const { api: vitor } = await login(browser, "vitor", { open: false }); // Gestor
const { api: joao } = await login(browser, "joao", { open: false }); // Comercial
const { api: maria } = await login(browser, "maria", { open: false }); // Marketing

const OCT = "2026-10";
const goals = async (api, month = OCT) => json(await api.get(`${BASE}/api/crm/goals/?month=${month}`));
const put = async (api, body) => json(await api.put(`${BASE}/api/crm/goals/`, { data: body }));
const line = (g, name) => g.rows.find((r) => r.name === name);

// ---- achieved = the Painel's numbers ----
let g = (await goals(vitor)).body.goals;
const dash = (await json(await vitor.get(`${BASE}/api/crm/dashboard/?from=2026-10-01&to=2026-10-31`))).body.dashboard;
ok(g.month === OCT && g.elapsed === 1 && g.rows[0].userId === null && g.rows[0].name === "Equipe", "October: a past month, the team line first");
ok(g.rows.slice(1).map((r) => r.name).join() === "Beatriz Admin,João,Maria Marketing,Vitor", `…then each person (${g.rows.map((r) => r.name).join()})`);
const team = line(g, "Equipe").actual;
ok(
  team.leads === dash.current.newLeads && team.meetings === dash.current.meetings && team.proposals === dash.current.proposals && team.won === dash.current.wonCount && team.wonValue === dash.current.wonValueCents,
  `the team achieved exactly the Painel's October (${JSON.stringify(team)})`
);
ok(JSON.stringify(line(g, "Vitor").actual) === JSON.stringify({ leads: 1, meetings: 1, proposals: 0, won: 1, wonValue: 500000 }), `Vitor: 1 lead, 1 reunião, 1 ganho de R$ 5.000 (${JSON.stringify(line(g, "Vitor").actual)})`);
ok(JSON.stringify(line(g, "João").actual) === JSON.stringify({ leads: 2, meetings: 1, proposals: 2, won: 0, wonValue: 0 }), "João: 2 leads, 1 reunião, 2 propostas");
ok(g.rows.every((r) => Object.keys(r.targets).length === 0) && g.updatedAt === null, "no goals yet");

// ---- setting goals ----
let r = await put(vitor, {
  month: OCT,
  goals: [
    { userId: null, metric: "leads", target: "10" },
    { userId: null, metric: "won", target: 2 },
    { userId: null, metric: "wonValue", target: "20.000" },
    { userId: "u-joao", metric: "leads", target: "5" },
    { userId: "u-joao", metric: "proposals", target: "2" },
    { userId: "u-vitor", metric: "meetings", target: "3" },
  ],
});
ok(r.status === 200, `the Gestor sets October's goals (${r.status} ${JSON.stringify(r.body?.error ?? "")})`);
g = r.body.goals;
ok(JSON.stringify(line(g, "Equipe").targets) === JSON.stringify({ leads: 10, won: 2, wonValue: 2000000 }), `team: 10 leads, 2 ganhos, R$ 20.000 (${JSON.stringify(line(g, "Equipe").targets)})`);
ok(line(g, "João").targets.leads === 5 && line(g, "João").targets.proposals === 2 && line(g, "Vitor").targets.meetings === 3, "per person");
ok(g.updatedByName === "Vitor" && g.updatedAt, "who changed them last");
const audits = () => sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.goals_change'`);
ok((await audits()) === "1" && (await sql(`SELECT metadata->>'changed' FROM audit_log WHERE action = 'crm.goals_change'`)) === "6", "one audit entry, 6 goals changed");
r = await put(vitor, { month: OCT, goals: [{ userId: null, metric: "leads", target: "10" }] });
ok(r.status === 200 && (await audits()) === "1", "saving the same value changes nothing (no audit entry)");
r = await put(vitor, { month: OCT, goals: [{ userId: "u-joao", metric: "leads", target: "" }, { userId: "u-vitor", metric: "meetings", target: 0 }] });
ok(r.status === 200 && line(r.body.goals, "João").targets.leads === undefined && line(r.body.goals, "Vitor").targets.meetings === undefined, "blank or 0 removes a goal");
ok((await audits()) === "2", "…audited");
ok((await goals(vitor, "2026-11")).body.goals.rows.every((x) => Object.keys(x.targets).length === 0), "November has its own goals (none)");

// ---- invalid ----
for (const [body, why] of [
  [{ month: "2026-13", goals: [] }, "month"],
  [{ month: OCT, goals: [{ userId: null, metric: "nope", target: 1 }] }, "indicator"],
  [{ month: OCT, goals: [{ userId: null, metric: "leads", target: "abc" }] }, "count"],
  [{ month: OCT, goals: [{ userId: null, metric: "leads", target: -1 }] }, "negative"],
  [{ month: OCT, goals: [{ userId: null, metric: "leads", target: 2.5 }] }, "fraction"],
  [{ month: OCT, goals: [{ userId: null, metric: "wonValue", target: "muito" }] }, "value"],
  [{ month: OCT, goals: [{ userId: "u-nobody", metric: "leads", target: 1 }] }, "person"],
]) {
  r = await put(vitor, body);
  ok(r.status === 400 && r.body.error, `refused: ${why} (${r.body?.error})`);
}
ok((await goals(vitor, "2026-1")).status === 400, "GET with an invalid month refused");

// ---- who sets, who sees ----
r = await put(joao, { month: OCT, goals: [{ userId: "u-joao", metric: "leads", target: 99 }] });
ok(r.status === 403 && r.body.error === "Só Administrador e Gestor definem as metas.", "a Comercial can't set goals");
ok((await put(maria, { month: OCT, goals: [] })).status === 403, "nor Marketing");
g = (await goals(joao)).body.goals;
ok(g.rows.length === 1 && g.rows[0].name === "João" && g.rows[0].targets.proposals === 2 && g.rows[0].actual.proposals === 2, "João sees only his own line (proposals 2 of 2)");
ok((await goals(maria)).body.goals.rows.length === 5, "Marketing sees the team");
await sql(`UPDATE internal_users SET crm_permissions = '{"manageGoals": true}'::jsonb WHERE id = 'u-joao'`);
ok((await put(joao, { month: OCT, goals: [{ userId: "u-joao", metric: "won", target: 1 }] })).status === 200, "…unless given the permission");
await sql(`UPDATE internal_users SET crm_permissions = '{}'::jsonb WHERE id = 'u-joao'`);

// ---- productivity ----
// WhatsApp: Ana (Vitor's) waited 30 min, Bruno (João's) 2 h; a campaign message and an archived contact don't count.
await sql(`INSERT INTO crm_campaigns (id, name, status) VALUES ('k-prod', 'Outubro', 'concluida')`);
await sql(
  `INSERT INTO crm_messages (id, contact_id, direction, type, body, sent_by, created_at, campaign_id) VALUES
   ('p1', 'c1', 'in', 'text', 'Oi', NULL, '2026-10-10T10:00:00-03:00', NULL),
   ('p2', 'c1', 'out', 'text', 'Olá!', 'u-vitor', '2026-10-10T10:30:00-03:00', NULL),
   ('p3', 'c1', 'out', 'text', 'Segue', 'u-vitor', '2026-10-10T10:31:00-03:00', NULL),
   ('p4', 'c2', 'in', 'text', 'Bom dia', NULL, '2026-10-11T09:00:00-03:00', NULL),
   ('p5', 'c2', 'out', 'text', 'Bom dia!', 'u-joao', '2026-10-11T11:00:00-03:00', NULL),
   ('p6', 'c3', 'out', 'template', 'Oferta', 'u-joao', '2026-10-12T09:00:00-03:00', 'k-prod'),
   ('p7', 'c6', 'out', 'text', 'Arquivado', 'u-vitor', '2026-10-12T09:00:00-03:00', NULL)`
);
const prod = async (api, q = "from=2026-10-01&to=2026-10-31") => json(await api.get(`${BASE}/api/crm/productivity/?${q}`));
let p = (await prod(vitor)).body.productivity;
const pv = p.rows.find((x) => x.name === "Vitor");
const pj = p.rows.find((x) => x.name === "João");
ok(pv.leads === 1 && pv.meetings === 1 && pv.wonCount === 1 && pv.wonValueCents === 500000 && pv.tasksDone === 1 && pv.conversion === 1, `Vitor's October (${JSON.stringify(pv)})`);
ok(pj.leads === 2 && pj.proposals === 2 && pj.lostCount === 1 && pj.conversion === 0 && pj.tasksDone === 1 && pj.tasksOverdue === 1, "João's October: 1 lost, a task done, one overdue");
ok(pv.conversations === 1 && pv.messagesSent === 2 && pv.answered === 1 && pv.avgResponseMinutes === 30, `Vitor answered Ana in 30 min (archived contact left out) (${pv.conversations}/${pv.messagesSent}/${pv.avgResponseMinutes})`);
ok(pj.conversations === 1 && pj.answered === 1 && pj.avgResponseMinutes === 120, "João answered Bruno in 2 h; the campaign message doesn't count");
ok(pv.lastActivityAt && pj.lastActivityAt, "last activity");
const unowned = p.rows.find((x) => x.userId === null);
ok(unowned && unowned.name === "Sem responsável" && unowned.leads === 1, "Eva's lead, without a responsible person, has its own line");
ok(
  p.team.leads === dash.current.newLeads && p.team.tasksDone === dash.current.tasksDone && p.team.wonCount === dash.current.wonCount && p.team.answered === 2 && p.team.avgResponseMinutes === 75,
  `team totals = the Painel's; 2 answered, 75 min on average (${JSON.stringify(p.team)})`
);
// Evolução v1.0 (item 12): the individual indicators.
ok(p.team.worked === dash.current.workedLeads && p.team.proposalsApproved === dash.current.proposalsApproved, "leads trabalhados and approved proposals add up to the Painel's");
ok(
  p.rows.reduce((acc, r) => acc + r.assigned, 0) === Number(await sql(`SELECT count(*) FROM crm_contacts WHERE archived_at IS NULL`)),
  "every lead is assigned to one line (a person or Sem responsável)"
);
ok(pv.avgTicketCents === 500000 && pj.avgTicketCents === null && pj.followUps === 0, "ticket médio per person; no follow-ups done");
p = (await prod(joao)).body.productivity;
ok(p.rows.length === 1 && p.rows[0].name === "João" && p.team === null, "a Comercial sees only their own productivity");
ok((await prod(vitor, "from=2026-10-31&to=2026-10-01")).status === 400 && (await prod(vitor, "from=2025-01-01&to=2026-10-31")).status === 400, "invalid or too long period refused");

// ---- export ----
let res = await vitor.get(`${BASE}/api/crm/goals/export/?month=${OCT}`);
let text = await res.text();
ok(res.status() === 200 && /text\/csv/.test(res.headers()["content-type"]) && text.includes("Metas de Outubro de 2026"), "the goals as CSV");
ok(text.includes(`Equipe;10;4;40%;;2;;;2;;2;1;50%;"20000,00";"5000,00";25%`), `…goal, achieved and % per indicator (${text.split("\n").find((l) => l.startsWith("Equipe"))})`);
res = await vitor.get(`${BASE}/api/crm/productivity/export/?from=2026-10-01&to=2026-10-31`);
text = await res.text();
ok(res.status() === 200 && text.includes("Produtividade;01/10/2026 a 31/10/2026") && text.includes(`Vitor;1;1;0;1;"5000,00";0;100%;1;0;1;1;30;`), `productivity as CSV (${text.split("\n").find((l) => l.startsWith("Vitor"))})`);
ok(text.includes("Equipe;4;"), "…with the team totals");
ok((await joao.get(`${BASE}/api/crm/productivity/export/?from=2026-10-01&to=2026-10-31`)).status() === 403 && (await joao.get(`${BASE}/api/crm/goals/export/?month=${OCT}`)).status() === 403, "a Comercial can't export");
ok((await sql(`SELECT count(*) FROM audit_log WHERE action = 'crm.report_export'`)) === "2", "every export is in the audit trail");

await closeDb();
await browser.close();
console.log("GOALS API PASSED");
