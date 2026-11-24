// Server-only. Metas e produtividade (Fase 6, entrega 2, especificação v1.0).
//
// Metas: one number per month, person (or the whole team) and indicator —
// leads, reuniões, propostas, negócios ganhos, valor vendido. Only the
// target is stored; what was achieved is always counted from the records
// with the Painel's own definitions (ownerMetrics), so a goal and the Painel
// never disagree. Administrador and Gestor set them ("manageGoals").
//
// Produtividade: what each person did in a period — the Painel's commercial
// numbers per responsável plus tarefas, conversas atendidas and tempo de
// resposta. Who sees everyone's numbers on the Painel ("ver todos os leads")
// sees everyone here; a Comercial sees only their own line.

import { randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import { writeAudit } from "./audit-log";
import { CrmInputError, iso } from "./crm-core";
import { requireCap, type CrmSession } from "./crm-access";
import { listTeam } from "./crm";
import { isDay, ownerMetrics, shiftDay, sumMetrics, type OwnerMetrics } from "./crm-dashboard";
import {
  CRM_GOAL_METRICS,
  isGoalMetric,
  isMonth,
  monthTitle,
  parseMoneyToCents,
  type CrmGoalMetric,
  type CrmGoalRow,
  type CrmGoalsMonth,
  type CrmProductivity,
  type CrmProductivityNumbers,
  type CrmProductivityRow,
} from "./crm-types";

type Viewer = Pick<CrmSession, "userId" | "caps">;

const todayBr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** First and last day of "YYYY-MM". */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return [`${month}-01`, shiftDay(next, -1)];
}

const actualOf = (m: OwnerMetrics): Record<CrmGoalMetric, number> => ({
  leads: m.leads,
  meetings: m.meetings,
  proposals: m.proposals,
  won: m.wonCount,
  wonValue: m.wonValueCents,
});

// ---------- metas ----------

/** The month's goals and what each line achieved. A Comercial gets only their own line (no team line). */
export async function getGoals(s: Viewer, month: string): Promise<CrmGoalsMonth> {
  if (!isMonth(month)) throw new CrmInputError("Mês inválido.");
  const [first, last] = monthRange(month);
  const today = todayBr();
  const elapsed = today < first ? 0 : today > last ? 1 : Number(today.slice(8, 10)) / Number(last.slice(8, 10));
  const seeAll = s.caps.seeAllLeads;
  const only = seeAll ? null : s.userId;
  const db = await getDb();
  const [team, goals, by] = await Promise.all([
    listTeam(),
    db.query<{ user_id: string | null; name: string | null; metric: string; target: string; updated_at: Date; updated_by_name: string | null }>(
      `SELECT g.user_id, u.name, g.metric, g.target, g.updated_at, g.updated_by_name
       FROM crm_goals g LEFT JOIN internal_users u ON u.id = g.user_id
       WHERE g.month = $1 AND ($2::text IS NULL OR g.user_id = $2)
       ORDER BY g.updated_at DESC`,
      [first, only]
    ),
    ownerMetrics(first, last, only),
  ]);
  const targetsBy = new Map<string | null, Partial<Record<CrmGoalMetric, number>>>();
  const goalNames = new Map<string, string>();
  for (const g of goals.rows) {
    if (!isGoalMetric(g.metric)) continue;
    const t = targetsBy.get(g.user_id) ?? {};
    t[g.metric] = Number(g.target);
    targetsBy.set(g.user_id, t);
    if (g.user_id) goalNames.set(g.user_id, g.name ?? "Pessoa removida");
  }
  // Indicators always in the screen's order.
  const ordered = (t: Partial<Record<CrmGoalMetric, number>> = {}) =>
    Object.fromEntries(CRM_GOAL_METRICS.filter((m) => t[m.id] !== undefined).map((m) => [m.id, t[m.id]])) as Partial<Record<CrmGoalMetric, number>>;
  const row = (userId: string | null, name: string, m: OwnerMetrics): CrmGoalRow => ({ userId, name, targets: ordered(targetsBy.get(userId)), actual: actualOf(m) });
  const zero = sumMetrics([]);
  const rows: CrmGoalRow[] = [];
  if (seeAll) {
    rows.push(row(null, "Equipe", sumMetrics([...by.values()])));
    for (const m of team) rows.push(row(m.id, m.name, by.get(m.id) ?? zero));
    // Someone no longer on the team who had a goal that month keeps their line.
    for (const [id, name] of goalNames) if (!team.some((m) => m.id === id)) rows.push(row(id, name, by.get(id) ?? zero));
  } else {
    const me = team.find((m) => m.id === s.userId);
    rows.push(row(s.userId, me?.name ?? "Você", by.get(s.userId) ?? zero));
  }
  const latest = goals.rows[0];
  return { month, elapsed, rows, updatedAt: latest ? iso(latest.updated_at) : null, updatedByName: latest?.updated_by_name ?? null };
}

