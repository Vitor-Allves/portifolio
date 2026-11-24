// Painel numbers (Fase 4) on the base fixture: October 2026 and its
// previous period, every figure checked by hand.
import assert from "node:assert/strict";
import { getDashboard } from "../../src/lib/crm-dashboard";
import { listTeam } from "../../src/lib/crm";

(async () => {
  const team = await listTeam();
  const d = await getDashboard("2026-10-01", "2026-10-31", null, team);
  assert.equal(d.previousFrom, "2026-08-31"); assert.equal(d.previousTo, "2026-09-30");
  assert.deepEqual(d.current, { newLeads: 4, newDeals: 5, meetings: 2, proposals: 2, wonCount: 1, wonValueCents: 500000, lostCount: 1, lostValueCents: 200000, conversion: 0.5, avgTicketCents: 500000, avgCycleDays: 10, tasksDone: 2 });
  console.log("ok — current period (archived contact, canceled task and events outside the month left out)");
  assert.deepEqual(d.previous, { newLeads: 1, newDeals: 1, meetings: 1, proposals: 0, wonCount: 1, wonValueCents: 0, lostCount: 0, lostValueCents: 0, conversion: 1, avgTicketCents: null, avgCycleDays: 10, tasksDone: 1 });
  console.log("ok — previous period (legacy stage event without opportunity counts once; won without value → no ticket)");
  assert.deepEqual(d.openNow, { count: 3, valueCents: 400000 });
  assert.deepEqual(d.tasksNow, { overdue: 1, today: 1 });
  console.log("ok — right now: 3 open (R$ 4.000), 1 overdue task, 1 today");
  assert.deepEqual(d.funnel.map((f: { stage: string; count: number; valueCents: number }) => [f.stage, f.count, f.valueCents]), [
    ["novo", 1, 0], ["conversa", 0, 0], ["reuniao", 1, 100000], ["diagnostico", 0, 0], ["elaboracao", 0, 0], ["proposta", 1, 300000],
    ["negociacao", 0, 0], ["aprovacao", 0, 0], ["ganho", 1, 500000], ["perdido", 1, 200000],
  ]);
  console.log("ok — funnel (the ten stages of Personalização, in order)");
  assert.equal(d.bucket, "week");
  assert.deepEqual(d.series.map((s: { start: string; newLeads: number; won: number }) => [s.start, s.newLeads, s.won]), [
    ["2026-09-28", 1, 0], ["2026-10-05", 1, 0], ["2026-10-12", 0, 1], ["2026-10-19", 2, 0], ["2026-10-26", 0, 0],
  ]);
  console.log("ok — weekly series (Monday weeks, Brasília days)");
  assert.deepEqual(d.lossReasons, [{ reason: "concorrente", count: 1, valueCents: 200000 }]);
  assert.deepEqual(d.sources.map((s: { source: string; newLeads: number; won: number; wonValueCents: number }) => [s.source, s.newLeads, s.won, s.wonValueCents]), [
    ["anuncio", 1, 0, 0], ["bni", 1, 0, 0], ["site", 1, 0, 0], ["indicacao", 1, 1, 500000],
  ]);
  console.log("ok — loss reasons and sources");
  const row = (name: string) => d.team.find((r: { name: string }) => r.name === name)!;
  assert.deepEqual(
    [row("Vitor").openCount, row("Vitor").openValueCents, row("Vitor").wonCount, row("Vitor").wonValueCents, row("Vitor").lostCount, row("Vitor").conversion, row("Vitor").tasksDone, row("Vitor").tasksOverdue],
    [1, 100000, 1, 500000, 0, 1, 1, 0]
  );
  assert.deepEqual(
    [row("João").openCount, row("João").openValueCents, row("João").wonCount, row("João").lostCount, row("João").conversion, row("João").tasksDone, row("João").tasksOverdue],
    [1, 300000, 0, 1, 0, 1, 1]
  );
  assert.equal(row("Beatriz Admin").openCount, 0);
  assert.equal(row("Sem responsável").openCount, 1);
  assert.ok(row("Vitor").lastActivityAt);
  console.log("ok — per person, with the unowned line");
  const j = await getDashboard("2026-10-01", "2026-10-31", "u-joao", team);
  assert.deepEqual([j.current.newLeads, j.current.newDeals, j.current.meetings, j.current.proposals, j.current.wonCount, j.current.lostCount, j.current.conversion, j.current.tasksDone], [2, 2, 1, 2, 0, 1, 0, 1]);
  assert.deepEqual(j.team.map((r: { name: string }) => r.name), ["João"]);
  assert.deepEqual(j.openNow, { count: 1, valueCents: 300000 });
  console.log("ok — one person's numbers");
  const y = await getDashboard("2026-01-01", "2026-12-31", null, team);
  assert.equal(y.bucket, "month"); assert.equal(y.series.length, 12); assert.equal(y.series[9].newLeads, 4); assert.equal(y.series[8].won, 1);
  console.log("ok — a year in monthly buckets");
  console.log("DASHBOARD DATA PASSED");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
