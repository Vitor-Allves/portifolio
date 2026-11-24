// Server-only. Relatórios (evolução v1.0, itens 5 e 14): reports computed
// from the CRM's own records, with filters, on screen and exported as
// planilha (CSV) or PDF. Each report is one function returning plain data;
// the routes add the permission checks, the audit trail and the formats.
//
// Tabulação comercial: every opportunity closed in the period, by the
// tabulação recorded when it was closed — Resultado positivo (venda
// realizada / proposta aprovada), Perda comercial, Sem conversão and
// Oportunidade futura — by reason and by seller, and the reopenings.

import { getDb } from "./db";
import { iso } from "./crm-core";
import { listTeam } from "./crm";
import { dashboardParams, shiftDay, type DashboardFilters } from "./crm-dashboard";
import { CLOSE_GROUPS, isWonResult, type CloseGroup, type WonResult } from "./crm-catalog";

const startOf = (day: string) => new Date(`${day}T00:00:00-03:00`);
const n = (v: unknown) => Number(v ?? 0);

export type TabulationFilters = DashboardFilters & { service?: string | null; reason?: string | null; group?: CloseGroup | null };

export type CrmTabulationRow = {
  id: string;
  contactId: string;
  title: string;
  contactName: string;
  ownerName: string | null;
  closedByName: string | null;
  closedAt: string;
  group: CloseGroup;
  /** lost_reason (non-won) or won_reason (won) code. */
  reason: string | null;
  wonResult: WonResult | null;
  note: string | null;
  returnOn: string | null;
  valueCents: number | null;
  source: string;
  service: string | null;
};

export type CrmTabulationReport = {
  from: string;
  to: string;
  groups: { group: CloseGroup; count: number; valueCents: number }[];
  reasons: { group: CloseGroup; reason: string | null; count: number; valueCents: number }[];
  results: { result: WonResult; count: number; valueCents: number }[];
  people: { ownerId: string | null; name: string; positivo: number; negativo: number; sem_conversao: number; futuro: number; conversion: number | null }[];
  /** Closed opportunities reopened in the period (with the justification in their history). */
  reopened: number;
  total: number;
  rows: CrmTabulationRow[];
};

export const TABULATION_ROWS_LIMIT = 1000;

const GROUP_SQL = `CASE WHEN d.stage = 'ganho' THEN 'positivo' ELSE COALESCE(d.close_group, 'negativo') END`;
const REASON_SQL = `CASE WHEN d.stage = 'ganho' THEN d.won_reason ELSE d.lost_reason END`;
const VALUE_SQL = `CASE WHEN d.stage = 'ganho' THEN COALESCE(d.negotiated_cents, d.value_cents) ELSE d.value_cents END`;

