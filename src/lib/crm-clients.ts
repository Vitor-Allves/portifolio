// Server-only. Clientes ativos (especificação v1.0, módulo 12 — Fase 5,
// entrega 1): the companies that hired the Legado. Who is responsible, the
// situation (onboarding, ativo, pausado, encerrado), the contracts (services,
// period, value) and the relationship history. One client per company, and
// nobody becomes a client by themselves: a person turns a won opportunity or
// a company into one. Contract values only reach those allowed to see them.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { writeAudit } from "./audit-log";
import { CrmConflictError, CrmForbiddenError, CrmInputError, CrmNotFoundError, brDate, cleanText, escapeLike, iso, parseDateOnly } from "./crm-core";
import { requireCap, visibleTo, type CrmSession } from "./crm-access";
import { canAssignOwner, type CrmCapabilities } from "./crm-permissions";
import { optionLabel, requireOptionId } from "./crm-options";
import {
  isMonth,
  monthLabel,
  type CrmClientReport,
  type CrmFollowUpRow,
  clientStatusLabel,
  contractStatusLabel,
  formatBRL,
  isCrmClientStatus,
  isCrmContractBilling,
  isCrmContractStatus,
  parseMoneyToCents,
  type CrmClientDetail,
  type CrmClientEvent,
  type CrmClientRow,
  type CrmClientStatus,
  type CrmClientSuggestions,
  type CrmContract,
  type CrmContractBilling,
  type CrmContractStatus,
} from "./crm-types";

type Q = Pick<PoolClient, "query">;

/** Who acts on clients: a person (CrmSession) or the automation "Lead convertido em cliente" (userId null). */
export type ClientActor = { userId: string | null; userName: string; caps: CrmCapabilities };