export type GoalsInput = { month?: unknown; goals?: unknown };

const MAX_COUNT_GOAL = 1_000_000;

/** A goal from the screen: a count, or a value in reais for valor vendido. Blank or 0 = no goal. */
function parseTarget(metric: CrmGoalMetric, raw: unknown): number | null {
  const label = CRM_GOAL_METRICS.find((m) => m.id === metric)!.label.toLowerCase();
  if (raw === null || raw === undefined || raw === "") return null;
  let v: number | null;
  if (metric === "wonValue") {
    try {
      v = parseMoneyToCents(raw);
    } catch {
      throw new CrmInputError(`Meta de ${label} inválida.`);
    }
  } else {
    v = typeof raw === "number" ? raw : typeof raw === "string" && /^\s*\d+\s*$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(v) || v < 0 || v > MAX_COUNT_GOAL) throw new CrmInputError(`Meta de ${label} inválida: use um número inteiro.`);
  }
  return v ? v : null;
}

/**
 * { month: "YYYY-MM", goals: [{ userId: string | null (equipe), metric, target }] }
 * — sets (or, blank/0, removes) each listed goal of the month. Administrador
 * and Gestor only; every change goes to the audit trail.
 */
export async function saveGoals(s: CrmSession, input: GoalsInput): Promise<CrmGoalsMonth> {
  requireCap(s, "manageGoals");
  const month = input.month;
  if (!isMonth(month)) throw new CrmInputError("Mês inválido.");
  if (!Array.isArray(input.goals) || input.goals.length > 1000) throw new CrmInputError("Metas inválidas.");
  const team = await listTeam();
  const db = await getDb();
  // People with a goal that month may have left the team: their goals can still be cleared or kept.
  const holders = new Set(
    (await db.query<{ user_id: string }>(`SELECT DISTINCT user_id FROM crm_goals WHERE month = $1 AND user_id IS NOT NULL`, [`${month}-01`])).rows.map((r) => r.user_id)
  );
  const items = input.goals.map((g) => {
    const o = (g ?? {}) as Record<string, unknown>;
    const userId = o.userId === null || o.userId === undefined || o.userId === "" ? null : o.userId;
    if (userId !== null && (typeof userId !== "string" || !(team.some((m) => m.id === userId) || holders.has(userId)))) {
      throw new CrmInputError("Pessoa inválida nas metas.");
    }
    if (!isGoalMetric(o.metric)) throw new CrmInputError("Indicador inválido nas metas.");
    return { userId, metric: o.metric, target: parseTarget(o.metric, o.target) };
  });
  const changed = await withTransaction(async (client) => {
    let n = 0;
    for (const it of items) {
      if (it.target === null) {
        const r = await client.query(`DELETE FROM crm_goals WHERE month = $1 AND COALESCE(user_id, '') = COALESCE($2::text, '') AND metric = $3`, [
          `${month}-01`,
          it.userId,
          it.metric,
        ]);
        n += r.rowCount ?? 0;
      } else {
        const r = await client.query(
          `INSERT INTO crm_goals (id, month, user_id, metric, target, updated_by, updated_by_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (month, (COALESCE(user_id, '')), metric)
           DO UPDATE SET target = EXCLUDED.target, updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name, updated_at = now()
           WHERE crm_goals.target <> EXCLUDED.target`,
          [randomUUID(), `${month}-01`, it.userId, it.metric, it.target, s.userId, s.userName]
        );
        n += r.rowCount ?? 0;
      }
    }
    return n;
  });
  if (changed > 0) {
    await writeAudit({
      actorUserId: s.userId,
      actorLabel: s.userName,
      actorKind: "admin",
      action: "crm.goals_change",
      targetType: "crm_goals",
      targetId: month,
      targetLabel: `Metas de ${monthTitle(month)}`,
      metadata: { month, monthLabel: monthTitle(month), changed },
    });
  }
  return getGoals(s, month);
}

