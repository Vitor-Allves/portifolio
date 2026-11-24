// Server-only. The Painel (Fase 4, aprimorado na Fase 6): numbers of a
// period, compared with the period just before it, plus a snapshot of right
// now. Read-only — it only aggregates opportunities, tasks, contacts, the
// stage history, clients' contracts and campaigns.
//
// Dates are Brasília calendar days (fixed -03:00, like the rest of the CRM).
// Archived contacts are left out everywhere, as on the board. Filters:
// `ownerId` narrows every number to one person (Comercial always gets their
// own); origem and segmento apply to leads, opportunities and tasks; etapa
// applies to what is open now (funnel, open and stalled opportunities).
//
// Every indicator is defined once (a FROM … WHERE … over the records it
// counts): the number on the Painel and the list behind it ("clicar no
// indicador") come from the same definition, so they always match.

import { getDb } from "./db";
import { iso } from "./crm-core";
import { listCampaigns } from "./crm-campaigns";
import { CRM_STAGES, isCrmStage, type CrmDashboard, type CrmDashboardMetrics, type CrmDashboardRecord, type CrmTeamMember } from "./crm-types";

const TZ = "America/Sao_Paulo";
const DAY = 86_400_000;
/** Days in the same stage, without a message or a finished task, for an opportunity to count as "parada". */
export const STALLED_DAYS = 7;

/** "YYYY-MM-DD" ± n days. */
export function shiftDay(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}
const startOf = (day: string) => new Date(`${day}T00:00:00-03:00`);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY) + 1;
const n = (v: unknown) => Number(v ?? 0);