/** Today in Brasília, YYYY-MM-DD. */
export function todayBr(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
const TODAY_SQL = `(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

// ---------- reading ----------

type ClientDbRow = {
  id: string;
  company_id: string;
  company_name: string;
  segment: string | null;
  city: string | null;
  owner_id: string | null;
  owner_name: string | null;
  status: string;
  started_on: string | null;
  ended_on: string | null;
  end_reason: string | null;
  notes: string | null;
  services: string[] | null;
  monthly_cents: string | null;
  next_ends_on: string | null;
  days_left: number | null;
  active_contracts: string;
  decision_makers: { id: string; name: string }[] | null;
  tag_ids: string[] | null;
  created_at: Date;
  deal_id: string | null;
  created_by_name: string | null;
};

// DATE columns come back as text: node-postgres would turn them into local-midnight Dates.
const CLIENT_SELECT = `
  SELECT cl.id, cl.company_id, co.name AS company_name, co.segment, co.city, cl.owner_id, u.name AS owner_name, cl.status,
         cl.started_on::text AS started_on, cl.ended_on::text AS ended_on, cl.end_reason, cl.notes, cl.created_at, cl.deal_id,
         cb.name AS created_by_name,
         COALESCE((SELECT array_agg(DISTINCT sv ORDER BY sv) FROM crm_contracts k, unnest(k.services) sv
                   WHERE k.client_id = cl.id AND k.status = 'vigente'), '{}') AS services,
         (SELECT sum(k.value_cents) FROM crm_contracts k WHERE k.client_id = cl.id AND k.status = 'vigente' AND k.billing = 'mensal') AS monthly_cents,
         (SELECT min(k.ends_on)::text FROM crm_contracts k WHERE k.client_id = cl.id AND k.status = 'vigente') AS next_ends_on,
         (SELECT min(k.ends_on) - ${TODAY_SQL} FROM crm_contracts k WHERE k.client_id = cl.id AND k.status = 'vigente') AS days_left,
         (SELECT count(*) FROM crm_contracts k WHERE k.client_id = cl.id AND k.status = 'vigente') AS active_contracts,
         (SELECT json_agg(json_build_object('id', dm.id, 'name', dm.name) ORDER BY lower(dm.name))
            FROM crm_contacts dm WHERE dm.company_id = co.id AND dm.is_decision_maker AND dm.archived_at IS NULL) AS decision_makers,
         ARRAY(SELECT ct.tag_id FROM crm_company_tags ct WHERE ct.company_id = co.id ORDER BY ct.applied_at, ct.tag_id) AS tag_ids
  FROM crm_clients cl
  JOIN crm_companies co ON co.id = cl.company_id
  LEFT JOIN internal_users u ON u.id = cl.owner_id
  LEFT JOIN internal_users cb ON cb.id = cl.created_by`;

function mapClient(r: ClientDbRow, showValues: boolean): CrmClientRow {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name,
    segment: r.segment,
    city: r.city,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    status: isCrmClientStatus(r.status) ? r.status : "ativo",
    startedOn: r.started_on,
    endedOn: r.ended_on,
    endReason: r.end_reason,
    notes: r.notes,
    services: r.services ?? [],
    monthlyCents: showValues && r.monthly_cents !== null ? Number(r.monthly_cents) : null,
    nextEndsOn: r.next_ends_on,
    daysLeft: r.days_left === null ? null : Number(r.days_left),
    activeContracts: Number(r.active_contracts),
    decisionMakers: r.decision_makers ?? [],
    tagIds: r.tag_ids ?? [],
    createdAt: iso(r.created_at)!,
  };
}

export type ClientFilters = {
  /** "atuais" (default: all but encerrado), "todos", or one situation. */
  status?: string;
  /** "mine", "none" or a user id. */
  owner?: string;
  /** A service id: clients with a vigente contract for it. */
  service?: string;
  /** "30" / "60": a vigente contract ends within that many days; "vencido": one already ended. */
  renewal?: string;
  q?: string;
};

/** Clientes ativos this person may see, by company name. */
export async function listClients(s: CrmSession, f: ClientFilters): Promise<{ clients: CrmClientRow[]; valuesHidden: boolean }> {
  requireCap(s, "viewClients");
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    values.push(value);
    where.push(sql(values.length));
  };
  const status = f.status || "atuais";
  if (status === "atuais") where.push(`cl.status <> 'encerrado'`);
  else if (isCrmClientStatus(status)) add((n) => `cl.status = $${n}`, status);
  else if (status !== "todos") throw new CrmInputError("Situação inválida.");
  if (f.owner === "mine") add((n) => `cl.owner_id = $${n}`, s.userId);
  else if (f.owner === "none") where.push(`cl.owner_id IS NULL`);
  else if (f.owner && f.owner !== "all") add((n) => `cl.owner_id = $${n}`, f.owner);
  if (f.service) add((n) => `EXISTS (SELECT 1 FROM crm_contracts k WHERE k.client_id = cl.id AND k.status = 'vigente' AND $${n} = ANY(k.services))`, f.service);
  if (f.renewal === "30" || f.renewal === "60") {
    add((n) => `EXISTS (SELECT 1 FROM crm_contracts k WHERE k.client_id = cl.id AND k.status = 'vigente' AND k.ends_on BETWEEN ${TODAY_SQL} AND ${TODAY_SQL} + $${n}::int)`, Number(f.renewal));
  } else if (f.renewal === "vencido") {
    where.push(`EXISTS (SELECT 1 FROM crm_contracts k WHERE k.client_id = cl.id AND k.status = 'vigente' AND k.ends_on < ${TODAY_SQL})`);
  } else if (f.renewal) throw new CrmInputError("Filtro de renovação inválido.");
  const q = f.q?.trim();
  if (q) add((n) => `co.name ILIKE $${n}`, `%${escapeLike(q.slice(0, 100))}%`);
  const visible = visibleTo(s);
  if (visible) add((n) => `(cl.owner_id = $${n} OR cl.owner_id IS NULL)`, visible);
  const db = await getDb();
  const { rows } = await db.query<ClientDbRow>(`${CLIENT_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY lower(co.name), cl.id LIMIT 500`, values);
  return { clients: rows.map((r) => mapClient(r, s.caps.seeContractValues)), valuesHidden: !s.caps.seeContractValues };
}

const canSee = (s: ClientActor, ownerId: string | null) => s.caps.seeAllLeads || ownerId === null || ownerId === s.userId;
/** Changing a client (or creating one from an opportunity): someone else's only with "interagir em leads de outras pessoas". */
const canAct = (s: ClientActor, ownerId: string | null) => canSee(s, ownerId) && (s.caps.actOnAllLeads || ownerId === null || ownerId === s.userId);
const NOT_YOURS = "Este cliente é de outra pessoa: você pode consultar, mas só o responsável (ou um Gestor) altera. Peça a transferência.";

type ContractDbRow = {
  id: string;
  client_id: string;
  services: string[];
  starts_on: string;
  ends_on: string | null;
  value_cents: string | null;
  billing: string;
  status: string;
  notes: string | null;
  deal_id: string | null;
  deal_title: string | null;
  days_left: number | null;
  created_at: Date;
};

const CONTRACT_SELECT = `
  SELECT k.id, k.client_id, k.services, k.starts_on::text AS starts_on, k.ends_on::text AS ends_on, k.value_cents, k.billing, k.status,
         k.notes, k.deal_id, d.title AS deal_title, k.created_at,
         CASE WHEN k.status = 'vigente' AND k.ends_on IS NOT NULL THEN k.ends_on - ${TODAY_SQL} END AS days_left
  FROM crm_contracts k LEFT JOIN crm_deals d ON d.id = k.deal_id`;

function mapContract(r: ContractDbRow, showValues: boolean): CrmContract {
  return {
    id: r.id,
    clientId: r.client_id,
    services: r.services ?? [],
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    valueCents: showValues && r.value_cents !== null ? Number(r.value_cents) : null,
    billing: isCrmContractBilling(r.billing) ? r.billing : "mensal",
    status: isCrmContractStatus(r.status) ? r.status : "vigente",
    notes: r.notes,
    dealId: r.deal_id,
    dealTitle: r.deal_title,
    daysLeft: r.days_left === null ? null : Number(r.days_left),
    createdAt: iso(r.created_at)!,
  };
}

/** Money in the history is shown only to those who see contract values. */
function eventForViewer(e: CrmClientEvent, showValues: boolean): CrmClientEvent {
  if (showValues) return e;
  const payload = { ...e.payload };
  delete payload.value;
  if (Array.isArray(payload.changes)) payload.changes = (payload.changes as { money?: boolean }[]).filter((c) => !c.money);
  return { ...e, payload };
}

/** One client with its contracts and history; not found when this person can't see it. */
export async function getClient(s: CrmSession, id: string): Promise<CrmClientDetail> {
  requireCap(s, "viewClients");
  const db = await getDb();
  const { rows } = await db.query<ClientDbRow>(`${CLIENT_SELECT} WHERE cl.id = $1`, [id]);
  const r = rows[0];
  if (!r || !canSee(s, r.owner_id)) throw new CrmNotFoundError("Cliente não encontrado.");
  const show = s.caps.seeContractValues;
  const [contracts, events, reports] = await Promise.all([
    db.query<ContractDbRow>(`${CONTRACT_SELECT} WHERE k.client_id = $1 ORDER BY (k.status = 'vigente') DESC, k.starts_on DESC, k.created_at DESC`, [id]),
    db.query<{ id: string; kind: CrmClientEvent["kind"]; payload: Record<string, unknown>; user_name: string | null; created_at: Date }>(
      `SELECT id, kind, payload, user_name, created_at FROM crm_client_events WHERE client_id = $1 ORDER BY created_at DESC, id DESC LIMIT 300`,
      [id]
    ),
    db.query<ReportDbRow>(`${REPORT_SELECT} WHERE r.client_id = $1 ORDER BY r.month DESC`, [id]),
  ]);
  return {
    ...mapClient(r, show),
    dealId: r.deal_id,
    createdByName: r.created_by_name,
    contracts: contracts.rows.map((k) => mapContract(k, show)),
    reports: reports.rows.map(mapReport),
    events: events.rows.map((e) =>
      eventForViewer({ id: e.id, kind: e.kind, payload: e.payload ?? {}, userName: e.user_name, createdAt: iso(e.created_at)! }, show)
    ),
  };
}

/** What can become a client now: won opportunities without a contract (last 180 days) and companies marked "Cliente ativo" without a record. */
export async function listClientSuggestions(s: CrmSession): Promise<CrmClientSuggestions> {
  requireCap(s, "editClients");
  const visible = visibleTo(s);
  const db = await getDb();
  const [deals, companies] = await Promise.all([
    db.query<{
      id: string;
      title: string;
      contact_id: string;
      contact_name: string;
      company_id: string | null;
      company_name: string | null;
      closed_at: Date | null;
      client_id: string | null;
    }>(
      `SELECT d.id, d.title, c.id AS contact_id, c.name AS contact_name, co.id AS company_id, co.name AS company_name, d.closed_at, cl.id AS client_id
       FROM crm_deals d
       JOIN crm_contacts c ON c.id = d.contact_id
       LEFT JOIN crm_companies co ON co.id = c.company_id
       LEFT JOIN crm_clients cl ON cl.company_id = co.id
       WHERE d.stage = 'ganho' AND c.archived_at IS NULL AND d.closed_at >= now() - interval '180 days'
         AND NOT EXISTS (SELECT 1 FROM crm_contracts k WHERE k.deal_id = d.id)
         AND ($1::text IS NULL OR c.owner_id = $1 OR c.owner_id IS NULL)
         AND (cl.id IS NULL OR $1::text IS NULL OR cl.owner_id = $1 OR cl.owner_id IS NULL)
       ORDER BY d.closed_at DESC, d.id LIMIT 20`,
      [visible]
    ),
    db.query<{ id: string; name: string }>(
      `SELECT co.id, co.name FROM crm_companies co
       WHERE co.status = 'cliente_ativo' AND co.archived_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM crm_clients cl WHERE cl.company_id = co.id)
         AND ($1::text IS NULL OR co.owner_id = $1 OR co.owner_id IS NULL)
       ORDER BY lower(co.name), co.id LIMIT 20`,
      [visible]
    ),
  ]);
  return {
    deals: deals.rows.map((d) => ({
      dealId: d.id,
      title: d.title,
      contactId: d.contact_id,
      contactName: d.contact_name,
      companyId: d.company_id,
      companyName: d.company_name,
      closedAt: iso(d.closed_at),
      clientId: d.client_id,
    })),
    companies: companies.rows.map((c) => ({ companyId: c.id, companyName: c.name })),
  };
}

// ---------- writing ----------

async function addClientEvent(q: Q, clientId: string, kind: CrmClientEvent["kind"], payload: Record<string, unknown>, s: ClientActor): Promise<void> {
  await q.query(`INSERT INTO crm_client_events (id, client_id, kind, payload, user_id, user_name) VALUES ($1, $2, $3, $4, $5, $6)`, [
    randomUUID(),
    clientId,
    kind,
    JSON.stringify(payload),
    s.userId,
    s.userName,
  ]);
}

/** Someone active in the CRM, or null for "sem responsável". */
async function requireActiveUser(q: Q, id: string | null): Promise<{ id: string; name: string } | null> {
  if (!id) return null;
  const { rows } = await q.query<{ id: string; name: string }>(`SELECT id, name FROM internal_users WHERE id = $1 AND revoked_at IS NULL`, [id]);
  if (!rows[0]) throw new CrmInputError("Escolha um responsável ativo no CRM.");
  return rows[0];
}

export type ContractInput = { services?: unknown; startsOn?: unknown; endsOn?: unknown; value?: unknown; billing?: unknown; status?: unknown; notes?: unknown };

type ContractValues = {
  services: string[];
  startsOn: string;
  endsOn: string | null;
  valueCents: number | null;
  billing: CrmContractBilling;
  status: CrmContractStatus;
  notes: string | null;
};

function parseMoney(value: unknown): number | null {
  try {
    return parseMoneyToCents(value);
  } catch {
    throw new CrmInputError("Valor do contrato inválido.");
  }
}

/** A contract's fields from a form, on top of `base` (its current values, or the defaults). */
async function readContract(q: Q, s: ClientActor, input: ContractInput, base: ContractValues): Promise<ContractValues> {
  const out = { ...base };
  if (input.services !== undefined) {
    if (!Array.isArray(input.services)) throw new CrmInputError("Serviços inválidos.");
    const ids = [...new Set(input.services.filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, 20);
    for (const id of ids) await requireOptionId(q, "service", id, base.services.includes(id) ? id : null);
    out.services = ids;
  }
  if (input.startsOn !== undefined) {
    const d = parseDateOnly(input.startsOn, "Data de início");
    if (!d) throw new CrmInputError("Informe a data de início do contrato.");
    out.startsOn = d;
  }
  if (input.endsOn !== undefined) out.endsOn = parseDateOnly(input.endsOn, "Data de fim");
  if (out.endsOn && out.endsOn < out.startsOn) throw new CrmInputError("O fim do contrato não pode ser antes do início.");
  if (input.value !== undefined) {
    const cents = parseMoney(input.value);
    if (cents !== base.valueCents && !s.caps.seeContractValues) throw new CrmForbiddenError("Seu perfil não vê os valores dos contratos.");
    out.valueCents = cents;
  }
  if (input.billing !== undefined) {
    if (!isCrmContractBilling(input.billing)) throw new CrmInputError("Cobrança inválida: mensal ou valor único.");
    out.billing = input.billing;
  }
  if (input.status !== undefined) {
    if (!isCrmContractStatus(input.status)) throw new CrmInputError("Situação do contrato inválida.");
    out.status = input.status;
  }
  if (input.notes !== undefined) out.notes = cleanText(input.notes, 1000);
  return out;
}

async function serviceLabels(q: Q, ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of ids) out.push((await optionLabel(q, "service", id)) ?? id);
  return out;
}

const period = (k: { startsOn: string; endsOn: string | null }) => `${brDate(k.startsOn)} → ${k.endsOn ? brDate(k.endsOn) : "sem prazo"}`;

async function insertContract(q: Q, s: ClientActor, clientId: string, k: ContractValues, dealId: string | null, dealTitle: string | null): Promise<string> {
  const id = randomUUID();
  try {
    await q.query(
      `INSERT INTO crm_contracts (id, client_id, services, starts_on, ends_on, value_cents, billing, status, notes, deal_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, clientId, k.services, k.startsOn, k.endsOn, k.valueCents, k.billing, k.status, k.notes, dealId, s.userId]
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new CrmConflictError("Esta oportunidade já virou contrato.");
    throw err;
  }
  await addClientEvent(
    q,
    clientId,
    "contract_added",
    {
      contractId: id,
      services: await serviceLabels(q, k.services),
      period: period(k),
      value: k.valueCents,
      billing: k.billing,
      status: k.status,
      dealTitle,
    },
    s
  );
  return id;
}