// ---------- produtividade ----------

const NO_PRODUCTIVITY = { conversations: 0, messagesSent: 0, answered: 0, avgResponseMinutes: null as number | null };

/** ?from&to (Brasília, inclusive, up to a year). */
export function productivityPeriod(from: unknown, to: unknown): [string, string] {
  if (!isDay(from) || !isDay(to) || from > to) throw new CrmInputError("Período inválido.");
  if (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`) > 366 * 86_400_000) throw new CrmInputError("Escolha um período de até um ano.");
  return [from, to];
}

/**
 * Each person's productivity in [from, to]: the Painel's numbers per
 * responsável, tasks, WhatsApp conversations they answered and their average
 * response time (clock minutes from a waiting contact's message to the first
 * answer that isn't a campaign), and their last activity. Archived contacts
 * are left out, as on the Painel.
 */
export async function getProductivity(s: Viewer, from: string, to: string): Promise<CrmProductivity> {
  const seeAll = s.caps.seeAllLeads;
  const only = seeAll ? null : s.userId;
  const start = new Date(`${from}T00:00:00-03:00`);
  const end = new Date(`${shiftDay(to, 1)}T00:00:00-03:00`);
  const db = await getDb();
  const [team, by, convo, response, last] = await Promise.all([
    listTeam(),
    ownerMetrics(from, to, only),
    db.query<{ owner: string | null; total: number; conversations: string; messages: string }>(
      `SELECT m.sent_by AS owner, GROUPING(m.sent_by) AS total, count(DISTINCT m.contact_id) AS conversations, count(*) AS messages
       FROM crm_messages m JOIN crm_contacts c ON c.id = m.contact_id
       WHERE c.archived_at IS NULL AND m.direction = 'out' AND m.campaign_id IS NULL AND m.created_at >= $1 AND m.created_at < $2
         AND ($3::text IS NULL OR m.sent_by = $3)
       GROUP BY GROUPING SETS ((m.sent_by), ())`,
      [start, end, only]
    ),
    db.query<{ owner: string | null; n: string; avg_min: string }>(
      `WITH m AS (
         SELECT m.contact_id, m.direction, m.created_at,
                lag(m.direction) OVER (PARTITION BY m.contact_id ORDER BY m.created_at, m.seq) AS prev_dir
         FROM crm_messages m JOIN crm_contacts c ON c.id = m.contact_id
         WHERE c.archived_at IS NULL AND m.created_at >= $1::timestamptz - interval '30 days' AND m.created_at < $2
       ), waits AS (
         SELECT contact_id, created_at AS asked FROM m WHERE direction = 'in' AND (prev_dir IS NULL OR prev_dir = 'out') AND created_at >= $1
       )
       SELECT r.sent_by AS owner, count(*) AS n, avg(EXTRACT(EPOCH FROM (r.created_at - w.asked)) / 60) AS avg_min
       FROM waits w
       JOIN LATERAL (
         SELECT o.created_at, o.sent_by FROM crm_messages o
         WHERE o.contact_id = w.contact_id AND o.direction = 'out' AND o.campaign_id IS NULL AND o.created_at > w.asked
         ORDER BY o.created_at, o.seq LIMIT 1
       ) r ON true
       WHERE ($3::text IS NULL OR r.sent_by = $3)
       GROUP BY r.sent_by`,
      [start, end, only]
    ),
    db.query<{ owner: string; at: Date }>(
      `SELECT owner, max(at) AS at FROM (
         SELECT user_id AS owner, max(created_at) AS at FROM crm_events WHERE user_id IS NOT NULL GROUP BY 1
         UNION ALL SELECT sent_by, max(created_at) FROM crm_messages WHERE sent_by IS NOT NULL GROUP BY 1
         UNION ALL SELECT done_by, max(done_at) FROM crm_tasks WHERE done_by IS NOT NULL GROUP BY 1
       ) x WHERE ($1::text IS NULL OR owner = $1) GROUP BY owner`,
      [only]
    ),
  ]);
  const convoBy = new Map(convo.rows.filter((r) => Number(r.total) === 0).map((r) => [r.owner, r]));
  const convoAll = convo.rows.find((r) => Number(r.total) === 1);
  const respBy = new Map(response.rows.map((r) => [r.owner, r]));
  const lastBy = new Map(last.rows.map((r) => [r.owner, iso(r.at)]));
  const zero = sumMetrics([]);

  const numbers = (m: OwnerMetrics, extra: typeof NO_PRODUCTIVITY): CrmProductivityNumbers => ({
    leads: m.leads,
    meetings: m.meetings,
    proposals: m.proposals,
    wonCount: m.wonCount,
    wonValueCents: m.wonValueCents,
    lostCount: m.lostCount,
    conversion: m.wonCount + m.lostCount > 0 ? m.wonCount / (m.wonCount + m.lostCount) : null,
    tasksDone: m.tasksDone,
    tasksOverdue: m.tasksOverdue,
    ...extra,
  });
  const personExtra = (id: string | null) => {
    if (id === null) return NO_PRODUCTIVITY;
    const c = convoBy.get(id);
    const r = respBy.get(id);
    return {
      conversations: Number(c?.conversations ?? 0),
      messagesSent: Number(c?.messages ?? 0),
      answered: Number(r?.n ?? 0),
      avgResponseMinutes: r ? Math.round(Number(r.avg_min)) : null,
    };
  };
  const line = (userId: string | null, name: string): CrmProductivityRow => ({
    userId,
    name,
    ...numbers(by.get(userId) ?? zero, personExtra(userId)),
    lastActivityAt: userId ? lastBy.get(userId) ?? null : null,
  });

  const members = seeAll ? team : team.filter((m) => m.id === s.userId);
  const rows = members.map((m) => line(m.id, m.name));
  if (seeAll) {
    const u = by.get(null);
    if (u && u.leads + u.meetings + u.proposals + u.wonCount + u.lostCount + u.tasksDone + u.tasksOverdue > 0) rows.push(line(null, "Sem responsável"));
  }
  let teamNumbers: CrmProductivityNumbers | null = null;
  if (seeAll) {
    const answered = response.rows.reduce((acc, r) => acc + Number(r.n), 0);
    const minutes = response.rows.reduce((acc, r) => acc + Number(r.n) * Number(r.avg_min), 0);
    teamNumbers = numbers(sumMetrics([...by.values()]), {
      conversations: Number(convoAll?.conversations ?? 0),
      messagesSent: Number(convoAll?.messages ?? 0),
      answered,
      avgResponseMinutes: answered ? Math.round(minutes / answered) : null,
    });
  }
  return { from, to, rows, team: teamNumbers };
}
