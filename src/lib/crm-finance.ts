// Server-only. Financeiro comercial (evolução v1.0, item 10): sold value,
// monthly and one-time revenue, what is contracted and forecast, the next
// charges, discounts, cancellations, lost revenue and the commissions the
// rules give — calculated from the opportunities, proposals and contracts
// already in the CRM (gerencial: nothing is billed or paid here).
//
// A contract's seller is its "responsável comercial", else the owner of the
// opportunity it came from, else the client's owner. A contract is "sold"
// on the day its opportunity was won (else the day it was registered).

import { randomUUID } from "crypto";
import { getDb } from "./db";
import { writeAudit } from "./audit-log";
import { CrmInputError, CrmNotFoundError, cleanText, iso } from "./crm-core";
import { requireCap, type CrmSession } from "./crm-access";
import { requireOptionId } from "./crm-options";
import type { CrmCommissionRow, CrmCommissionRule, CrmFinance, CrmInstallment } from "./crm-finance-types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BR = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

export type FinanceQuery = { from: string; to: string; ownerId: string | null };

/** ?from&to (Brasília days, up to ~13 months) &owner (all | a person); someone who doesn't see the team only gets their own. */
export function financeParams(s: CrmSession, p: { get: (k: string) => string | null }): FinanceQuery {
  requireCap(s, "seeContractValues");
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) throw new CrmInputError("Período inválido.");
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 400) throw new CrmInputError("Escolha um período de até 13 meses.");
  const owner = p.get("owner");
  let ownerId = owner && owner !== "all" ? (owner === "self" ? s.userId : owner) : null;
  if (!s.caps.seeTeamProductivity) ownerId = s.userId;
  return { from, to, ownerId };
}

type ContractRow = {
  id: string;
  number: number;
  client_id: string;
  client_name: string;
  services: string[];
  billing: string;
  status: string;
  value_cents: string | null;
  one_time_cents: string | null;
  starts_on: string;
  ends_on: string | null;
  seller_id: string | null;
  seller_name: string | null;
  sold_on: string;
  status_changed_on: string | null;
};
const CONTRACTS = `
  SELECT k.id, k.number, cl.id AS client_id, co.name AS client_name, k.services, k.billing, k.status, k.value_cents, k.one_time_cents,
         k.starts_on::text AS starts_on, k.ends_on::text AS ends_on,
         COALESCE(k.sales_owner_id, d.owner_id, cl.owner_id) AS seller_id, u.name AS seller_name,
         COALESCE((d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date, (k.created_at AT TIME ZONE 'America/Sao_Paulo')::date)::text AS sold_on,
         (k.status_changed_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS status_changed_on
  FROM crm_contracts k
  JOIN crm_clients cl ON cl.id = k.client_id
  JOIN crm_companies co ON co.id = cl.company_id
  LEFT JOIN crm_deals d ON d.id = k.deal_id
  LEFT JOIN internal_users u ON u.id = COALESCE(k.sales_owner_id, d.owner_id, cl.owner_id)`;

/** The monthly part and the one-time part of a contract. */
function parts(k: Pick<ContractRow, "billing" | "value_cents" | "one_time_cents">): { monthly: number; oneTime: number } {
  const v = k.value_cents === null ? 0 : Number(k.value_cents);
  return k.billing === "mensal" ? { monthly: v, oneTime: k.one_time_cents === null ? 0 : Number(k.one_time_cents) } : { monthly: 0, oneTime: v };
}

/** The most specific active rule for a seller, the contract's services and a part (salesperson > service > modality; then the newest). */
export function pickRule(rules: CrmCommissionRule[], sellerId: string | null, services: string[], part: "mensal" | "unico"): CrmCommissionRule | null {
  let best: { r: CrmCommissionRule; score: number } | null = null;
  for (const r of rules) {
    if (r.archivedAt) continue;
    if (r.userId && r.userId !== sellerId) continue;
    if (r.service && !services.includes(r.service)) continue;
    if (r.billing && r.billing !== part) continue;
    const score = (r.userId ? 4 : 0) + (r.service ? 2 : 0) + (r.billing ? 1 : 0);
    if (!best || score > best.score) best = { r, score };
  }
  return best?.r ?? null;
}