export type ClientInput = {
  companyId?: unknown;
  dealId?: unknown;
  ownerId?: unknown;
  status?: unknown;
  startedOn?: unknown;
  notes?: unknown;
  contract?: ContractInput | null;
};

type DealForClient = {
  id: string;
  title: string;
  stage: string;
  owner_id: string | null;
  service: string | null;
  negotiated_cents: string | null;
  value_cents: string | null;
  closed_on: string | null;
  contact_name: string;
  contact_owner: string | null;
  company_id: string | null;
  client_id: string | null;
};

/**
 * Turns a won opportunity (`dealId`) or a company (`companyId`) into a
 * client. From an opportunity: company, responsible, start, service and the
 * negotiated value come from it, and it becomes the first contract — or a
 * new contract of the company's existing client. Doing it twice changes
 * nothing. A company that is already a client is refused (409).
 */
export async function createClient(s: CrmSession, input: ClientInput): Promise<{ id: string; created: boolean }> {
  requireCap(s, "editClients");
  const result = await withTransaction((q) => createClientTx(q, s, input));
  if (result.created) await auditClientCreated(s, result.id, result.companyName, typeof input.dealId === "string" && input.dealId ? "oportunidade" : "empresa");
  return { id: result.id, created: result.created };
}

export async function auditClientCreated(s: ClientActor, id: string, companyName: string | null, via: string): Promise<void> {
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: s.userId ? "admin" : "system",
    action: "crm.client_create",
    targetType: "crm_client",
    targetId: id,
    targetLabel: companyName,
    metadata: { via },
  });
}