export async function getTabulationReport(from: string, to: string, f: TabulationFilters): Promise<CrmTabulationReport> {
  const db = await getDb();
  const values: unknown[] = [startOf(from), startOf(shiftDay(to, 1))];
  const p = (v: unknown) => (values.push(v), `$${values.length}`);
  let where = `c.archived_at IS NULL AND d.stage IN ('ganho', 'perdido') AND d.closed_at >= $1 AND d.closed_at < $2`;
  if (f.ownerId) where += ` AND d.owner_id = ${p(f.ownerId)}`;
  if (f.source) where += ` AND COALESCE(d.source, c.source) = ${p(f.source)}`;
  if (f.segment) where += ` AND COALESCE(co.segment, c.segment) = ${p(f.segment)}`;
  if (f.service) where += ` AND d.service = ${p(f.service)}`;
  if (f.reason) where += ` AND ${REASON_SQL} = ${p(f.reason)}`;
  if (f.group) where += ` AND ${GROUP_SQL} = ${p(f.group)}`;
  const base = `FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id LEFT JOIN crm_companies co ON co.id = c.company_id WHERE ${where}`;

  // Reopenings: stage events leaving Venda fechada / Venda perdida, by a person, in the period.
  const rv: unknown[] = [values[0], values[1]];
  let rwhere = `e.kind = 'stage' AND e.payload ? 'reopenReason' AND e.created_at >= $1 AND e.created_at < $2 AND c.archived_at IS NULL`;
  if (f.ownerId) {
    rv.push(f.ownerId);
    rwhere += ` AND d.owner_id = $${rv.length}`;
  }

  const [groups, reasons, results, people, list, total, reopened, team] = await Promise.all([
    db.query<{ g: string; count: string; value: string }>(`SELECT ${GROUP_SQL} AS g, count(*) AS count, COALESCE(sum(${VALUE_SQL}), 0) AS value ${base} GROUP BY 1`, values),
    db.query<{ g: string; reason: string | null; count: string; value: string }>(
      `SELECT ${GROUP_SQL} AS g, ${REASON_SQL} AS reason, count(*) AS count, COALESCE(sum(${VALUE_SQL}), 0) AS value ${base} GROUP BY 1, 2 ORDER BY 3 DESC, 2`,
      values
    ),
    db.query<{ result: string | null; count: string; value: string }>(
      `SELECT COALESCE(d.won_result, 'venda_realizada') AS result, count(*) AS count, COALESCE(sum(${VALUE_SQL}), 0) AS value ${base} AND d.stage = 'ganho' GROUP BY 1`,
      values
    ),
    db.query<{ owner: string | null; g: string; count: string }>(`SELECT d.owner_id AS owner, ${GROUP_SQL} AS g, count(*) AS count ${base} GROUP BY 1, 2`, values),
    db.query<{
      id: string;
      contact_id: string;
      title: string;
      contact_name: string;
      owner_name: string | null;
      closed_by_name: string | null;
      closed_at: Date;
      g: string;
      reason: string | null;
      won_result: string | null;
      note: string | null;
      return_on: string | null;
      value: string | null;
      source: string;
      service: string | null;
    }>(
      `SELECT d.id, d.contact_id, d.title, c.name AS contact_name, u.name AS owner_name, d.closed_by_name, d.closed_at, ${GROUP_SQL} AS g, ${REASON_SQL} AS reason,
              d.won_result, CASE WHEN d.stage = 'ganho' THEN d.won_note ELSE d.lost_note END AS note, d.return_on::text AS return_on, ${VALUE_SQL} AS value,
              COALESCE(d.source, c.source) AS source, d.service
       ${base.replace("WHERE", "LEFT JOIN internal_users u ON u.id = d.owner_id WHERE")}
       ORDER BY d.closed_at DESC, d.id LIMIT ${TABULATION_ROWS_LIMIT}`,
      values
    ),
    db.query<{ n: string }>(`SELECT count(*) AS n ${base}`, values),
    db.query<{ n: string }>(
      `SELECT count(*) AS n FROM crm_events e JOIN crm_contacts c ON c.id = e.contact_id LEFT JOIN crm_deals d ON d.id = e.payload->>'dealId' WHERE ${rwhere}`,
      rv
    ),
    listTeam(),
  ]);

  const byGroup = new Map(groups.rows.map((r) => [r.g, r]));
  const perOwner = new Map<string | null, Record<string, number>>();
  for (const r of people.rows) {
    const m = perOwner.get(r.owner) ?? {};
    m[r.g] = n(r.count);
    perOwner.set(r.owner, m);
  }
  const names = new Map(team.map((m) => [m.id, m.name]));
  const personRow = (ownerId: string | null) => {
    const m = perOwner.get(ownerId) ?? {};
    const pos = m.positivo ?? 0;
    const neg = m.negativo ?? 0;
    const sem = m.sem_conversao ?? 0;
    return {
      ownerId,
      name: ownerId ? (names.get(ownerId) ?? "Usuário removido") : "Sem responsável",
      positivo: pos,
      negativo: neg,
      sem_conversao: sem,
      futuro: m.futuro ?? 0,
      // The same conversion as the Painel: ganhos ÷ (ganhos + perdas definitivas); a future opportunity isn't decided yet.
      conversion: pos + neg + sem > 0 ? pos / (pos + neg + sem) : null,
    };
  };
  return {
    from,
    to,
    groups: CLOSE_GROUPS.map((g) => ({ group: g.id, count: n(byGroup.get(g.id)?.count), valueCents: n(byGroup.get(g.id)?.value) })),
    reasons: reasons.rows.map((r) => ({ group: r.g as CloseGroup, reason: r.reason, count: n(r.count), valueCents: n(r.value) })),
    results: results.rows.filter((r) => isWonResult(r.result)).map((r) => ({ result: r.result as WonResult, count: n(r.count), valueCents: n(r.value) })),
    people: [...perOwner.keys()].map(personRow).sort((a, b) => (a.ownerId === null ? 1 : b.ownerId === null ? -1 : a.name.localeCompare(b.name, "pt-BR"))),
    reopened: n(reopened.rows[0].n),
    total: n(total.rows[0].n),
    rows: list.rows.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      title: r.title,
      contactName: r.contact_name,
      ownerName: r.owner_name,
      closedByName: r.closed_by_name,
      closedAt: iso(r.closed_at)!,
      group: r.g as CloseGroup,
      reason: r.reason,
      wonResult: isWonResult(r.won_result) ? r.won_result : r.g === "positivo" ? "venda_realizada" : null,
      note: r.note,
      returnOn: r.return_on,
      valueCents: r.value === null ? null : Number(r.value),
      source: r.source,
      service: r.service,
    })),
  };
}

/** The Painel's period and filters, plus serviço, motivo and grupo. A Comercial only gets their own numbers. */
export function tabulationParams(
  p: URLSearchParams,
  s: Parameters<typeof dashboardParams>[1]
): { from: string; to: string; filters: TabulationFilters } | { error: string } {
  const q = dashboardParams(p, s);
  if ("error" in q) return q;
  // Reports by seller are a manager's view: without "ver a produtividade da equipe", only their own closings.
  if (!s.caps.seeTeamProductivity) q.filters.ownerId = s.userId;
  const clean = (v: string | null) => (v && v !== "all" ? v.slice(0, 200) : null);
  const group = clean(p.get("group"));
  return {
    from: q.from,
    to: q.to,
    filters: { ...q.filters, stage: null, service: clean(p.get("service")), reason: clean(p.get("reason")), group: CLOSE_GROUPS.some((g) => g.id === group) ? (group as CloseGroup) : null },
  };
}