/** Commission of one contract: percent × monthly value × months counted, plus percent × one-time value. */
export function commissionOf(rules: CrmCommissionRule[], k: { sellerId: string | null; services: string[]; monthly: number; oneTime: number }) {
  const m = k.monthly > 0 ? pickRule(rules, k.sellerId, k.services, "mensal") : null;
  const u = k.oneTime > 0 ? pickRule(rules, k.sellerId, k.services, "unico") : null;
  const cents = Math.round((m ? (k.monthly * m.months * m.percent) / 100 : 0) + (u ? (k.oneTime * u.percent) / 100 : 0));
  return { cents, monthlyRule: m?.name ?? null, oneTimeRule: u?.name ?? null };
}

function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export async function getFinance(s: CrmSession, q: FinanceQuery): Promise<CrmFinance> {
  const db = await getDb();
  const own = (col: string, i: number) => (q.ownerId ? `AND ${col} = $${i}` : "");
  const args = (extra: unknown[] = []) => (q.ownerId ? [...extra, q.ownerId] : extra);
  const [sold, lost, pipeline, discounts, contracts, rules, today] = await Promise.all([
    db.query<{ n: string; cents: string }>(
      `SELECT count(*) AS n, COALESCE(sum(COALESCE(d.negotiated_cents, d.value_cents)), 0) AS cents FROM crm_deals d
       WHERE d.stage = 'ganho' AND (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2 ${own("d.owner_id", 3)}`,
      args([q.from, q.to]),
    ),
    db.query<{ n: string; cents: string }>(
      `SELECT count(*) AS n, COALESCE(sum(d.value_cents), 0) AS cents FROM crm_deals d
       WHERE d.stage = 'perdido' AND (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2 ${own("d.owner_id", 3)}`,
      args([q.from, q.to]),
    ),
    db.query<{ cents: string; weighted: string }>(
      `SELECT COALESCE(sum(d.value_cents), 0) AS cents,
              COALESCE(sum(d.value_cents * COALESCE(d.probability, (o.meta->>'probability')::int, 0) / 100.0), 0) AS weighted
       FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id LEFT JOIN crm_options o ON o.kind = 'stage' AND o.id = d.stage
       WHERE d.stage NOT IN ('ganho', 'perdido') AND c.archived_at IS NULL ${own("d.owner_id", 1)}`,
      args(),
    ),
    db.query<{ n: string; cents: string; pct: string | null }>(
      `SELECT count(*) AS n, COALESCE(sum((v.content->'totals'->>'discountCents')::bigint), 0) AS cents, avg((v.content->'totals'->>'discountPct')::numeric) AS pct
       FROM crm_proposals p JOIN crm_proposal_versions v ON v.proposal_id = p.id AND v.version = p.sent_version JOIN crm_deals d ON d.id = p.deal_id
       WHERE p.status = 'aprovada' AND (p.decided_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1 AND $2 ${own("d.owner_id", 3)}`,
      args([q.from, q.to]),
    ),
    db.query<ContractRow>(`${CONTRACTS} ${q.ownerId ? "WHERE COALESCE(k.sales_owner_id, d.owner_id, cl.owner_id) = $1" : ""} ORDER BY k.number`, args()),
    listRules(),
    db.query<{ d: string }>(`SELECT ${BR}::text AS d`),
  ]);
  const todayDay = today.rows[0].d;
  const thisMonth = todayDay.slice(0, 7);
  const rows = contracts.rows;

  // Today's portfolio.
  const vigentes = rows.filter((k) => k.status === "vigente");
  const activeMonthly = vigentes.reduce((a, k) => a + parts(k).monthly, 0);

  // Next 12 months of monthly billing (each contract until it ends).
  let next12 = 0;
  for (const k of vigentes) {
    const { monthly } = parts(k);
    if (!monthly) continue;
    for (let i = 0; i < 12; i++) {
      const m = addMonths(thisMonth, i);
      if (k.starts_on > monthEnd(m)) continue;
      if (k.ends_on && k.ends_on < `${m}-01`) break;
      next12 += monthly;
    }
  }

  // Next 6 months of charges.
  const installments: CrmInstallment[] = [];
  for (let i = 0; i < 6; i++) {
    const m = addMonths(thisMonth, i);
    for (const k of rows) {
      const { monthly, oneTime } = parts(k);
      if (k.status === "vigente" && monthly && k.starts_on <= monthEnd(m) && (!k.ends_on || k.ends_on >= `${m}-01`)) {
        installments.push({ month: m, clientId: k.client_id, clientName: k.client_name, contractNumber: k.number, kind: "mensal", cents: monthly });
      }
      if (k.status === "vigente" && oneTime && k.starts_on.slice(0, 7) === m) {
        installments.push({ month: m, clientId: k.client_id, clientName: k.client_name, contractNumber: k.number, kind: "unico", cents: oneTime });
      }
    }
  }

  // Sold in the period: new monthly and one-time revenue, and the commissions.
  const soldContracts = rows.filter((k) => k.sold_on >= q.from && k.sold_on <= q.to && k.status !== "cancelado");
  let newMonthly = 0;
  let oneTime = 0;
  const commissionRows: CrmCommissionRow[] = [];
  for (const k of soldContracts) {
    const p = parts(k);
    newMonthly += p.monthly;
    oneTime += p.oneTime;
    const c = commissionOf(rules, { sellerId: k.seller_id, services: k.services ?? [], monthly: p.monthly, oneTime: p.oneTime });
    commissionRows.push({
      contractId: k.id,
      contractNumber: k.number,
      clientId: k.client_id,
      clientName: k.client_name,
      sellerId: k.seller_id,
      sellerName: k.seller_name,
      soldOn: k.sold_on,
      monthlyCents: p.monthly,
      oneTimeCents: p.oneTime,
      monthlyRule: c.monthlyRule,
      oneTimeRule: c.oneTimeRule,
      commissionCents: c.cents,
    });
  }
  const bySeller = new Map<string, { sellerId: string | null; sellerName: string | null; contracts: number; commissionCents: number }>();
  for (const r of commissionRows) {
    const key = r.sellerId ?? "";
    const cur = bySeller.get(key) ?? { sellerId: r.sellerId, sellerName: r.sellerName, contracts: 0, commissionCents: 0 };
    cur.contracts += 1;
    cur.commissionCents += r.commissionCents;
    bySeller.set(key, cur);
  }

  // Cancelled or ended in the period.
  const cancelled = rows.filter(
    (k) => (k.status === "cancelado" || k.status === "encerrado") && k.status_changed_on && k.status_changed_on >= q.from && k.status_changed_on <= q.to,
  );

  return {
    from: q.from,
    to: q.to,
    ownerId: q.ownerId,
    sold: { count: Number(sold.rows[0].n), cents: Number(sold.rows[0].cents) },
    newMonthlyCents: newMonthly,
    oneTimeCents: oneTime,
    active: { contracts: vigentes.length, monthlyCents: activeMonthly },
    pipeline: { cents: Number(pipeline.rows[0].cents), weightedCents: Math.round(Number(pipeline.rows[0].weighted)) },
    contractedNext12Cents: next12,
    discounts: {
      proposals: Number(discounts.rows[0].n),
      cents: Number(discounts.rows[0].cents),
      avgPct: discounts.rows[0].pct === null ? 0 : Math.round(Number(discounts.rows[0].pct) * 10) / 10,
    },
    cancellations: {
      count: cancelled.length,
      monthlyCents: cancelled.reduce((a, k) => a + parts(k).monthly, 0),
      rows: cancelled.map((k) => ({
        contractNumber: k.number,
        clientName: k.client_name,
        status: k.status,
        monthlyCents: parts(k).monthly,
        on: k.status_changed_on!,
      })),
    },
    lost: { deals: Number(lost.rows[0].n), dealsCents: Number(lost.rows[0].cents) },
    installments,
    commissions: {
      rows: commissionRows,
      bySeller: [...bySeller.values()].sort((a, b) => b.commissionCents - a.commissionCents),
      totalCents: commissionRows.reduce((a, r) => a + r.commissionCents, 0),
    },
  };
}