/** createClient inside a transaction, without the permission check (the caller checked it, or it's the automation). */
export async function createClientTx(q: Q, s: ClientActor, input: ClientInput): Promise<{ id: string; created: boolean; companyName: string | null }> {
  {
    let deal: DealForClient | null = null;
    let companyId: string;
    if (typeof input.dealId === "string" && input.dealId) {
      const { rows } = await q.query<DealForClient>(
        `SELECT d.id, d.title, d.stage, d.owner_id, d.service, d.negotiated_cents, d.value_cents,
                (d.closed_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS closed_on,
                c.name AS contact_name, c.owner_id AS contact_owner, c.company_id,
                (SELECT k.client_id FROM crm_contracts k WHERE k.deal_id = d.id) AS client_id
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
         WHERE d.id = $1 FOR UPDATE OF d`,
        [input.dealId]
      );
      deal = rows[0] ?? null;
      if (!deal || !canSee(s, deal.contact_owner)) throw new CrmNotFoundError("Oportunidade não encontrada.");
      if (!canAct(s, deal.owner_id ?? deal.contact_owner)) throw new CrmForbiddenError("Esta oportunidade é de outra pessoa: só o responsável (ou um Gestor) a torna cliente.");
      if (deal.client_id) return { id: deal.client_id, created: false, companyName: null as string | null };
      if (deal.stage !== "ganho") throw new CrmInputError("Só uma oportunidade ganha vira cliente.");
      if (!deal.company_id) throw new CrmInputError(`Vincule ${deal.contact_name} a uma empresa antes: o cliente é sempre uma empresa.`);
      companyId = deal.company_id;
    } else if (typeof input.companyId === "string" && input.companyId) {
      companyId = input.companyId;
    } else {
      throw new CrmInputError("Escolha a empresa ou a oportunidade ganha.");
    }

    const co = await q.query<{ name: string; owner_id: string | null; archived: boolean }>(
      `SELECT name, owner_id, archived_at IS NOT NULL AS archived FROM crm_companies WHERE id = $1`,
      [companyId]
    );
    const company = co.rows[0];
    if (!company || (!deal && !canSee(s, company.owner_id))) throw new CrmNotFoundError("Empresa não encontrada.");
    if (!deal && !canAct(s, company.owner_id)) throw new CrmForbiddenError(`${company.name} está na carteira de outra pessoa.`);
    if (company.archived) throw new CrmInputError(`${company.name} está arquivada.`);

    const dealValues = (base: ContractValues): ContractValues =>
      deal
        ? {
            ...base,
            services: deal.service ? [deal.service] : [],
            startsOn: deal.closed_on ?? base.startsOn,
            valueCents: deal.negotiated_cents !== null ? Number(deal.negotiated_cents) : deal.value_cents !== null ? Number(deal.value_cents) : null,
          }
        : base;

    // Already a client: an opportunity adds a contract to it; a company is refused.
    const existing = await q.query<{ id: string; owner_id: string | null; status: string }>(`SELECT id, owner_id, status FROM crm_clients WHERE company_id = $1 FOR UPDATE`, [companyId]);
    if (existing.rows[0]) {
      const cl = existing.rows[0];
      if (!deal) throw new CrmConflictError(`${company.name} já é cliente.`);
      if (!canAct(s, cl.owner_id)) throw new CrmForbiddenError(`${company.name} já é cliente, na carteira de outra pessoa.`);
      const base = dealValues({ services: [], startsOn: todayBr(), endsOn: null, valueCents: null, billing: "mensal", status: "vigente", notes: null });
      const k = await readContract(q, s, { ...(input.contract ?? {}), value: undefined }, base);
      if (k.status === "vigente" && cl.status === "encerrado") throw new CrmInputError(`${company.name} está encerrado como cliente. Reative-o antes de registrar um contrato vigente.`);
      await insertContract(q, s, cl.id, k, deal.id, deal.title);
      await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [cl.id]);
      return { id: cl.id, created: false, companyName: company.name };
    }

    // Responsible: the one asked for, else the opportunity's (or its contact's), else whoever is creating it.
    let ownerId: string | null;
    if (input.ownerId !== undefined) {
      ownerId = typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null;
      if (!canAssignOwner(s.caps, s.userId ?? "", ownerId, null)) throw new CrmForbiddenError("Seu perfil só pode deixar o cliente com você ou sem responsável.");
    } else {
      ownerId = deal?.owner_id ?? deal?.contact_owner ?? company.owner_id ?? s.userId;
      if (!canAssignOwner(s.caps, s.userId ?? "", ownerId, null)) ownerId = s.userId;
    }
    const owner = await requireActiveUser(q, ownerId).catch(async (err) => {
      if (input.ownerId !== undefined) throw err;
      return requireActiveUser(q, s.userId); // a deactivated default owner: the client starts with whoever creates it
    });
    let status: CrmClientStatus = "onboarding";
    if (input.status !== undefined && input.status !== null && input.status !== "") {
      if (!isCrmClientStatus(input.status) || input.status === "encerrado") throw new CrmInputError("Um cliente começa em Onboarding, Ativo ou Pausado.");
      status = input.status;
    }
    const startedOn = parseDateOnly(input.startedOn, "Data de início") ?? deal?.closed_on ?? todayBr();
    const id = randomUUID();
    const ins = await q.query(
      `INSERT INTO crm_clients (id, company_id, owner_id, status, started_on, notes, deal_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (company_id) DO NOTHING`,
      [id, companyId, owner?.id ?? null, status, startedOn, cleanText(input.notes, 2000), deal?.id ?? null, s.userId]
    );
    if (ins.rowCount === 0) throw new CrmConflictError(`${company.name} acabou de virar cliente. Abra o cadastro dela.`);
    await q.query(`UPDATE crm_companies SET status = 'cliente_ativo', updated_at = now() WHERE id = $1`, [companyId]);
    await addClientEvent(
      q,
      id,
      "created",
      { via: deal ? "oportunidade" : "empresa", dealTitle: deal?.title ?? null, status: clientStatusLabel(status), owner: owner?.name ?? null, startedOn },
      s
    );
    if (deal || input.contract) {
      const base = dealValues({ services: [], startsOn: startedOn, endsOn: null, valueCents: null, billing: "mensal", status: "vigente", notes: null });
      // From an opportunity the value is the negotiated one; a form may adjust it only with the right to see values.
      const k = await readContract(q, s, input.contract ?? {}, base);
      await insertContract(q, s, id, k, deal?.id ?? null, deal?.title ?? null);
    }
    return { id, created: true, companyName: company.name };
  }
}