export function isDay(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

/** Painel filters. Empty = all. */
export type DashboardFilters = { ownerId: string | null; source?: string | null; segment?: string | null; stage?: string | null };

/** Parameter collector: `p(value)` → "$n". */
type B = { values: unknown[]; p: (v: unknown) => string };
function builder(): B {
  const values: unknown[] = [];
  return { values, p: (v) => (values.push(v), `$${values.length}`) };
}

const FROM_CONTACT = `crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id`;
const FROM_DEAL = `crm_deals d JOIN crm_contacts c ON c.id = d.contact_id LEFT JOIN crm_companies co ON co.id = c.company_id`;
const FROM_TASK = `crm_tasks t LEFT JOIN crm_contacts c ON c.id = t.contact_id LEFT JOIN crm_companies co ON co.id = COALESCE(c.company_id, t.company_id)`;

/** Origem / segmento conditions. Deals use their own origem (else the contact's). */
function dims(b: B, f: DashboardFilters, level: "contact" | "deal"): string {
  let out = "";
  if (f.source) out += ` AND ${level === "deal" ? "COALESCE(d.source, c.source)" : "c.source"} = ${b.p(f.source)}`;
  if (f.segment) out += ` AND COALESCE(co.segment, c.segment) = ${b.p(f.segment)}`;
  return out;
}
const ownerIs = (b: B, f: DashboardFilters, col: string) => (f.ownerId ? ` AND ${col} = ${b.p(f.ownerId)}` : "");
const stageIs = (b: B, f: DashboardFilters) => (f.stage && isCrmStage(f.stage) ? ` AND d.stage = ${b.p(f.stage)}` : "");

/** `FROM … WHERE …` of each indicator's records. */
const SETS = {
  /** Leads cadastrados no período. */
  leads: (b: B, f: DashboardFilters, from: Date, to: Date) =>
    `FROM ${FROM_CONTACT} WHERE c.archived_at IS NULL AND c.created_at >= ${b.p(from)} AND c.created_at < ${b.p(to)}${ownerIs(b, f, "c.owner_id")}${dims(b, f, "contact")}`,
  /** Oportunidades abertas no período. */
  deals: (b: B, f: DashboardFilters, from: Date, to: Date) =>
    `FROM ${FROM_DEAL} WHERE c.archived_at IS NULL AND d.created_at >= ${b.p(from)} AND d.created_at < ${b.p(to)}${ownerIs(b, f, "d.owner_id")}${dims(b, f, "deal")}`,
  /** Ganhas / perdidas no período. */
  closed: (stage: "ganho" | "perdido") => (b: B, f: DashboardFilters, from: Date, to: Date) =>
    `FROM ${FROM_DEAL} WHERE c.archived_at IS NULL AND d.stage = '${stage}' AND d.closed_at >= ${b.p(from)} AND d.closed_at < ${b.p(to)}${ownerIs(b, f, "d.owner_id")}${dims(b, f, "deal")}`,
  /** Tarefas concluídas no período. */
  tasksDone: (b: B, f: DashboardFilters, from: Date, to: Date) =>
    `FROM ${FROM_TASK} WHERE (t.contact_id IS NULL OR c.archived_at IS NULL) AND t.canceled_at IS NULL AND t.done_at >= ${b.p(from)} AND t.done_at < ${b.p(to)}${ownerIs(b, f, "t.owner_id")}${dims(b, f, "contact")}`,
  /** Abertas agora. */
  open: (b: B, f: DashboardFilters) =>
    `FROM ${FROM_DEAL} WHERE c.archived_at IS NULL AND d.stage NOT IN ('ganho', 'perdido')${ownerIs(b, f, "d.owner_id")}${dims(b, f, "deal")}${stageIs(b, f)}`,
  /** Paradas agora: abertas, na mesma etapa há STALLED_DAYS dias, sem mensagem nem tarefa concluída nesse tempo. */
  stalled: (b: B, f: DashboardFilters) =>
    `FROM ${FROM_DEAL} WHERE c.archived_at IS NULL AND d.stage NOT IN ('ganho', 'perdido')
       AND d.stage_changed_at < now() - make_interval(days => ${STALLED_DAYS})
       AND NOT EXISTS (SELECT 1 FROM crm_messages m WHERE m.contact_id = c.id AND m.created_at >= now() - make_interval(days => ${STALLED_DAYS}))
       AND NOT EXISTS (SELECT 1 FROM crm_tasks tt WHERE tt.contact_id = c.id AND tt.done_at >= now() - make_interval(days => ${STALLED_DAYS}))
       ${ownerIs(b, f, "d.owner_id")}${dims(b, f, "deal")}${stageIs(b, f)}`,
  /** Tarefas pendentes com data (atrasadas / de hoje decided by `when`). */
  pendingTasks: (when: "overdue" | "today") => (b: B, f: DashboardFilters) => {
    const day = `(t.due_at AT TIME ZONE '${TZ}')::date`;
    const today = `(now() AT TIME ZONE '${TZ}')::date`;
    const cond =
      when === "overdue"
        ? `(${day} < ${today} OR (${day} = ${today} AND NOT t.all_day AND t.due_at < now()))`
        : `(${day} = ${today} AND (t.all_day OR t.due_at >= now()))`;
    return `FROM ${FROM_TASK} WHERE (t.contact_id IS NULL OR c.archived_at IS NULL) AND t.done_at IS NULL AND t.canceled_at IS NULL AND t.due_at IS NOT NULL
      AND ${cond}${ownerIs(b, f, "t.owner_id")}${dims(b, f, "contact")}`;
  },
};

/** Opportunities that entered Reunião / Proposta in the period (or were opened straight in it). Legacy events without an opportunity count once per contact. */
function stageReached(b: B, f: DashboardFilters, from: Date, to: Date) {
  return `
    SELECT DISTINCT COALESCE(e.payload->>'dealId', 'c:' || e.contact_id) AS k, e.contact_id, e.payload->>'dealId' AS deal_id,
           CASE WHEN e.kind = 'stage' THEN e.payload->>'to' ELSE e.payload->>'stage' END AS stage
    FROM crm_events e
    JOIN crm_contacts c ON c.id = e.contact_id
    LEFT JOIN crm_companies co ON co.id = c.company_id
    LEFT JOIN crm_deals d ON d.id = e.payload->>'dealId'
    WHERE c.archived_at IS NULL AND e.created_at >= ${b.p(from)} AND e.created_at < ${b.p(to)}
      AND (e.kind = 'stage' OR (e.kind = 'deal' AND e.payload->>'action' = 'created'))
      ${f.ownerId ? ` AND COALESCE(d.owner_id, c.owner_id) = ${b.p(f.ownerId)}` : ""}${dims(b, f, "deal")}`;
}

async function metrics(from: string, to: string, f: DashboardFilters): Promise<CrmDashboardMetrics> {
  const db = await getDb();
  const s = startOf(from);
  const e = startOf(shiftDay(to, 1));
  const run = (make: (b: B) => string) => {
    const b = builder();
    const sql = make(b);
    return db.query(sql, b.values);
  };
  const [leads, deals, stages, won, lost, tasks] = await Promise.all([
    run((b) => `SELECT count(*) AS n ${SETS.leads(b, f, s, e)}`),
    run((b) => `SELECT count(*) AS n ${SETS.deals(b, f, s, e)}`),
    run(
      (b) => `SELECT count(DISTINCT x.k) FILTER (WHERE x.stage = 'reuniao') AS meetings, count(DISTINCT x.k) FILTER (WHERE x.stage = 'proposta') AS proposals
              FROM (${stageReached(b, f, s, e)}) x`
    ),
    run(
      (b) => `SELECT count(*) AS n,
                     -- a won opportunity is worth its negotiated value (else the estimate)
                     COALESCE(sum(COALESCE(d.negotiated_cents, d.value_cents)), 0) AS value,
                     count(COALESCE(d.negotiated_cents, d.value_cents)) AS valued,
                     avg(EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400) AS cycle
              ${SETS.closed("ganho")(b, f, s, e)}`
    ),
    run((b) => `SELECT count(*) AS n, COALESCE(sum(d.value_cents), 0) AS value ${SETS.closed("perdido")(b, f, s, e)}`),
    run((b) => `SELECT count(*) AS n ${SETS.tasksDone(b, f, s, e)}`),
  ]);
  const w = won.rows[0];
  const wonN = n(w.n);
  const lostN = n(lost.rows[0].n);
  return {
    newLeads: n(leads.rows[0].n),
    newDeals: n(deals.rows[0].n),
    meetings: n(stages.rows[0].meetings),
    proposals: n(stages.rows[0].proposals),
    wonCount: wonN,
    wonValueCents: n(w.value),
    lostCount: lostN,
    lostValueCents: n(lost.rows[0].value),
    conversion: wonN + lostN > 0 ? wonN / (wonN + lostN) : null,
    avgTicketCents: n(w.valued) > 0 ? Math.round(n(w.value) / n(w.valued)) : null,
    avgCycleDays: w.cycle === null ? null : Math.round(Number(w.cycle) * 10) / 10,
    tasksDone: n(tasks.rows[0].n),
  };
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Week (Monday) or month buckets covering [from, to]. */
function buckets(from: string, to: string): { bucket: "week" | "month"; starts: string[] } {
  if (daysBetween(from, to) > 92) {
    const starts: string[] = [];
    let d = `${from.slice(0, 7)}-01`;
    while (d <= to) {
      starts.push(d);
      const [y, m] = d.split("-").map(Number);
      d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
    return { bucket: "month", starts };
  }
  const dow = (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const starts: string[] = [];
  for (let d = shiftDay(from, -dow); d <= to; d = shiftDay(d, 7)) starts.push(d);
  return { bucket: "week", starts };
}

/** What the viewer may see beyond the commercial numbers. */
export type DashboardViewer = { seeContractValues: boolean; viewClients: boolean; seeCampaigns: boolean };
const SEE_ALL: DashboardViewer = { seeContractValues: true, viewClients: true, seeCampaigns: true };

/** Everything the Painel shows. `to` is inclusive. `filters` may be just the owner (null = everyone). */
export async function getDashboard(
  from: string,
  to: string,
  filtersOrOwner: DashboardFilters | string | null,
  team: CrmTeamMember[],
  viewer: DashboardViewer = SEE_ALL
): Promise<CrmDashboard> {
  const f: DashboardFilters = typeof filtersOrOwner === "object" && filtersOrOwner !== null ? filtersOrOwner : { ownerId: filtersOrOwner };
  const ownerId = f.ownerId;
  const span = daysBetween(from, to);
  const previousTo = shiftDay(from, -1);
  const previousFrom = shiftDay(previousTo, -(span - 1));
  const db = await getDb();
  const s = startOf(from);
  const e = startOf(shiftDay(to, 1));
  const { bucket, starts } = buckets(from, to);
  const run = <T extends Record<string, unknown>>(make: (b: B) => string) => {
    const b = builder();
    const sql = make(b);
    return db.query<T>(sql, b.values);
  };
  const sourceOptions = await db.query<{ id: string }>(`SELECT id FROM crm_options WHERE kind = 'source' ORDER BY sort, lower(label)`);

  const [current, previous, open, overdue, today, stalled, closedByStage, leadDays, wonDays, losses, sourceLeads, sourceWon, people, lastActivity, mrr, campaigns] =
    await Promise.all([
      metrics(from, to, f),
      metrics(previousFrom, previousTo, f),
      run<{ stage: string; count: string; value: string }>((b) => `SELECT d.stage, count(*) AS count, COALESCE(sum(d.value_cents), 0) AS value ${SETS.open(b, f)} GROUP BY d.stage`),
      run<{ n: string }>((b) => `SELECT count(*) AS n ${SETS.pendingTasks("overdue")(b, f)}`),
      run<{ n: string }>((b) => `SELECT count(*) AS n ${SETS.pendingTasks("today")(b, f)}`),
      run<{ n: string; value: string }>((b) => `SELECT count(*) AS n, COALESCE(sum(d.value_cents), 0) AS value ${SETS.stalled(b, f)}`),
      run<{ stage: string; count: string; value: string }>(
        (b) => `SELECT d.stage, count(*) AS count, COALESCE(sum(CASE WHEN d.stage = 'ganho' THEN COALESCE(d.negotiated_cents, d.value_cents) ELSE d.value_cents END), 0) AS value
                FROM ${FROM_DEAL}
                WHERE c.archived_at IS NULL AND d.stage IN ('ganho', 'perdido') AND d.closed_at >= ${b.p(s)} AND d.closed_at < ${b.p(e)}${ownerIs(b, f, "d.owner_id")}${dims(b, f, "deal")}${stageIs(b, f)}
                GROUP BY d.stage`
      ),
      run<{ day: string; count: string }>((b) => `SELECT to_char(c.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, count(*) AS count ${SETS.leads(b, f, s, e)} GROUP BY 1`),
      run<{ day: string; count: string }>((b) => `SELECT to_char(d.closed_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, count(*) AS count ${SETS.closed("ganho")(b, f, s, e)} GROUP BY 1`),
      run<{ reason: string | null; count: string; value: string }>(
        (b) => `SELECT d.lost_reason AS reason, count(*) AS count, COALESCE(sum(d.value_cents), 0) AS value ${SETS.closed("perdido")(b, f, s, e)} GROUP BY d.lost_reason`
      ),
      run<{ source: string; count: string }>((b) => `SELECT c.source, count(*) AS count ${SETS.leads(b, f, s, e)} GROUP BY c.source`),
      run<{ source: string; count: string; value: string }>(
        (b) => `SELECT COALESCE(d.source, c.source) AS source, count(*) AS count, COALESCE(sum(COALESCE(d.negotiated_cents, d.value_cents)), 0) AS value
                ${SETS.closed("ganho")(b, f, s, e)} GROUP BY 1`
      ),
      // Per person (deal/task owner; NULL = no owner).
      run<{
        owner_id: string | null;
        open_count: string;
        open_value: string;
        won: string;
        won_value: string;
        lost: string;
        tasks_done: string;
        tasks_overdue: string;
      }>((b) => {
        const ps = b.p(s);
        const pe = b.p(e);
        return `WITH d AS (
           SELECT d.* FROM ${FROM_DEAL} WHERE c.archived_at IS NULL${dims(b, f, "deal")}
         ), t AS (
           SELECT t.* FROM ${FROM_TASK} WHERE (t.contact_id IS NULL OR c.archived_at IS NULL) AND t.canceled_at IS NULL${dims(b, f, "contact")}
         ), owners AS (
           SELECT owner_id FROM d UNION SELECT owner_id FROM t
         )
         SELECT o.owner_id,
                (SELECT count(*) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage NOT IN ('ganho', 'perdido')) AS open_count,
                (SELECT COALESCE(sum(value_cents), 0) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage NOT IN ('ganho', 'perdido')) AS open_value,
                (SELECT count(*) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage = 'ganho' AND d.closed_at >= ${ps} AND d.closed_at < ${pe}) AS won,
                (SELECT COALESCE(sum(COALESCE(negotiated_cents, value_cents)), 0) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage = 'ganho' AND d.closed_at >= ${ps} AND d.closed_at < ${pe}) AS won_value,
                (SELECT count(*) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage = 'perdido' AND d.closed_at >= ${ps} AND d.closed_at < ${pe}) AS lost,
                (SELECT count(*) FROM t WHERE t.owner_id IS NOT DISTINCT FROM o.owner_id AND t.done_at >= ${ps} AND t.done_at < ${pe}) AS tasks_done,
                (SELECT count(*) FROM t WHERE t.owner_id IS NOT DISTINCT FROM o.owner_id AND t.done_at IS NULL AND t.due_at IS NOT NULL
                   AND ((t.due_at AT TIME ZONE '${TZ}')::date < (now() AT TIME ZONE '${TZ}')::date
                        OR (NOT t.all_day AND t.due_at < now() AND (t.due_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date))) AS tasks_overdue
         FROM owners o
         WHERE ${ownerId ? `o.owner_id = ${b.p(ownerId)}` : "true"}`;
      }),
      db.query<{ user_id: string; at: Date }>(
        `SELECT user_id, max(created_at) AS at FROM crm_events WHERE user_id IS NOT NULL AND ($1::text IS NULL OR user_id = $1) GROUP BY user_id`,
        [ownerId]
      ),
      viewer.viewClients
        ? run<{ n: string; value: string }>((b) => `SELECT count(*) AS n, COALESCE(sum(x.monthly), 0) AS value FROM (${mrrClients(b, f)}) x`)
        : Promise.resolve(null),
      viewer.seeCampaigns ? listCampaigns() : Promise.resolve(null),
    ]);

  const openBy = new Map(open.rows.map((r) => [r.stage, r]));
  const closedBy = new Map(closedByStage.rows.map((r) => [r.stage, r]));
  const funnel = CRM_STAGES.map((st) => {
    const r = (st.id === "ganho" || st.id === "perdido" ? closedBy : openBy).get(st.id);
    return { stage: st.id, count: n(r?.count), valueCents: n(r?.value) };
  });

  const bucketOf = (day: string) => {
    let idx = 0;
    for (let i = 0; i < starts.length; i++) if (starts[i] <= day) idx = i;
    return idx;
  };
  const series = starts.map((start) => ({
    start,
    label: bucket === "month" ? `${MONTHS[Number(start.slice(5, 7)) - 1]}/${start.slice(2, 4)}` : `${start.slice(8, 10)}/${start.slice(5, 7)}`,
    newLeads: 0,
    won: 0,
  }));
  for (const r of leadDays.rows) series[bucketOf(r.day)].newLeads += n(r.count);
  for (const r of wonDays.rows) series[bucketOf(r.day)].won += n(r.count);

  const lossReasons = losses.rows
    .map((r) => ({ reason: r.reason || "sem_motivo", count: n(r.count), valueCents: n(r.value) }))
    .sort((a, b) => b.count - a.count);

  const leadsBy = new Map(sourceLeads.rows.map((r) => [r.source, n(r.count)]));
  const wonBy = new Map(sourceWon.rows.map((r) => [r.source, r]));
  // In the Personalização order; a code no longer on the list still shows (old records keep it).
  const sourceOrder = new Map(sourceOptions.rows.map((r, i) => [r.id, i]));
  const sources = [...new Set([...leadsBy.keys(), ...wonBy.keys()])]
    .map((id) => ({ source: id, newLeads: leadsBy.get(id) ?? 0, won: n(wonBy.get(id)?.count), wonValueCents: n(wonBy.get(id)?.value) }))
    .filter((x) => x.newLeads > 0 || x.won > 0)
    .sort((a, b) => (sourceOrder.get(a.source) ?? 999) - (sourceOrder.get(b.source) ?? 999) || a.source.localeCompare(b.source));

  const peopleBy = new Map(people.rows.map((r) => [r.owner_id, r]));
  const lastBy = new Map(lastActivity.rows.map((r) => [r.user_id, iso(r.at)]));
  const members = ownerId ? team.filter((m) => m.id === ownerId) : team;
  const row = (ownerKey: string | null, name: string) => {
    const r = peopleBy.get(ownerKey);
    const wonN = n(r?.won);
    const lostN = n(r?.lost);
    return {
      ownerId: ownerKey,
      name,
      openCount: n(r?.open_count),
      openValueCents: n(r?.open_value),
      wonCount: wonN,
      wonValueCents: n(r?.won_value),
      lostCount: lostN,
      conversion: wonN + lostN > 0 ? wonN / (wonN + lostN) : null,
      tasksDone: n(r?.tasks_done),
      tasksOverdue: n(r?.tasks_overdue),
      lastActivityAt: ownerKey ? lastBy.get(ownerKey) ?? null : null,
    };
  };
  const teamRows = members.map((m) => row(m.id, m.name));
  // Unowned work shows as its own line, when there is any and nobody was picked.
  if (!ownerId && peopleBy.has(null)) {
    const unowned = row(null, "Sem responsável");
    if (unowned.openCount + unowned.wonCount + unowned.lostCount + unowned.tasksDone + unowned.tasksOverdue > 0) teamRows.push(unowned);
  }

  // Campaigns that started sending in the period (campaigns aren't per person, origem or segmento).
  const inPeriod = (campaigns ?? []).filter((c) => c.startedAt && c.startedAt >= s.toISOString() && c.startedAt < e.toISOString());
  const sum = (k: keyof (typeof inPeriod)[number]["counts"]) => inPeriod.reduce((acc, c) => acc + c.counts[k], 0);

  return {
    from,
    to,
    previousFrom,
    previousTo,
    current,
    previous,
    openNow: {
      count: open.rows.reduce((acc, r) => acc + n(r.count), 0),
      valueCents: open.rows.reduce((acc, r) => acc + n(r.value), 0),
    },
    tasksNow: { overdue: n(overdue.rows[0].n), today: n(today.rows[0].n) },
    stalledNow: { count: n(stalled.rows[0].n), valueCents: n(stalled.rows[0].value), days: STALLED_DAYS },
    recurring: mrr ? { clients: n(mrr.rows[0].n), monthlyCents: viewer.seeContractValues ? n(mrr.rows[0].value) : null } : null,
    campaigns: campaigns
      ? {
          count: inPeriod.length,
          sent: sum("sent"),
          delivered: sum("delivered"),
          read: sum("read"),
          replied: sum("replied"),
          interested: sum("interested"),
          newDeals: sum("newDeals"),
          optedOut: sum("optedOut"),
        }
      : null,
    funnel,
    bucket,
    series,
    lossReasons,
    sources,
    team: teamRows,
  };
}

/** Clients with vigente monthly contracts (receita recorrente contratada), with their monthly sum. Origem doesn't apply. */
function mrrClients(b: B, f: DashboardFilters): string {
  return `SELECT cl.id, cl.company_id, co.name, u.name AS owner_name, sum(k.value_cents) AS monthly
          FROM crm_clients cl JOIN crm_companies co ON co.id = cl.company_id
          JOIN crm_contracts k ON k.client_id = cl.id AND k.status = 'vigente' AND k.billing = 'mensal'
          LEFT JOIN internal_users u ON u.id = cl.owner_id
          WHERE cl.status <> 'encerrado'${f.ownerId ? ` AND cl.owner_id = ${b.p(f.ownerId)}` : ""}${f.segment ? ` AND co.segment = ${b.p(f.segment)}` : ""}
          GROUP BY cl.id, cl.company_id, co.name, u.name`;
}

// ---------- "clicar no indicador": the records behind each number ----------

export const DASHBOARD_METRICS = [
  "leads",
  "deals",
  "meetings",
  "proposals",
  "won",
  "lost",
  "tasksDone",
  "open",
  "stalled",
  "overdue",
  "today",
  "recurring",
  "campaigns",
] as const;
export type DashboardMetric = (typeof DASHBOARD_METRICS)[number];
export function isDashboardMetric(v: unknown): v is DashboardMetric {
  return DASHBOARD_METRICS.includes(v as DashboardMetric);
}

/** Most records one list returns (the count on the Painel is always the full one). */
export const RECORDS_LIMIT = 500;

const DEAL_COLS = `d.id, d.title, d.stage, d.contact_id, c.name AS contact_name, co.name AS company_name, u.name AS owner_name,
  CASE WHEN d.stage = 'ganho' THEN COALESCE(d.negotiated_cents, d.value_cents) ELSE d.value_cents END AS value_cents`;
const DEAL_JOIN_OWNER = `LEFT JOIN internal_users u ON u.id = d.owner_id`;

type RecordRow = {
  id: string;
  contact_id: string | null;
  company_id?: string | null;
  title: string;
  detail: string | null;
  owner_name: string | null;
  value_cents: string | null;
  at: Date | string | null;
};

/** Adds a join to an indicator's "FROM … WHERE …" (right before its first WHERE). */
const withOwner = (fromWhere: string, join: string) => {
  const i = fromWhere.indexOf(" WHERE ");
  return `${fromWhere.slice(0, i)} ${join}${fromWhere.slice(i)}`;
};

/**
 * The records behind one Painel number, with the same filters (Comercial:
 * only their own). Each row opens the contact (or the client / campaign).
 */
export async function listDashboardRecords(
  metric: DashboardMetric,
  from: string,
  to: string,
  f: DashboardFilters,
  viewer: DashboardViewer = SEE_ALL
): Promise<{ metric: DashboardMetric; kind: CrmDashboardRecord["kind"]; total: number; rows: CrmDashboardRecord[] }> {
  const db = await getDb();
  const s = startOf(from);
  const e = startOf(shiftDay(to, 1));
  const b = builder();
  let kind: CrmDashboardRecord["kind"] = "deal";
  let sql: string;
  let order: string;
  switch (metric) {
    case "leads":
      kind = "contact";
      sql = `SELECT c.id, c.id AS contact_id, c.name AS title, COALESCE(co.name, c.company) AS detail, u.name AS owner_name, NULL::bigint AS value_cents, c.created_at AS at
             ${withOwner(SETS.leads(b, f, s, e), "LEFT JOIN internal_users u ON u.id = c.owner_id")}`;
      order = "at DESC, id";
      break;
    case "deals":
      sql = `SELECT ${DEAL_COLS}, d.created_at AS at ${withOwner(SETS.deals(b, f, s, e), DEAL_JOIN_OWNER)}`;
      order = "at DESC, id";
      break;
    case "won":
    case "lost":
      sql = `SELECT ${DEAL_COLS}, d.closed_at AS at ${withOwner(SETS.closed(metric === "won" ? "ganho" : "perdido")(b, f, s, e), DEAL_JOIN_OWNER)}`;
      order = "at DESC, id";
      break;
    case "open":
      sql = `SELECT ${DEAL_COLS}, d.stage_changed_at AS at ${withOwner(SETS.open(b, f), DEAL_JOIN_OWNER)}`;
      order = "at, id";
      break;
    case "stalled":
      sql = `SELECT ${DEAL_COLS}, d.stage_changed_at AS at ${withOwner(SETS.stalled(b, f), DEAL_JOIN_OWNER)}`;
      order = "at, id";
      break;
    case "meetings":
    case "proposals": {
      // One row per key: the opportunity, or (legacy, before opportunities) the contact.
      const stage = metric === "meetings" ? "reuniao" : "proposta";
      sql = `SELECT DISTINCT ON (x.k) COALESCE(x.deal_id, x.contact_id) AS id, x.contact_id, COALESCE(dd.title, cc.name) AS title, dd.stage,
                    cc.name AS contact_name, NULL::text AS company_name, uu.name AS owner_name,
                    dd.value_cents, ev.at
             FROM (${stageReached(b, f, s, e)}) x
             JOIN crm_contacts cc ON cc.id = x.contact_id
             LEFT JOIN crm_deals dd ON dd.id = x.deal_id
             LEFT JOIN internal_users uu ON uu.id = COALESCE(dd.owner_id, cc.owner_id)
             LEFT JOIN LATERAL (SELECT max(e2.created_at) AS at FROM crm_events e2 WHERE e2.contact_id = x.contact_id
                                  AND COALESCE(e2.payload->>'dealId', '') = COALESCE(x.deal_id, '')) ev ON true
             WHERE x.stage = '${stage}'`;
      sql = `SELECT * FROM (${sql}) y`;
      order = "at DESC NULLS LAST, id";
      break;
    }
    case "tasksDone":
    case "overdue":
    case "today": {
      kind = "task";
      const base = metric === "tasksDone" ? SETS.tasksDone(b, f, s, e) : SETS.pendingTasks(metric)(b, f);
      sql = `SELECT t.id, t.contact_id, t.company_id, t.title, COALESCE(c.name, co.name) AS detail, u.name AS owner_name, NULL::bigint AS value_cents,
                    ${metric === "tasksDone" ? "t.done_at" : "t.due_at"} AS at
             ${withOwner(base, "LEFT JOIN internal_users u ON u.id = t.owner_id")}`;
      order = metric === "tasksDone" ? "at DESC, id" : "at, id";
      break;
    }
    case "recurring":
      kind = "client";
      if (!viewer.viewClients) return { metric, kind, total: 0, rows: [] };
      sql = `SELECT x.id, NULL::text AS contact_id, x.company_id, x.name AS title, NULL::text AS detail, x.owner_name,
                    ${viewer.seeContractValues ? "x.monthly" : "NULL::bigint"} AS value_cents, NULL::timestamptz AS at
             FROM (${mrrClients(b, f)}) x`;
      order = "lower(title), id";
      break;
    case "campaigns": {
      kind = "campaign";
      if (!viewer.seeCampaigns) return { metric, kind, total: 0, rows: [] };
      const all = (await listCampaigns()).filter((c) => c.startedAt && c.startedAt >= s.toISOString() && c.startedAt < e.toISOString());
      return {
        metric,
        kind,
        total: all.length,
        rows: all.slice(0, RECORDS_LIMIT).map((c) => ({
          kind: "campaign",
          id: c.id,
          contactId: null,
          companyId: null,
          title: c.name,
          detail: `${c.counts.sent} enviadas · ${c.counts.read} lidas · ${c.counts.replied} responderam · ${c.counts.interested} interessados · ${c.counts.newDeals} oportunidades`,
          ownerName: c.startedByName,
          stage: null,
          valueCents: null,
          at: c.startedAt,
        })),
      };
    }
  }
  const [rows, total] = await Promise.all([
    db.query<RecordRow & { stage?: string; contact_name?: string; company_name?: string | null }>(`SELECT * FROM (${sql}) r ORDER BY ${order} LIMIT ${RECORDS_LIMIT}`, b.values),
    db.query<{ n: string }>(`SELECT count(*) AS n FROM (${sql}) r`, b.values),
  ]);
  return {
    metric,
    kind,
    total: n(total.rows[0].n),
    rows: rows.rows.map((r) => ({
      kind,
      id: r.id,
      contactId: r.contact_id,
      companyId: r.company_id ?? null,
      title: r.title,
      detail: kind === "deal" ? [r.contact_name, r.company_name].filter(Boolean).join(" · ") || null : r.detail,
      ownerName: r.owner_name,
      stage: kind === "deal" && r.stage && isCrmStage(r.stage) ? r.stage : null,
      valueCents: r.value_cents === null || r.value_cents === undefined ? null : Number(r.value_cents),
      at: r.at ? iso(r.at) : null,
    })),
  };
}

// ---------- request parameters (shared by the Painel routes) ----------

type ParamSession = { userId: string; caps: { seeAllLeads: boolean; viewClients: boolean; seeContractValues: boolean; editCampaigns: boolean } };

/**
 * ?from&to (Brasília, inclusive, up to a year)&owner=all|<id>&source&segment&stage.
 * A Comercial always gets only their own numbers. Returns an error message
 * instead when the period is invalid.
 */
export function dashboardParams(
  p: URLSearchParams,
  s: ParamSession
): { from: string; to: string; filters: DashboardFilters; viewer: DashboardViewer } | { error: string } {
  const from = p.get("from");
  const to = p.get("to");
  if (!isDay(from) || !isDay(to) || from > to) return { error: "Período inválido." };
  if (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`) > 366 * DAY) return { error: "Escolha um período de até um ano." };
  const asked = p.get("owner");
  const ownerId = !s.caps.seeAllLeads ? s.userId : asked && asked !== "all" ? asked : null;
  const clean = (v: string | null) => (v && v !== "all" ? v.slice(0, 200) : null);
  return {
    from,
    to,
    filters: { ownerId, source: clean(p.get("source")), segment: clean(p.get("segment")), stage: clean(p.get("stage")) },
    viewer: { viewClients: s.caps.viewClients, seeContractValues: s.caps.viewClients && s.caps.seeContractValues, seeCampaigns: s.caps.editCampaigns },
  };
}
