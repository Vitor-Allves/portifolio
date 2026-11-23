// Server-only. The Painel (Fase 4): numbers of a period, compared with the
// period just before it, plus a snapshot of right now. Read-only — it only
// aggregates opportunities, tasks, contacts and the stage history.
//
// Dates are Brasília calendar days (fixed -03:00, like the rest of the CRM).
// Archived contacts are left out everywhere, as on the board. `ownerId`
// narrows every number to one person (Comercial always gets their own).

import { getDb } from "./db";
import { iso } from "./crm-core";
import {
  CRM_STAGES,
  type CrmDashboard,
  type CrmDashboardMetrics,
  type CrmTeamMember,
} from "./crm-types";

const TZ = "America/Sao_Paulo";
const DAY = 86_400_000;

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

async function metrics(from: string, to: string, ownerId: string | null): Promise<CrmDashboardMetrics> {
  const db = await getDb();
  const args = [startOf(from), startOf(shiftDay(to, 1)), ownerId];
  const [leads, deals, stages, closed, tasks] = await Promise.all([
    db.query(
      `SELECT count(*) AS n FROM crm_contacts c
       WHERE c.archived_at IS NULL AND c.created_at >= $1 AND c.created_at < $2 AND ($3::text IS NULL OR c.owner_id = $3)`,
      args
    ),
    db.query(
      `SELECT count(*) AS n FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
       WHERE c.archived_at IS NULL AND d.created_at >= $1 AND d.created_at < $2 AND ($3::text IS NULL OR d.owner_id = $3)`,
      args
    ),
    // An opportunity "reached" a stage when it moved there, or was opened
    // straight in it. Events from before opportunities existed have no
    // dealId and count once per contact.
    db.query(
      `SELECT count(DISTINCT x.k) FILTER (WHERE x.stage = 'reuniao') AS meetings,
              count(DISTINCT x.k) FILTER (WHERE x.stage = 'proposta') AS proposals
       FROM (
         SELECT COALESCE(e.payload->>'dealId', 'c:' || e.contact_id) AS k,
                CASE WHEN e.kind = 'stage' THEN e.payload->>'to' ELSE e.payload->>'stage' END AS stage
         FROM crm_events e
         JOIN crm_contacts c ON c.id = e.contact_id
         LEFT JOIN crm_deals d ON d.id = e.payload->>'dealId'
         WHERE c.archived_at IS NULL AND e.created_at >= $1 AND e.created_at < $2
           AND (e.kind = 'stage' OR (e.kind = 'deal' AND e.payload->>'action' = 'created'))
           AND ($3::text IS NULL OR COALESCE(d.owner_id, c.owner_id) = $3)
       ) x`,
      args
    ),
    db.query(
      `SELECT count(*) FILTER (WHERE d.stage = 'ganho') AS won,
              COALESCE(sum(d.value_cents) FILTER (WHERE d.stage = 'ganho'), 0) AS won_value,
              count(d.value_cents) FILTER (WHERE d.stage = 'ganho') AS won_valued,
              count(*) FILTER (WHERE d.stage = 'perdido') AS lost,
              COALESCE(sum(d.value_cents) FILTER (WHERE d.stage = 'perdido'), 0) AS lost_value,
              avg(EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400) FILTER (WHERE d.stage = 'ganho') AS cycle
       FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
       WHERE c.archived_at IS NULL AND d.stage IN ('ganho', 'perdido') AND d.closed_at >= $1 AND d.closed_at < $2
         AND ($3::text IS NULL OR d.owner_id = $3)`,
      args
    ),
    db.query(
      `SELECT count(*) AS n FROM crm_tasks t JOIN crm_contacts c ON c.id = t.contact_id
       WHERE c.archived_at IS NULL AND t.canceled_at IS NULL AND t.done_at >= $1 AND t.done_at < $2
         AND ($3::text IS NULL OR t.owner_id = $3)`,
      args
    ),
  ]);
  const c = closed.rows[0];
  const won = n(c.won);
  const lost = n(c.lost);
  return {
    newLeads: n(leads.rows[0].n),
    newDeals: n(deals.rows[0].n),
    meetings: n(stages.rows[0].meetings),
    proposals: n(stages.rows[0].proposals),
    wonCount: won,
    wonValueCents: n(c.won_value),
    lostCount: lost,
    lostValueCents: n(c.lost_value),
    conversion: won + lost > 0 ? won / (won + lost) : null,
    avgTicketCents: n(c.won_valued) > 0 ? Math.round(n(c.won_value) / n(c.won_valued)) : null,
    avgCycleDays: c.cycle === null ? null : Math.round(Number(c.cycle) * 10) / 10,
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

/** Everything the Painel shows. `to` is inclusive. */
export async function getDashboard(from: string, to: string, ownerId: string | null, team: CrmTeamMember[]): Promise<CrmDashboard> {
  const span = daysBetween(from, to);
  const previousTo = shiftDay(from, -1);
  const previousFrom = shiftDay(previousTo, -(span - 1));
  const db = await getDb();
  const range = [startOf(from), startOf(shiftDay(to, 1)), ownerId];
  const { bucket, starts } = buckets(from, to);
  const sourceOptions = await db.query<{ id: string }>(`SELECT id FROM crm_options WHERE kind = 'source' ORDER BY sort, lower(label)`);

  const [current, previous, open, tasksNow, closedByStage, leadDays, wonDays, losses, sourceLeads, sourceWon, people, lastActivity] =
    await Promise.all([
      metrics(from, to, ownerId),
      metrics(previousFrom, previousTo, ownerId),
      db.query<{ stage: string; count: string; value: string }>(
        `SELECT d.stage, count(*) AS count, COALESCE(sum(d.value_cents), 0) AS value
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
         WHERE c.archived_at IS NULL AND d.stage NOT IN ('ganho', 'perdido') AND ($1::text IS NULL OR d.owner_id = $1)
         GROUP BY d.stage`,
        [ownerId]
      ),
      db.query<{ overdue: string; today: string }>(
        `SELECT count(*) FILTER (WHERE x.day < x.today OR (x.day = x.today AND NOT x.all_day AND x.due_at < now())) AS overdue,
                count(*) FILTER (WHERE x.day = x.today AND (x.all_day OR x.due_at >= now())) AS today
         FROM (
           SELECT t.due_at, t.all_day, (t.due_at AT TIME ZONE '${TZ}')::date AS day, (now() AT TIME ZONE '${TZ}')::date AS today
           FROM crm_tasks t JOIN crm_contacts c ON c.id = t.contact_id
           WHERE c.archived_at IS NULL AND t.done_at IS NULL AND t.canceled_at IS NULL AND t.due_at IS NOT NULL
             AND ($1::text IS NULL OR t.owner_id = $1)
         ) x`,
        [ownerId]
      ),
      db.query<{ stage: string; count: string; value: string }>(
        `SELECT d.stage, count(*) AS count, COALESCE(sum(d.value_cents), 0) AS value
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
         WHERE c.archived_at IS NULL AND d.stage IN ('ganho', 'perdido') AND d.closed_at >= $1 AND d.closed_at < $2
           AND ($3::text IS NULL OR d.owner_id = $3)
         GROUP BY d.stage`,
        range
      ),
      db.query<{ day: string; count: string }>(
        `SELECT to_char(c.created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, count(*) AS count
         FROM crm_contacts c
         WHERE c.archived_at IS NULL AND c.created_at >= $1 AND c.created_at < $2 AND ($3::text IS NULL OR c.owner_id = $3)
         GROUP BY 1`,
        range
      ),
      db.query<{ day: string; count: string }>(
        `SELECT to_char(d.closed_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS day, count(*) AS count
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
         WHERE c.archived_at IS NULL AND d.stage = 'ganho' AND d.closed_at >= $1 AND d.closed_at < $2 AND ($3::text IS NULL OR d.owner_id = $3)
         GROUP BY 1`,
        range
      ),
      db.query<{ reason: string | null; count: string; value: string }>(
        `SELECT d.lost_reason AS reason, count(*) AS count, COALESCE(sum(d.value_cents), 0) AS value
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
         WHERE c.archived_at IS NULL AND d.stage = 'perdido' AND d.closed_at >= $1 AND d.closed_at < $2 AND ($3::text IS NULL OR d.owner_id = $3)
         GROUP BY d.lost_reason`,
        range
      ),
      db.query<{ source: string; count: string }>(
        `SELECT c.source, count(*) AS count FROM crm_contacts c
         WHERE c.archived_at IS NULL AND c.created_at >= $1 AND c.created_at < $2 AND ($3::text IS NULL OR c.owner_id = $3)
         GROUP BY c.source`,
        range
      ),
      db.query<{ source: string; count: string; value: string }>(
        `SELECT c.source, count(*) AS count, COALESCE(sum(d.value_cents), 0) AS value
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
         WHERE c.archived_at IS NULL AND d.stage = 'ganho' AND d.closed_at >= $1 AND d.closed_at < $2 AND ($3::text IS NULL OR d.owner_id = $3)
         GROUP BY c.source`,
        range
      ),
      // Per person (deal/task owner; NULL = no owner).
      db.query<{
        owner_id: string | null;
        open_count: string;
        open_value: string;
        won: string;
        won_value: string;
        lost: string;
        tasks_done: string;
        tasks_overdue: string;
      }>(
        `WITH d AS (
           SELECT d.* FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id WHERE c.archived_at IS NULL
         ), t AS (
           SELECT t.* FROM crm_tasks t JOIN crm_contacts c ON c.id = t.contact_id WHERE c.archived_at IS NULL AND t.canceled_at IS NULL
         ), owners AS (
           SELECT owner_id FROM d UNION SELECT owner_id FROM t
         )
         SELECT o.owner_id,
                (SELECT count(*) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage NOT IN ('ganho', 'perdido')) AS open_count,
                (SELECT COALESCE(sum(value_cents), 0) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage NOT IN ('ganho', 'perdido')) AS open_value,
                (SELECT count(*) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage = 'ganho' AND d.closed_at >= $1 AND d.closed_at < $2) AS won,
                (SELECT COALESCE(sum(value_cents), 0) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage = 'ganho' AND d.closed_at >= $1 AND d.closed_at < $2) AS won_value,
                (SELECT count(*) FROM d WHERE d.owner_id IS NOT DISTINCT FROM o.owner_id AND d.stage = 'perdido' AND d.closed_at >= $1 AND d.closed_at < $2) AS lost,
                (SELECT count(*) FROM t WHERE t.owner_id IS NOT DISTINCT FROM o.owner_id AND t.done_at >= $1 AND t.done_at < $2) AS tasks_done,
                (SELECT count(*) FROM t WHERE t.owner_id IS NOT DISTINCT FROM o.owner_id AND t.done_at IS NULL AND t.due_at IS NOT NULL
                   AND ((t.due_at AT TIME ZONE '${TZ}')::date < (now() AT TIME ZONE '${TZ}')::date
                        OR (NOT t.all_day AND t.due_at < now() AND (t.due_at AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date))) AS tasks_overdue
         FROM owners o
         WHERE ($3::text IS NULL OR o.owner_id = $3)`,
        range
      ),
      db.query<{ user_id: string; at: Date }>(
        `SELECT user_id, max(created_at) AS at FROM crm_events WHERE user_id IS NOT NULL AND ($1::text IS NULL OR user_id = $1) GROUP BY user_id`,
        [ownerId]
      ),
    ]);

  const openBy = new Map(open.rows.map((r) => [r.stage, r]));
  const closedBy = new Map(closedByStage.rows.map((r) => [r.stage, r]));
  const funnel = CRM_STAGES.map((s) => {
    const r = (s.id === "ganho" || s.id === "perdido" ? closedBy : openBy).get(s.id);
    return { stage: s.id, count: n(r?.count), valueCents: n(r?.value) };
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
    .filter((s) => s.newLeads > 0 || s.won > 0)
    .sort((a, b) => (sourceOrder.get(a.source) ?? 999) - (sourceOrder.get(b.source) ?? 999) || a.source.localeCompare(b.source));

  const peopleBy = new Map(people.rows.map((r) => [r.owner_id, r]));
  const lastBy = new Map(lastActivity.rows.map((r) => [r.user_id, iso(r.at)]));
  const members = ownerId ? team.filter((m) => m.id === ownerId) : team;
  const row = (ownerKey: string | null, name: string) => {
    const r = peopleBy.get(ownerKey);
    const won = n(r?.won);
    const lost = n(r?.lost);
    return {
      ownerId: ownerKey,
      name,
      openCount: n(r?.open_count),
      openValueCents: n(r?.open_value),
      wonCount: won,
      wonValueCents: n(r?.won_value),
      lostCount: lost,
      conversion: won + lost > 0 ? won / (won + lost) : null,
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

  return {
    from,
    to,
    previousFrom,
    previousTo,
    current,
    previous,
    openNow: {
      count: open.rows.reduce((s, r) => s + n(r.count), 0),
      valueCents: open.rows.reduce((s, r) => s + n(r.value), 0),
    },
    tasksNow: { overdue: n(tasksNow.rows[0].overdue), today: n(tasksNow.rows[0].today) },
    funnel,
    bucket,
    series,
    lossReasons,
    sources,
    team: teamRows,
  };
}