type ClientLock = { id: string; company_id: string; company_name: string; owner_id: string | null; owner_name: string | null; status: string; started_on: string | null; notes: string | null };

/** The client, locked, after checking this person may edit it. */
async function lockClient(q: Q, s: CrmSession, id: string): Promise<ClientLock> {
  requireCap(s, "editClients");
  const { rows } = await q.query<ClientLock>(
    `SELECT cl.id, cl.company_id, co.name AS company_name, cl.owner_id, u.name AS owner_name, cl.status, cl.started_on::text AS started_on, cl.notes
     FROM crm_clients cl JOIN crm_companies co ON co.id = cl.company_id LEFT JOIN internal_users u ON u.id = cl.owner_id
     WHERE cl.id = $1 FOR UPDATE OF cl`,
    [id]
  );
  const r = rows[0];
  if (!r || !canSee(s, r.owner_id)) throw new CrmNotFoundError("Cliente não encontrado.");
  if (!canAct(s, r.owner_id)) throw new CrmForbiddenError(NOT_YOURS);
  return r;
}

export type ClientPatch = { ownerId?: unknown; status?: unknown; endReason?: unknown; endedOn?: unknown; startedOn?: unknown; notes?: unknown };

/**
 * Edits a client: responsible, situation, start and observações. Ending it
 * (Encerrado) asks for the reason, closes its vigente contracts and turns the
 * company into "Ex-cliente"; reactivating it brings the company back to
 * "Cliente ativo". Every change goes to the history.
 */