// ---------- commission rules ----------

type RuleRow = {
  id: string;
  name: string;
  user_id: string | null;
  user_name: string | null;
  service: string | null;
  billing: "mensal" | "unico" | null;
  percent: string;
  months: number;
  archived_at: Date | null;
};
const mapRule = (r: RuleRow): CrmCommissionRule => ({
  id: r.id,
  name: r.name,
  userId: r.user_id,
  userName: r.user_name,
  service: r.service,
  billing: r.billing,
  percent: Number(r.percent),
  months: r.months,
  archivedAt: iso(r.archived_at),
});

export async function listRules(withArchived = true): Promise<CrmCommissionRule[]> {
  const db = await getDb();
  const { rows } = await db.query<RuleRow>(
    `SELECT r.*, u.name AS user_name FROM crm_commission_rules r LEFT JOIN internal_users u ON u.id = r.user_id
     ${withArchived ? "" : "WHERE r.archived_at IS NULL"} ORDER BY r.archived_at NULLS FIRST, r.created_at DESC`,
  );
  return rows.map(mapRule);
}

/** New or edited rule ({ name, userId?, service?, billing?, percent, months?, archived? }). Gestor / Administrador (metas e comissões). */
export async function saveRule(s: CrmSession, id: string | null, input: Record<string, unknown>): Promise<CrmCommissionRule> {
  requireCap(s, "manageGoals");
  const db = await getDb();
  const cur = id ? (await db.query<RuleRow>(`SELECT r.*, NULL AS user_name FROM crm_commission_rules r WHERE r.id = $1`, [id])).rows[0] : undefined;
  if (id && !cur) throw new CrmNotFoundError("Regra não encontrada.");
  const has = (k: string) => input[k] !== undefined;
  const name = has("name") ? cleanText(input.name, 120) : (cur?.name ?? null);
  if (!name) throw new CrmInputError("Dê um nome à regra.");
  let userId = cur?.user_id ?? null;
  if (has("userId")) {
    userId = typeof input.userId === "string" && input.userId ? input.userId : null;
    if (userId && !(await db.query(`SELECT 1 FROM internal_users WHERE id = $1 AND revoked_at IS NULL`, [userId])).rows.length)
      throw new CrmInputError("Vendedor inválido.");
  }
  let service = cur?.service ?? null;
  if (has("service")) service = input.service ? await requireOptionId(db, "service", input.service, cur?.service ?? null) : null;
  let billing = cur?.billing ?? null;
  if (has("billing")) {
    if (input.billing !== null && input.billing !== "" && input.billing !== "mensal" && input.billing !== "unico")
      throw new CrmInputError("Modalidade inválida.");
    billing = (input.billing as "mensal" | "unico") || null;
  }
  const num = (v: unknown) => (typeof v === "string" ? Number(v.replace("%", "").replace(",", ".").trim()) : v);
  const percent = has("percent") ? num(input.percent) : cur ? Number(cur.percent) : undefined;
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new CrmInputError("Percentual inválido: de 0 a 100.");
  const months = has("months") ? num(input.months) : (cur?.months ?? 1);
  if (typeof months !== "number" || !Number.isInteger(months) || months < 1 || months > 36) throw new CrmInputError("Mensalidades: de 1 a 36.");
  const archived = typeof input.archived === "boolean" ? input.archived : null;
  const values = [name, userId, service, billing, Math.round(percent * 100) / 100, months];
  const rid = id ?? randomUUID();
  if (cur) {
    await db.query(
      `UPDATE crm_commission_rules SET name = $2, user_id = $3, service = $4, billing = $5, percent = $6, months = $7,
              archived_at = CASE WHEN $8::boolean IS NULL THEN archived_at WHEN $8 THEN COALESCE(archived_at, now()) ELSE NULL END, updated_at = now() WHERE id = $1`,
      [rid, ...values, archived],
    );
  } else {
    await db.query(
      `INSERT INTO crm_commission_rules (id, name, user_id, service, billing, percent, months, created_by_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [rid, ...values, s.userName],
    );
  }
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.commission_rule",
    targetType: "crm_commission_rule",
    targetId: rid,
    targetLabel: name,
    metadata: { action: cur ? (archived === null ? "edited" : archived ? "archived" : "restored") : "created", percent, months, billing, service, userId },
  });
  return (await listRules()).find((r) => r.id === rid)!;
}