export async function updateClient(s: CrmSession, id: string, patch: ClientPatch): Promise<void> {
  const audit = await withTransaction(async (q) => {
    const cur = await lockClient(q, s, id);
    const sets: string[] = [];
    const values: unknown[] = [id];
    const set = (col: string, v: unknown) => {
      values.push(v);
      sets.push(`${col} = $${values.length}`);
    };
    const changes: { field: string; from: string | null; to: string | null }[] = [];
    let statusChange: { from: string; to: string; reason: string | null; closed: number } | null = null;
    let ownerChange: { from: string | null; to: string | null } | null = null;

    if (patch.ownerId !== undefined) {
      const next = typeof patch.ownerId === "string" && patch.ownerId ? patch.ownerId : null;
      if (next !== cur.owner_id) {
        if (!canAssignOwner(s.caps, s.userId, next, cur.owner_id)) throw new CrmForbiddenError("Seu perfil só pode assumir clientes sem responsável ou deixar os seus.");
        const owner = await requireActiveUser(q, next);
        set("owner_id", next);
        ownerChange = { from: cur.owner_name, to: owner?.name ?? null };
        changes.push({ field: "Responsável", from: cur.owner_name ?? "sem responsável", to: owner?.name ?? "sem responsável" });
      }
    }
    if (patch.startedOn !== undefined) {
      const d = parseDateOnly(patch.startedOn, "Data de início");
      if (d !== cur.started_on) {
        set("started_on", d);
        changes.push({ field: "Cliente desde", from: brDate(cur.started_on), to: brDate(d) });
      }
    }
    if (patch.notes !== undefined) {
      const n = cleanText(patch.notes, 2000);
      if (n !== cur.notes) {
        set("notes", n);
        changes.push({ field: "Observações", from: null, to: null });
      }
    }
    if (patch.status !== undefined && patch.status !== cur.status) {
      if (!isCrmClientStatus(patch.status)) throw new CrmInputError("Situação inválida.");
      const to = patch.status;
      let reason: string | null = null;
      let closed = 0;
      if (to === "encerrado") {
        reason = cleanText(patch.endReason, 300);
        if (!reason) throw new CrmInputError("Informe o motivo do encerramento.");
        const endedOn = parseDateOnly(patch.endedOn, "Data de encerramento") ?? todayBr();
        set("ended_on", endedOn);
        set("end_reason", reason);
        const c = await q.query(`UPDATE crm_contracts SET status = 'encerrado', updated_at = now() WHERE client_id = $1 AND status = 'vigente'`, [id]);
        closed = c.rowCount ?? 0;
        await q.query(`UPDATE crm_companies SET status = 'ex_cliente', updated_at = now() WHERE id = $1`, [cur.company_id]);
      } else if (cur.status === "encerrado") {
        set("ended_on", null);
        set("end_reason", null);
        await q.query(`UPDATE crm_companies SET status = 'cliente_ativo', updated_at = now() WHERE id = $1`, [cur.company_id]);
      }
      set("status", to);
      statusChange = { from: cur.status, to, reason, closed };
    }
    if (sets.length === 0) return null;
    await q.query(`UPDATE crm_clients SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, values);
    if (statusChange) {
      await addClientEvent(
        q,
        id,
        "status",
        { from: clientStatusLabel(statusChange.from), to: clientStatusLabel(statusChange.to), reason: statusChange.reason, closedContracts: statusChange.closed },
        s
      );
    }
    if (changes.length) await addClientEvent(q, id, "edited", { changes }, s);
    return statusChange || ownerChange ? { name: cur.company_name, statusChange, ownerChange } : null;
  });
  if (audit) {
    await writeAudit({
      actorUserId: s.userId,
      actorLabel: s.userName,
      actorKind: "admin",
      action: "crm.client_update",
      targetType: "crm_client",
      targetId: id,
      targetLabel: audit.name,
      metadata: {
        ...(audit.statusChange ? { status: `${clientStatusLabel(audit.statusChange.from)} → ${clientStatusLabel(audit.statusChange.to)}`, reason: audit.statusChange.reason } : {}),
        ...(audit.ownerChange ? { owner: `${audit.ownerChange.from ?? "sem responsável"} → ${audit.ownerChange.to ?? "sem responsável"}` } : {}),
      },
    });
  }
}

/** A new contract for a client. */
export async function addContract(s: CrmSession, clientId: string, input: ContractInput): Promise<string> {
  const out = await withTransaction(async (q) => {
    const cl = await lockClient(q, s, clientId);
    const k = await readContract(q, s, input, { services: [], startsOn: todayBr(), endsOn: null, valueCents: null, billing: "mensal", status: "vigente", notes: null });
    if (input.startsOn === undefined || input.startsOn === null || input.startsOn === "") throw new CrmInputError("Informe a data de início do contrato.");
    if (k.services.length === 0) throw new CrmInputError("Escolha pelo menos um serviço do contrato.");
    if (k.status === "vigente" && cl.status === "encerrado") throw new CrmInputError("Este cliente está encerrado. Reative-o antes de registrar um contrato vigente.");
    const id = await insertContract(q, s, clientId, k, null, null);
    await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [clientId]);
    return { id, name: cl.company_name, k };
  });
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.contract_change",
    targetType: "crm_client",
    targetId: clientId,
    targetLabel: out.name,
    metadata: { contractId: out.id, action: "criado", period: period(out.k) },
  });
  return out.id;
}

/** Edits a contract (services, period, value, billing, situation, notes); the changes go to the history. */
export async function updateContract(s: CrmSession, clientId: string, contractId: string, input: ContractInput): Promise<void> {
  const out = await withTransaction(async (q) => {
    const cl = await lockClient(q, s, clientId);
    const { rows } = await q.query<ContractDbRow>(`${CONTRACT_SELECT} WHERE k.id = $1 AND k.client_id = $2 FOR UPDATE OF k`, [contractId, clientId]);
    const cur = rows[0];
    if (!cur) throw new CrmNotFoundError("Contrato não encontrado.");
    const before: ContractValues = {
      services: cur.services ?? [],
      startsOn: cur.starts_on,
      endsOn: cur.ends_on,
      valueCents: cur.value_cents === null ? null : Number(cur.value_cents),
      billing: isCrmContractBilling(cur.billing) ? cur.billing : "mensal",
      status: isCrmContractStatus(cur.status) ? cur.status : "vigente",
      notes: cur.notes,
    };
    const after = await readContract(q, s, input, before);
    if (input.services !== undefined && after.services.length === 0) throw new CrmInputError("Escolha pelo menos um serviço do contrato.");
    if (after.status === "vigente" && before.status !== "vigente" && cl.status === "encerrado") {
      throw new CrmInputError("Este cliente está encerrado. Reative-o antes de deixar um contrato vigente.");
    }
    const changes: { field: string; from: string | null; to: string | null; money?: boolean }[] = [];
    if (after.services.join() !== before.services.join()) {
      changes.push({ field: "Serviços", from: (await serviceLabels(q, before.services)).join(", ") || "nenhum", to: (await serviceLabels(q, after.services)).join(", ") || "nenhum" });
    }
    if (after.startsOn !== before.startsOn || after.endsOn !== before.endsOn) changes.push({ field: "Vigência", from: period(before), to: period(after) });
    if (after.valueCents !== before.valueCents) {
      changes.push({ field: "Valor", from: before.valueCents === null ? "sem valor" : formatBRL(before.valueCents), to: after.valueCents === null ? "sem valor" : formatBRL(after.valueCents), money: true });
    }
    if (after.billing !== before.billing) changes.push({ field: "Cobrança", from: before.billing === "mensal" ? "Mensal" : "Valor único", to: after.billing === "mensal" ? "Mensal" : "Valor único" });
    if (after.status !== before.status) changes.push({ field: "Situação", from: contractStatusLabel(before.status), to: contractStatusLabel(after.status) });
    if (after.notes !== before.notes) changes.push({ field: "Observações do contrato", from: null, to: null });
    if (changes.length === 0) return null;
    await q.query(
      `UPDATE crm_contracts SET services = $2, starts_on = $3, ends_on = $4, value_cents = $5, billing = $6, status = $7, notes = $8, updated_at = now() WHERE id = $1`,
      [contractId, after.services, after.startsOn, after.endsOn, after.valueCents, after.billing, after.status, after.notes]
    );
    await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [clientId]);
    await addClientEvent(q, clientId, "contract_edited", { contractId, label: `Contrato de ${brDate(before.startsOn)}`, changes }, s);
    return { name: cl.company_name, fields: changes.map((c) => c.field) };
  });
  if (out) {
    await writeAudit({
      actorUserId: s.userId,
      actorLabel: s.userName,
      actorKind: "admin",
      action: "crm.contract_change",
      targetType: "crm_client",
      targetId: clientId,
      targetLabel: out.name,
      metadata: { contractId, action: "editado", fields: out.fields },
    });
  }
}

/** "Registrar no histórico": a note about the relationship (a meeting, a call, a complaint...). */
export async function addClientNote(s: CrmSession, clientId: string, text: unknown): Promise<void> {
  const body = cleanText(text, 2000);
  if (!body) throw new CrmInputError("Escreva o que aconteceu.");
  await withTransaction(async (q) => {
    await lockClient(q, s, clientId);
    await addClientEvent(q, clientId, "note", { text: body }, s);
    await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [clientId]);
  });
}

// ---------- acompanhamento mensal (Fase 5, entrega 2) ----------

type ReportDbRow = {
  id: string;
  client_id: string;
  month: string;
  services: string[] | null;
  activities: string | null;
  results: string | null;
  attention: string | null;
  next_actions: string | null;
  owner_id: string | null;
  owner_name: string | null;
  updated_by_name: string | null;
  updated_at: Date;
  created_at: Date;
};

const REPORT_SELECT = `
  SELECT r.id, r.client_id, to_char(r.month, 'YYYY-MM') AS month, r.services, r.activities, r.results, r.attention, r.next_actions,
         r.owner_id, ru.name AS owner_name, r.updated_by_name, r.updated_at, r.created_at
  FROM crm_client_reports r LEFT JOIN internal_users ru ON ru.id = r.owner_id`;

function mapReport(r: ReportDbRow): CrmClientReport {
  return {
    id: r.id,
    clientId: r.client_id,
    month: r.month,
    services: r.services ?? [],
    activities: r.activities,
    results: r.results,
    attention: r.attention,
    nextActions: r.next_actions,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    updatedByName: r.updated_by_name,
    updatedAt: iso(r.updated_at)!,
    createdAt: iso(r.created_at)!,
  };
}

/** This month in Brasília, "YYYY-MM". */
export function currentMonthBr(now = new Date()): string {
  return todayBr(now).slice(0, 7);
}

export type ReportInput = {
  month?: unknown;
  services?: unknown;
  activities?: unknown;
  results?: unknown;
  attention?: unknown;
  nextActions?: unknown;
  ownerId?: unknown;
  /** The updatedAt the form was opened with: someone else saving in between is refused (409) instead of overwritten. */
  expectedUpdatedAt?: unknown;
};

const REPORT_FIELDS = [
  ["activities", "activities", "Atividades executadas"],
  ["results", "results", "Resultados"],
  ["attention", "attention", "Pontos de atenção"],
  ["nextActions", "next_actions", "Próximas ações"],
] as const;

/**
 * Registers (or updates) the client's acompanhamento of a month: services
 * done, activities, results, points of attention, next actions and who is
 * responsible for it. One per client per month; a future month is refused.
 * Every save goes to the client's history with what changed.
 */
export async function saveReport(s: CrmSession, clientId: string, input: ReportInput): Promise<void> {
  await withTransaction(async (q) => {
    const cl = await lockClient(q, s, clientId);
    if (!isMonth(input.month)) throw new CrmInputError("Escolha o mês de referência.");
    const month = input.month;
    if (month > currentMonthBr()) throw new CrmInputError("O acompanhamento é de um mês que já começou.");
    const { rows } = await q.query<ReportDbRow>(`${REPORT_SELECT} WHERE r.client_id = $1 AND r.month = $2::date FOR UPDATE OF r`, [clientId, `${month}-01`]);
    const cur = rows[0] ?? null;
    if (cur && typeof input.expectedUpdatedAt === "string" && input.expectedUpdatedAt && iso(cur.updated_at) !== input.expectedUpdatedAt) {
      throw new CrmConflictError(`${cur.updated_by_name ?? "Alguém"} salvou o acompanhamento de ${monthLabel(month)} enquanto você editava. Abra de novo para ver o que mudou.`);
    }
    if (!cur && typeof input.expectedUpdatedAt === "string" && input.expectedUpdatedAt) {
      throw new CrmConflictError(`O acompanhamento de ${monthLabel(month)} não existe mais. Abra de novo.`);
    }

    // services
    let services = cur?.services ?? [];
    if (input.services !== undefined) {
      if (!Array.isArray(input.services)) throw new CrmInputError("Serviços inválidos.");
      const ids = [...new Set(input.services.filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, 20);
      for (const id of ids) await requireOptionId(q, "service", id, services.includes(id) ? id : null);
      services = ids;
    }
    const texts: Record<string, string | null> = {};
    for (const [key, col] of REPORT_FIELDS) {
      const v = input[key];
      texts[col] = v !== undefined ? cleanText(v, 4000) : (cur?.[col] ?? null);
    }
    if (services.length === 0 && Object.values(texts).every((t) => !t)) throw new CrmInputError("Preencha pelo menos um campo do acompanhamento.");

    // responsible: the one chosen (same rule as the client's responsible), else the current one, else the client's.
    let ownerId: string | null = cur ? cur.owner_id : cl.owner_id;
    if (input.ownerId !== undefined) {
      const next = typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null;
      if (next !== ownerId) {
        if (!canAssignOwner(s.caps, s.userId, next, ownerId)) throw new CrmForbiddenError("Seu perfil só pode assumir o acompanhamento ou deixar o seu.");
        await requireActiveUser(q, next);
        ownerId = next;
      }
    }

    const changed: string[] = [];
    if (cur) {
      if (services.join() !== (cur.services ?? []).join()) changed.push("Serviços realizados");
      for (const [, col, label] of REPORT_FIELDS) if (texts[col] !== cur[col]) changed.push(label);
      if (ownerId !== cur.owner_id) changed.push("Responsável");
      if (changed.length === 0) return;
      await q.query(
        `UPDATE crm_client_reports SET services = $2, activities = $3, results = $4, attention = $5, next_actions = $6, owner_id = $7,
                updated_by = $8, updated_by_name = $9, updated_at = now() WHERE id = $1`,
        [cur.id, services, texts.activities, texts.results, texts.attention, texts.next_actions, ownerId, s.userId, s.userName]
      );
    } else {
      await q.query(
        `INSERT INTO crm_client_reports (id, client_id, month, services, activities, results, attention, next_actions, owner_id, created_by, updated_by, updated_by_name)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $10, $11)`,
        [randomUUID(), clientId, `${month}-01`, services, texts.activities, texts.results, texts.attention, texts.next_actions, ownerId, s.userId, s.userName]
      );
    }
    await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [clientId]);
    await addClientEvent(q, clientId, "report", { month, monthLabel: monthLabel(month), action: cur ? "edited" : "created", fields: changed }, s);
  });
}

/**
 * "Acompanhamento de clientes": the clients that were current in `month`
 * (started by then; not encerrado before it), with that month's
 * acompanhamento if there is one. Comercial: only theirs (and unassigned).
 */
export async function listFollowUp(s: CrmSession, monthRaw: unknown): Promise<{ month: string; rows: CrmFollowUpRow[] }> {
  requireCap(s, "viewClients");
  const month = isMonth(monthRaw) ? monthRaw : currentMonthBr();
  const first = `${month}-01`;
  const visible = visibleTo(s);
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    company_name: string;
    status: string;
    owner_id: string | null;
    owner_name: string | null;
    services: string[] | null;
    report_owner: string | null;
    report_by: string | null;
    report_at: Date | null;
    report_attention: string | null;
  }>(
    `SELECT cl.id, co.name AS company_name, cl.status, cl.owner_id, u.name AS owner_name,
            COALESCE((SELECT array_agg(DISTINCT sv ORDER BY sv) FROM crm_contracts k, unnest(k.services) sv
                      WHERE k.client_id = cl.id AND k.status = 'vigente'), '{}') AS services,
            ru.name AS report_owner, r.updated_by_name AS report_by, r.updated_at AS report_at, r.attention AS report_attention
     FROM crm_clients cl
     JOIN crm_companies co ON co.id = cl.company_id
     LEFT JOIN internal_users u ON u.id = cl.owner_id
     LEFT JOIN crm_client_reports r ON r.client_id = cl.id AND r.month = $1::date
     LEFT JOIN internal_users ru ON ru.id = r.owner_id
     WHERE (cl.started_on IS NULL OR cl.started_on < ($1::date + interval '1 month'))
       AND (cl.status <> 'encerrado' OR cl.ended_on >= $1::date OR r.id IS NOT NULL)
       AND ($2::text IS NULL OR cl.owner_id = $2 OR cl.owner_id IS NULL)
     ORDER BY (r.id IS NULL) DESC, lower(co.name), cl.id
     LIMIT 500`,
    [first, visible]
  );
  return {
    month,
    rows: rows.map((r) => ({
      clientId: r.id,
      companyName: r.company_name,
      status: isCrmClientStatus(r.status) ? r.status : "ativo",
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      services: r.services ?? [],
      report: r.report_at ? { ownerName: r.report_owner, updatedByName: r.report_by, updatedAt: iso(r.report_at)!, attention: r.report_attention } : null,
    })),
  };
}
