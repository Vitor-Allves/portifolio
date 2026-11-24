// Server-only. Propostas e orçamentos (evolução v1.0, item 3).
//
// A proposal belongs to an opportunity (and through it to the lead, the
// company and the salesperson who owns the opportunity — the "responsável
// comercial"). Its content lives in versions: while the current version was
// never sent it is a draft edited in place; once sent it is frozen, and any
// change makes the next version (with the reason and what changed). Sending
// is registered by the salesperson (link, WhatsApp, e-mail, PDF, meeting —
// the CRM sends nothing by itself). The client opens the public link
// (/proposta/<code>), which marks it "visualizada" only when the page really
// runs in a browser, and approves or refuses it there; the decision keeps
// who, e-mail, document, version, the content's fingerprint, IP and browser.
// A discount above the limit (Personalização) waits for a Gestor.

import { createHash, randomBytes, randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { writeAudit } from "./audit-log";
import { CrmConflictError, CrmForbiddenError, CrmInputError, CrmNotFoundError, addEvent, cleanText, iso, type CrmActor } from "./crm-core";
import { canAct, canSee, requireCap, type CrmSession } from "./crm-access";
import { parseMoneyToCents } from "./crm-types";
import { updateDealTx } from "./crm-deals";
import { approvers } from "./crm-transfers";
import {
  PROPOSAL_FINAL,
  PROPOSAL_OPEN,
  canonicalJson,
  isProposalBillingPeriod,
  isProposalChannel,
  isProposalStatus,
  proposalNumber,
  proposalStatusLabel,
  proposalTotals,
  type CrmProposalApproval,
  type CrmProposalDetail,
  type CrmProposalEvent,
  type CrmProposalSummary,
  type CrmProposalTemplate,
  type CrmProposalVersion,
  type ProposalChange,
  type ProposalContent,
  type ProposalItem,
  type ProposalStatus,
} from "./crm-proposal-types";

type Q = Pick<PoolClient, "query">;

export const DEFAULT_DISCOUNT_LIMIT_PCT = 10;
export const DEFAULT_VALID_DAYS = 15;

// ---------- dates (Brazil) ----------

/** Today in São Paulo, YYYY-MM-DD. */
export function todayBR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function parseDay(v: unknown, what: string, required: boolean): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new CrmInputError(`Informe ${what}.`);
    return null;
  }
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`)))
    throw new CrmInputError(`${what[0].toUpperCase()}${what.slice(1)}: data inválida.`);
  return v;
}
const dayOf = (d: Date | string | null): string | null => (d === null ? null : typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));

// ---------- settings ----------

export async function getDiscountLimit(q?: Q): Promise<number> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<{ value: { pct?: number } }>(`SELECT value FROM crm_settings WHERE key = 'proposal_discount_limit'`);
  const pct = rows[0]?.value?.pct;
  return typeof pct === "number" ? pct : DEFAULT_DISCOUNT_LIMIT_PCT;
}

export async function setDiscountLimit(s: CrmSession, value: unknown): Promise<number> {
  requireCap(s, "customize");
  const n = typeof value === "string" ? Number(value.replace("%", "").replace(",", ".").trim()) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) throw new CrmInputError("Desconto máximo inválido: use um número de 0 a 100.");
  const pct = Math.round(n * 10) / 10;
  const before = await getDiscountLimit();
  const db = await getDb();
  await db.query(
    `INSERT INTO crm_settings (key, value, updated_by_name) VALUES ('proposal_discount_limit', $1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by_name = EXCLUDED.updated_by_name, updated_at = now()`,
    [JSON.stringify({ pct }), s.userName],
  );
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.proposal_settings",
    targetType: "crm_settings",
    targetId: "proposal_discount_limit",
    targetLabel: "Desconto máximo sem autorização",
    metadata: { from: before, to: pct },
  });
  return pct;
}

// ---------- items and content ----------

type ServiceRow = { id: string; label: string; meta: Record<string, unknown> | null; archived_at: Date | null };
async function services(q: Q): Promise<Map<string, ServiceRow>> {
  const { rows } = await q.query<ServiceRow>(`SELECT id, label, meta, archived_at FROM crm_options WHERE kind = 'service'`);
  return new Map(rows.map((r) => [r.id, r]));
}

function parseQuantity(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".").trim()) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > 100000) throw new CrmInputError("Quantidade inválida.");
  return Math.round(n * 100) / 100;
}

/** "10%" → that percentage of the line; "150" or "150,00" → R$ 150. */
function parseDiscount(v: unknown, gross: number): { cents: number; pct: number | null } {
  if (v === undefined || v === null || v === "" || v === 0) return { cents: 0, pct: null };
  if (typeof v === "string" && v.trim().endsWith("%")) {
    const pct = Number(v.trim().slice(0, -1).replace(",", ".").trim());
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new CrmInputError("Desconto inválido: use um percentual de 0 a 100.");
    return { cents: Math.round((gross * pct) / 100), pct: Math.round(pct * 10) / 10 };
  }
  let cents: number | null;
  try {
    cents = parseMoneyToCents(v);
  } catch {
    throw new CrmInputError("Desconto inválido — use, por exemplo, 150,00 ou 10%.");
  }
  if (cents === null) return { cents: 0, pct: null };
  if (cents < 0) throw new CrmInputError("Desconto inválido.");
  return { cents, pct: null };
}

export function parseItems(input: unknown, catalog: Map<string, ServiceRow>): ProposalItem[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new CrmInputError("Serviços inválidos.");
  if (input.length > 50) throw new CrmInputError("No máximo 50 serviços por proposta.");
  return input.map((raw, i) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const serviceId = typeof it.serviceId === "string" && it.serviceId ? it.serviceId : null;
    const svc = serviceId ? catalog.get(serviceId) : undefined;
    if (serviceId && !svc) throw new CrmInputError(`Serviço ${i + 1}: não está no catálogo.`);
    const name = cleanText(it.name, 160) ?? svc?.label ?? null;
    if (!name) throw new CrmInputError(`Serviço ${i + 1}: informe o nome.`);
    const quantity = parseQuantity(it.quantity ?? 1);
    let unitCents: number | null;
    try {
      const raw = it.unitValue !== undefined ? it.unitValue : typeof it.unitCents === "number" ? it.unitCents / 100 : null;
      unitCents = parseMoneyToCents(raw);
    } catch {
      throw new CrmInputError(`${name}: valor unitário inválido.`);
    }
    if (unitCents === null) {
      const ref = svc?.meta?.referenceCents;
      unitCents = typeof ref === "number" ? ref : 0;
    }
    if (unitCents < 0) throw new CrmInputError(`${name}: valor unitário inválido.`);
    const billing = it.billing === "unico" || it.billing === "mensal" ? it.billing : svc?.meta?.billing === "unico" ? "unico" : "mensal";
    const gross = Math.round(quantity * unitCents);
    const d = parseDiscount(it.discount, gross);
    if (d.cents > gross) throw new CrmInputError(`${name}: o desconto é maior que o valor.`);
    return { serviceId, name, description: cleanText(it.description, 2000), quantity, unitCents, billing, discountCents: d.cents, discountPct: d.pct };
  });
}

type ProposalRow = {
  id: string;
  number: number;
  deal_id: string;
  contact_id: string;
  company_id: string | null;
  title: string;
  status: ProposalStatus;
  version: number;
  sent_version: number | null;
  total_cents: string;
  monthly_cents: string;
  one_time_cents: string;
  discount_pct: string;
  discount_authorized_pct: string | null;
  discount_authorized_by_name: string | null;
  issue_date: Date | string;
  valid_until: Date | string;
  share_token: string | null;
  share_token_at: Date | null;
  sent_at: Date | null;
  viewed_at: Date | null;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deal_title: string;
  deal_owner: string | null;
  deal_stage: string;
  contact_name: string;
  contact_owner: string | null;
  company_name: string | null;
  owner_name: string | null;
};
const SELECT = `
  SELECT p.*, d.title AS deal_title, d.owner_id AS deal_owner, d.stage AS deal_stage, c.name AS contact_name, c.owner_id AS contact_owner,
         co.name AS company_name, u.name AS owner_name
  FROM crm_proposals p
  JOIN crm_deals d ON d.id = p.deal_id
  JOIN crm_contacts c ON c.id = p.contact_id
  LEFT JOIN crm_companies co ON co.id = p.company_id
  LEFT JOIN internal_users u ON u.id = d.owner_id`;

/** Whose the proposal is: the opportunity's owner (or, without one, the lead's). */
const ownerOf = (r: Pick<ProposalRow, "deal_owner" | "contact_owner">) => r.deal_owner ?? r.contact_owner;

function pending(r: Pick<ProposalRow, "discount_pct" | "discount_authorized_pct">, limit: number): boolean {
  const pct = Number(r.discount_pct);
  if (pct <= limit) return false;
  return r.discount_authorized_pct === null || pct > Number(r.discount_authorized_pct);
}

function summary(r: ProposalRow, limit: number): CrmProposalSummary {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    status: r.status,
    version: r.version,
    sentVersion: r.sent_version,
    dealId: r.deal_id,
    dealTitle: r.deal_title,
    contactId: r.contact_id,
    contactName: r.contact_name,
    companyId: r.company_id,
    companyName: r.company_name,
    ownerId: ownerOf(r),
    ownerName: r.owner_name,
    totalCents: Number(r.total_cents),
    monthlyCents: Number(r.monthly_cents),
    oneTimeCents: Number(r.one_time_cents),
    discountPct: Number(r.discount_pct),
    validUntil: dayOf(r.valid_until)!,
    issueDate: dayOf(r.issue_date)!,
    discountPending: pending(r, limit),
    sentAt: iso(r.sent_at),
    viewedAt: iso(r.viewed_at),
    decidedAt: iso(r.decided_at),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

/** The client's data frozen in a version (as it is when saved). */
async function clientSnapshot(q: Q, contactId: string): Promise<ProposalContent["client"]> {
  const { rows } = await q.query<{ name: string; email: string | null; company: string | null; cnpj: string | null }>(
    `SELECT c.name, c.email, COALESCE(co.name, c.company) AS company, co.cnpj FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id WHERE c.id = $1`,
    [contactId],
  );
  const r = rows[0];
  return { contactName: r?.name ?? "—", companyName: r?.company ?? null, cnpj: r?.cnpj ?? null, email: r?.email ?? null };
}

export function contentHash(c: ProposalContent): string {
  return createHash("sha256").update(canonicalJson(c)).digest("hex");
}

/** What changed between two versions, in words a person reads. */
export function diffContent(a: ProposalContent, b: ProposalContent): ProposalChange[] {
  const out: ProposalChange[] = [];
  const money = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const push = (field: string, from: string | null, to: string | null) => from !== to && out.push({ field, from, to });
  push("Título", a.title, b.title);
  push("Total", money(a.totals.totalCents), money(b.totals.totalCents));
  push("Mensal", money(a.totals.monthlyCents), money(b.totals.monthlyCents));
  push("Valor único", money(a.totals.oneTimeCents), money(b.totals.oneTimeCents));
  push("Descontos", `${money(a.totals.discountCents)} (${a.totals.discountPct}%)`, `${money(b.totals.discountCents)} (${b.totals.discountPct}%)`);
  push("Emissão", a.issueDate, b.issueDate);
  push("Validade", a.validUntil, b.validUntil);
  push("Vencimento", a.dueDate, b.dueDate);
  push("Condições de pagamento", a.paymentTerms, b.paymentTerms);
  push("Periodicidade", a.billingPeriod, b.billingPeriod);
  push("Prazo de execução", a.executionTerm, b.executionTerm);
  push("Observações", a.notes, b.notes);
  push("Apresentação", a.intro, b.intro);
  const line = (i: ProposalItem) =>
    `${i.quantity} × ${money(i.unitCents)}${i.discountCents ? ` − ${money(i.discountCents)}` : ""} (${i.billing === "mensal" ? "mensal" : "único"})`;
  const before = new Map(a.items.map((i) => [i.name, i]));
  const after = new Map(b.items.map((i) => [i.name, i]));
  for (const [name, i] of after) {
    const old = before.get(name);
    if (!old) out.push({ field: `Serviço incluído: ${name}`, from: null, to: line(i) });
    else if (line(old) !== line(i) || old.description !== i.description) out.push({ field: `Serviço alterado: ${name}`, from: line(old), to: line(i) });
  }
  for (const [name, i] of before) if (!after.has(name)) out.push({ field: `Serviço retirado: ${name}`, from: line(i), to: null });
  return out;
}

// ---------- access ----------

async function loadRow(q: Q, id: string, lock = false): Promise<ProposalRow> {
  const { rows } = await q.query<ProposalRow>(`${SELECT} WHERE p.id = $1 ${lock ? "FOR UPDATE OF p" : ""}`, [id]);
  if (!rows[0]) throw new CrmNotFoundError("Proposta não encontrada.");
  return rows[0];
}

function requireView(s: CrmSession, r: ProposalRow) {
  if (!canSee(s, ownerOf(r))) throw new CrmNotFoundError("Proposta não encontrada.");
}
function requireAct(s: CrmSession, r: ProposalRow) {
  requireView(s, r);
  requireCap(s, "editPipeline");
  if (!canAct(s, ownerOf(r)))
    throw new CrmForbiddenError("Esta proposta é de outra pessoa: só o responsável (ou um Gestor) altera. Se precisar, peça a transferência do lead.");
}

async function event(
  q: Q,
  proposalId: string,
  kind: string,
  version: number | null,
  payload: Record<string, unknown>,
  actor: CrmActor,
  meta: { ip?: string | null; userAgent?: string | null } = {},
) {
  await q.query(
    `INSERT INTO crm_proposal_events (id, proposal_id, kind, version, payload, actor_id, actor_name, ip, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      randomUUID(),
      proposalId,
      kind,
      version,
      JSON.stringify(payload),
      actor?.userId ?? null,
      actor?.userName ?? null,
      meta.ip ?? null,
      meta.userAgent?.slice(0, 300) ?? null,
    ],
  );
}

async function audit(
  s: CrmActor,
  action: "crm.proposal_change" | "crm.proposal_send" | "crm.proposal_status" | "crm.proposal_discount" | "crm.proposal_link",
  r: { id: string; number: number },
  metadata: Record<string, unknown>,
) {
  await writeAudit({
    actorUserId: s?.userId ?? null,
    actorLabel: s?.userName ?? "Cliente",
    actorKind: s ? "admin" : "client",
    action,
    targetType: "crm_proposal",
    targetId: r.id,
    targetLabel: `Proposta nº ${proposalNumber(r.number)}`,
    metadata,
  });
}

/** Sent proposals past their validity become "expirada" (checked whenever they are read). */
export async function expireDue(q?: Q): Promise<number> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<{ id: string; contact_id: string; number: number; version: number }>(
    `UPDATE crm_proposals SET status = 'expirada', updated_at = now()
     WHERE status = ANY($1) AND valid_until < $2::date RETURNING id, contact_id, number, version`,
    [PROPOSAL_OPEN, todayBR()],
  );
  for (const r of rows) {
    await db.query(`INSERT INTO crm_proposal_events (id, proposal_id, kind, version, payload) VALUES ($1, $2, 'status', $3, $4)`, [
      randomUUID(),
      r.id,
      r.version,
      JSON.stringify({ to: "expirada", auto: true }),
    ]);
    await db.query(`INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name) VALUES ($1, $2, 'proposal', $3, NULL, 'Sistema')`, [
      randomUUID(),
      r.contact_id,
      JSON.stringify({ action: "expired", proposalId: r.id, number: r.number }),
    ]);
  }
  return rows.length;
}

// ---------- reading ----------

export type ProposalFilters = {
  status?: string | null;
  ownerId?: string | null;
  q?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  page?: number;
  pageSize?: number;
};

export async function listProposals(s: CrmSession, f: ProposalFilters): Promise<{ rows: CrmProposalSummary[]; total: number }> {
  const db = await getDb();
  await expireDue(db);
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    values.push(v);
    where.push(sql.replace("?", `$${values.length}`));
  };
  if (!s.caps.seeAllLeads) add(`(COALESCE(d.owner_id, c.owner_id) = ? OR COALESCE(d.owner_id, c.owner_id) IS NULL)`, s.userId);
  if (f.status && isProposalStatus(f.status)) add(`p.status = ?`, f.status);
  if (f.ownerId === "none") where.push(`COALESCE(d.owner_id, c.owner_id) IS NULL`);
  else if (f.ownerId) add(`COALESCE(d.owner_id, c.owner_id) = ?`, f.ownerId);
  if (f.dealId) add(`p.deal_id = ?`, f.dealId);
  if (f.contactId) add(`p.contact_id = ?`, f.contactId);
  if (f.q?.trim()) {
    const q = f.q.trim();
    const n = Number(q.replace(/\D/g, ""));
    values.push(`%${q.toLowerCase()}%`);
    const like = `$${values.length}`;
    where.push(
      `(lower(p.title) LIKE ${like} OR lower(c.name) LIKE ${like} OR lower(COALESCE(co.name, '')) LIKE ${like}${Number.isInteger(n) && n > 0 && /^\D*\d+\D*$/.test(q) ? ` OR p.number = ${n}` : ""})`,
    );
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const size = Math.min(Math.max(f.pageSize ?? 50, 1), 200);
  const page = Math.max(f.page ?? 1, 1);
  const [list, count] = await Promise.all([
    db.query<ProposalRow>(`${SELECT} ${w} ORDER BY p.updated_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, values),
    db.query<{ n: string }>(
      `SELECT count(*) AS n FROM crm_proposals p JOIN crm_deals d ON d.id = p.deal_id JOIN crm_contacts c ON c.id = p.contact_id LEFT JOIN crm_companies co ON co.id = p.company_id ${w}`,
      values,
    ),
  ]);
  const limit = await getDiscountLimit(db);
  return { rows: list.rows.map((r) => summary(r, limit)), total: Number(count.rows[0].n) };
}

type VersionRow = {
  version: number;
  content: ProposalContent;
  content_hash: string;
  reason: string | null;
  changes: ProposalChange[];
  created_by_name: string | null;
  created_at: Date;
  sent_at: Date | null;
};
const mapVersion = (v: VersionRow): CrmProposalVersion => ({
  version: v.version,
  content: v.content,
  contentHash: v.content_hash,
  reason: v.reason,
  changes: v.changes ?? [],
  createdByName: v.created_by_name,
  createdAt: iso(v.created_at)!,
  sentAt: iso(v.sent_at),
});
type ApprovalRow = {
  id: string;
  version: number;
  decision: "aprovada" | "recusada";
  name: string;
  email: string | null;
  document: string | null;
  comment: string | null;
  content_hash: string;
  via: "cliente" | "equipe";
  recorded_by_name: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: Date;
};
const mapApproval = (a: ApprovalRow): CrmProposalApproval => ({
  id: a.id,
  version: a.version,
  decision: a.decision,
  name: a.name,
  email: a.email,
  document: a.document,
  comment: a.comment,
  contentHash: a.content_hash,
  via: a.via,
  recordedByName: a.recorded_by_name,
  ip: a.ip,
  userAgent: a.user_agent,
  createdAt: iso(a.created_at)!,
});

export async function getProposal(s: CrmSession, id: string): Promise<CrmProposalDetail> {
  const db = await getDb();
  await expireDue(db);
  const r = await loadRow(db, id);
  requireView(s, r);
  const [versions, events, approvals, limit] = await Promise.all([
    db.query<VersionRow>(`SELECT * FROM crm_proposal_versions WHERE proposal_id = $1 ORDER BY version DESC`, [id]),
    db.query<{ id: string; kind: string; version: number | null; payload: Record<string, unknown>; actor_name: string | null; created_at: Date }>(
      `SELECT id, kind, version, payload, actor_name, created_at FROM crm_proposal_events WHERE proposal_id = $1 ORDER BY created_at DESC LIMIT 300`,
      [id],
    ),
    db.query<ApprovalRow>(`SELECT * FROM crm_proposal_approvals WHERE proposal_id = $1 ORDER BY created_at DESC`, [id]),
    getDiscountLimit(db),
  ]);
  const current = versions.rows.find((v) => v.version === r.version)!;
  return {
    ...summary(r, limit),
    content: current.content,
    locked: current.sent_at !== null || PROPOSAL_FINAL.includes(r.status) || r.status === "recusada" || r.status === "expirada",
    discountLimitPct: limit,
    discountAuthorizedPct: r.discount_authorized_pct === null ? null : Number(r.discount_authorized_pct),
    discountAuthorizedByName: r.discount_authorized_by_name,
    link: r.share_token ? { token: r.share_token, createdAt: iso(r.share_token_at)! } : null,
    versions: versions.rows.map(mapVersion),
    events: events.rows.map(
      (e): CrmProposalEvent => ({ id: e.id, kind: e.kind, version: e.version, payload: e.payload, actorName: e.actor_name, createdAt: iso(e.created_at)! }),
    ),
    approvals: approvals.rows.map(mapApproval),
  };
}

// ---------- creating and editing ----------

export type ProposalInput = {
  title?: unknown;
  intro?: unknown;
  issueDate?: unknown;
  validUntil?: unknown;
  dueDate?: unknown;
  paymentTerms?: unknown;
  billingPeriod?: unknown;
  executionTerm?: unknown;
  notes?: unknown;
  items?: unknown;
  /** Why (required when the change makes a new version). */
  reason?: unknown;
};

function buildContent(
  base: ProposalContent,
  input: ProposalInput,
  catalog: Map<string, ServiceRow>,
  client: ProposalContent["client"],
  ownerName: string | null,
): ProposalContent {
  const has = (k: keyof ProposalInput) => input[k] !== undefined;
  const title = has("title") ? cleanText(input.title, 160) : base.title;
  if (!title) throw new CrmInputError("Dê um título para a proposta.");
  const issueDate = has("issueDate") ? parseDay(input.issueDate, "a data de emissão", true)! : base.issueDate;
  const validUntil = has("validUntil") ? parseDay(input.validUntil, "a validade", true)! : base.validUntil;
  if (validUntil < issueDate) throw new CrmInputError("A validade não pode ser antes da emissão.");
  const dueDate = has("dueDate") ? parseDay(input.dueDate, "o vencimento", false) : base.dueDate;
  const billingPeriod = has("billingPeriod") ? input.billingPeriod : base.billingPeriod;
  if (!isProposalBillingPeriod(billingPeriod)) throw new CrmInputError("Periodicidade de cobrança inválida.");
  const items = has("items") ? parseItems(input.items, catalog) : base.items;
  return {
    title,
    intro: has("intro") ? cleanText(input.intro, 4000) : base.intro,
    issueDate,
    validUntil,
    dueDate,
    paymentTerms: has("paymentTerms") ? cleanText(input.paymentTerms, 2000) : base.paymentTerms,
    billingPeriod,
    executionTerm: has("executionTerm") ? cleanText(input.executionTerm, 500) : base.executionTerm,
    notes: has("notes") ? cleanText(input.notes, 4000) : base.notes,
    items,
    totals: proposalTotals(items),
    client,
    ownerName,
  };
}

async function writeTotals(q: Q, id: string, c: ProposalContent) {
  await q.query(
    `UPDATE crm_proposals SET title = $2, total_cents = $3, monthly_cents = $4, one_time_cents = $5, discount_pct = $6, issue_date = $7, valid_until = $8, updated_at = now() WHERE id = $1`,
    [id, c.title, c.totals.totalCents, c.totals.monthlyCents, c.totals.oneTimeCents, c.totals.discountPct, c.issueDate, c.validUntil],
  );
}

/** A Gestor's own discount is authorized as it is saved; anyone else's above the limit waits. */
async function settleDiscount(q: Q, s: CrmSession, id: string, c: ProposalContent) {
  const limit = await getDiscountLimit(q);
  if (c.totals.discountPct > limit && s.caps.assignAnyOwner) {
    await q.query(
      `UPDATE crm_proposals SET discount_authorized_pct = $2, discount_authorized_by = $3, discount_authorized_by_name = $4, discount_authorized_at = now()
       WHERE id = $1 AND (discount_authorized_pct IS NULL OR discount_authorized_pct < $2)`,
      [id, c.totals.discountPct, s.userId, s.userName],
    );
  }
}

export async function createProposal(s: CrmSession, input: { dealId?: unknown; templateId?: unknown } & ProposalInput): Promise<string> {
  requireCap(s, "editPipeline");
  const dealId = typeof input.dealId === "string" ? input.dealId : "";
  const id = randomUUID();
  await withTransaction(async (client) => {
    const { rows } = await client.query<{
      id: string;
      title: string;
      contact_id: string;
      owner_id: string | null;
      contact_owner: string | null;
      stage: string;
      service: string | null;
      value_cents: string | null;
      negotiated_cents: string | null;
      company_id: string | null;
    }>(
      `SELECT d.id, d.title, d.contact_id, d.owner_id, c.owner_id AS contact_owner, d.stage, d.service, d.value_cents, d.negotiated_cents, c.company_id
       FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id WHERE d.id = $1 FOR UPDATE OF d`,
      [dealId],
    );
    const deal = rows[0];
    if (!deal || !canSee(s, deal.owner_id ?? deal.contact_owner)) throw new CrmNotFoundError("Oportunidade não encontrada.");
    if (!canAct(s, deal.owner_id ?? deal.contact_owner))
      throw new CrmForbiddenError("Esta oportunidade é de outra pessoa: peça a transferência do lead para fazer a proposta.");
    if (deal.stage === "ganho" || deal.stage === "perdido") throw new CrmInputError("A oportunidade está encerrada: reabra-a para fazer uma proposta.");
    const catalog = await services(client);
    let template:
      | {
          intro: string | null;
          payment_terms: string | null;
          billing_period: string;
          execution_term: string | null;
          notes: string | null;
          valid_days: number;
          service_ids: string[];
        }
      | undefined;
    const templateId = typeof input.templateId === "string" && input.templateId ? input.templateId : null;
    if (templateId) {
      const t = await client.query(
        `SELECT intro, payment_terms, billing_period, execution_term, notes, valid_days, service_ids FROM crm_proposal_templates WHERE id = $1 AND archived_at IS NULL`,
        [templateId],
      );
      template = t.rows[0];
      if (!template) throw new CrmInputError("Modelo de proposta não encontrado.");
    }
    // Start from the template's services, or the opportunity's service and value.
    const serviceIds = template ? template.service_ids.filter((x) => catalog.has(x)) : deal.service && catalog.has(deal.service) ? [deal.service] : [];
    const dealValue = deal.negotiated_cents ?? deal.value_cents;
    const startItems = serviceIds.map((sid) => {
      const meta = catalog.get(sid)!.meta ?? {};
      return {
        serviceId: sid,
        quantity: 1,
        unitValue: !template && dealValue !== null ? Number(dealValue) / 100 : typeof meta.referenceCents === "number" ? meta.referenceCents / 100 : 0,
        description: typeof meta.scope === "string" ? meta.scope : null,
      };
    });
    const today = todayBR();
    const ownerRow = await client.query<{ name: string }>(`SELECT name FROM internal_users WHERE id = $1`, [deal.owner_id ?? deal.contact_owner]);
    const base: ProposalContent = {
      title: deal.title,
      intro: template?.intro ?? null,
      issueDate: today,
      validUntil: addDays(today, template?.valid_days ?? DEFAULT_VALID_DAYS),
      dueDate: null,
      paymentTerms: template?.payment_terms ?? null,
      billingPeriod: (template?.billing_period as ProposalContent["billingPeriod"]) ?? "mensal",
      executionTerm: template?.execution_term ?? null,
      notes: template?.notes ?? null,
      items: parseItems(startItems, catalog),
      totals: proposalTotals([]),
      client: await clientSnapshot(client, deal.contact_id),
      ownerName: ownerRow.rows[0]?.name ?? null,
    };
    const content = buildContent(base, input, catalog, base.client, base.ownerName);
    const n = await client.query<{ number: number }>(
      `INSERT INTO crm_proposals (id, deal_id, contact_id, company_id, template_id, title, issue_date, valid_until, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING number`,
      [id, deal.id, deal.contact_id, deal.company_id, templateId, content.title, content.issueDate, content.validUntil, s.userId, s.userName],
    );
    await client.query(
      `INSERT INTO crm_proposal_versions (id, proposal_id, version, content, content_hash, created_by, created_by_name) VALUES ($1, $2, 1, $3, $4, $5, $6)`,
      [randomUUID(), id, JSON.stringify(content), contentHash(content), s.userId, s.userName],
    );
    await writeTotals(client, id, content);
    await settleDiscount(client, s, id, content);
    await event(client, id, "created", 1, { templateId }, s);
    await addEvent(
      client,
      deal.contact_id,
      "proposal",
      { action: "created", proposalId: id, number: n.rows[0].number, dealId: deal.id, totalCents: content.totals.totalCents },
      s,
    );
    await audit(s, "crm.proposal_change", { id, number: n.rows[0].number }, { action: "created", dealId: deal.id, totalCents: content.totals.totalCents });
  });
  return id;
}

/**
 * Saves the proposal. A draft (current version never sent) changes in
 * place; a sent, refused or expired one gets a new version with the reason,
 * and goes back to "em elaboração" until it is sent again.
 */
export async function updateProposal(s: CrmSession, id: string, input: ProposalInput): Promise<{ version: number; newVersion: boolean }> {
  return withTransaction(async (client) => {
    const r = await loadRow(client, id, true);
    requireAct(s, r);
    if (PROPOSAL_FINAL.includes(r.status)) throw new CrmInputError(`Proposta ${proposalStatusLabel(r.status).toLowerCase()}: não pode mais ser alterada.`);
    const cur = (await client.query<VersionRow>(`SELECT * FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2 FOR UPDATE`, [id, r.version]))
      .rows[0];
    const catalog = await services(client);
    const snapshot = await clientSnapshot(client, r.contact_id);
    const content = buildContent(cur.content, input, catalog, snapshot, r.owner_name);
    const changes = diffContent(cur.content, content);
    const frozen = cur.sent_at !== null || r.status === "recusada" || r.status === "expirada";
    if (!frozen) {
      await client.query(`UPDATE crm_proposal_versions SET content = $3, content_hash = $4 WHERE proposal_id = $1 AND version = $2`, [
        id,
        r.version,
        JSON.stringify(content),
        contentHash(content),
      ]);
      await writeTotals(client, id, content);
      await settleDiscount(client, s, id, content);
      if (changes.length) await event(client, id, "edited", r.version, { changes }, s);
      return { version: r.version, newVersion: false };
    }
    if (changes.length === 0) return { version: r.version, newVersion: false };
    const reason = cleanText(input.reason, 500);
    if (!reason || reason.length < 5) throw new CrmInputError("Esta versão já foi enviada: diga o motivo da alteração (vira a versão nova).");
    const version = r.version + 1;
    await client.query(
      `INSERT INTO crm_proposal_versions (id, proposal_id, version, content, content_hash, reason, changes, created_by, created_by_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), id, version, JSON.stringify(content), contentHash(content), reason, JSON.stringify(changes), s.userId, s.userName],
    );
    await client.query(`UPDATE crm_proposals SET version = $2, status = 'em_elaboracao' WHERE id = $1`, [id, version]);
    await writeTotals(client, id, content);
    await settleDiscount(client, s, id, content);
    await event(client, id, "version", version, { reason, changes, from: r.status }, s);
    await addEvent(client, r.contact_id, "proposal", { action: "version", proposalId: id, number: r.number, version, reason }, s);
    await audit(s, "crm.proposal_change", r, { action: "version", version, reason, changes });
    return { version, newVersion: true };
  });
}

// ---------- discount authorization ----------

export async function authorizeDiscount(s: CrmSession, id: string): Promise<void> {
  requireCap(s, "assignAnyOwner");
  await withTransaction(async (client) => {
    const r = await loadRow(client, id, true);
    requireView(s, r);
    const limit = await getDiscountLimit(client);
    if (!pending(r, limit)) throw new CrmInputError("Não há desconto aguardando autorização nesta proposta.");
    await client.query(
      `UPDATE crm_proposals SET discount_authorized_pct = discount_pct, discount_authorized_by = $2, discount_authorized_by_name = $3, discount_authorized_at = now(), updated_at = now() WHERE id = $1`,
      [id, s.userId, s.userName],
    );
    await event(client, id, "discount", r.version, { pct: Number(r.discount_pct), limit }, s);
    await addEvent(client, r.contact_id, "proposal", { action: "discount", proposalId: id, number: r.number, pct: Number(r.discount_pct) }, s);
    await audit(s, "crm.proposal_discount", r, { pct: Number(r.discount_pct), limit });
    await notify(
      client,
      [ownerOf(r)].filter((x): x is string => !!x && x !== s.userId),
      `Desconto autorizado: proposta nº ${proposalNumber(r.number)}`,
      `${s.userName} autorizou ${Number(r.discount_pct)}% de desconto.`,
      r.contact_id,
    );
  });
}

async function notify(q: Q, userIds: string[], title: string, body: string, contactId: string) {
  for (const u of new Set(userIds)) {
    await q.query(`INSERT INTO crm_notifications (id, user_id, kind, title, body, contact_id) VALUES ($1, $2, 'proposta', $3, $4, $5)`, [
      randomUUID(),
      u,
      title,
      body,
      contactId,
    ]);
  }
}

// ---------- link ----------

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function setLink(s: CrmSession, id: string, action: "create" | "revoke"): Promise<string | null> {
  return withTransaction(async (client) => {
    const r = await loadRow(client, id, true);
    requireAct(s, r);
    const token = action === "create" ? newToken() : null;
    await client.query(
      `UPDATE crm_proposals SET share_token = $2, share_token_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END, updated_at = now() WHERE id = $1`,
      [id, token],
    );
    await event(client, id, action === "create" ? (r.share_token ? "link_renewed" : "link_created") : "link_revoked", r.version, {}, s);
    await audit(s, "crm.proposal_link", r, { action: action === "create" ? (r.share_token ? "renewed" : "created") : "revoked" });
    return token;
  });
}

// ---------- sending and statuses ----------

/** Moves the opportunity to "Proposta enviada" when it is still before it (filling service and value if missing). */
async function advanceDeal(client: PoolClient, r: ProposalRow, c: ProposalContent, s: CrmSession) {
  if (r.deal_stage === "ganho" || r.deal_stage === "perdido") return;
  const order = await client.query<{ id: string }>(`SELECT id FROM crm_options WHERE kind = 'stage' ORDER BY sort`);
  const ids = order.rows.map((x) => x.id);
  if (!ids.includes("proposta") || ids.indexOf(r.deal_stage) >= ids.indexOf("proposta")) return;
  const d = await client.query<{ service: string | null; value_cents: string | null }>(`SELECT service, value_cents FROM crm_deals WHERE id = $1`, [r.deal_id]);
  const patch: Record<string, unknown> = { stage: "proposta" };
  if (!d.rows[0]?.service) {
    const sid = c.items.find((i) => i.serviceId)?.serviceId;
    if (!sid) return;
    patch.service = sid;
  }
  if (d.rows[0]?.value_cents === null) patch.value = (c.totals.totalCents / 100).toFixed(2);
  await client.query("SAVEPOINT advance_deal");
  try {
    await updateDealTx(client, r.deal_id, patch, s, { auto: true });
    await client.query("RELEASE SAVEPOINT advance_deal");
  } catch {
    await client.query("ROLLBACK TO SAVEPOINT advance_deal");
  }
}

export async function sendProposal(s: CrmSession, id: string, channelInput: unknown): Promise<{ token: string }> {
  if (!isProposalChannel(channelInput)) throw new CrmInputError("Diga como a proposta foi enviada.");
  const channel = channelInput;
  await expireDue();
  return withTransaction(async (client) => {
    const r = await loadRow(client, id, true);
    requireAct(s, r);
    if (!(r.status === "em_elaboracao" || PROPOSAL_OPEN.includes(r.status))) {
      throw new CrmInputError(
        r.status === "expirada" || r.status === "recusada"
          ? `Proposta ${proposalStatusLabel(r.status).toLowerCase()}: altere-a (vira uma versão nova) antes de enviar de novo.`
          : `Proposta ${proposalStatusLabel(r.status).toLowerCase()}: não pode ser enviada.`,
      );
    }
    const v = (await client.query<VersionRow>(`SELECT * FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2 FOR UPDATE`, [id, r.version]))
      .rows[0];
    const c = v.content;
    if (c.items.length === 0 || c.totals.totalCents <= 0) throw new CrmInputError("Inclua ao menos um serviço com valor antes de enviar.");
    if (c.validUntil < todayBR()) throw new CrmInputError("A validade já passou: ajuste a data antes de enviar.");
    if (pending(r, await getDiscountLimit(client)))
      throw new CrmInputError(`O desconto (${Number(r.discount_pct)}%) passa do limite: um Gestor precisa autorizá-lo antes do envio.`);
    const token = r.share_token ?? newToken();
    const first = v.sent_at === null;
    if (first) await client.query(`UPDATE crm_proposal_versions SET sent_at = now() WHERE proposal_id = $1 AND version = $2`, [id, r.version]);
    await client.query(
      `UPDATE crm_proposals SET status = CASE WHEN status = 'em_elaboracao' THEN 'enviada' ELSE status END, sent_version = $2, sent_at = now(),
              share_token = $3, share_token_at = COALESCE(share_token_at, now()), updated_at = now() WHERE id = $1`,
      [id, r.version, token],
    );
    await event(client, id, first ? "sent" : "resent", r.version, { channel }, s);
    await addEvent(
      client,
      r.contact_id,
      "proposal",
      { action: first ? "sent" : "resent", proposalId: id, number: r.number, version: r.version, channel, totalCents: c.totals.totalCents },
      s,
    );
    await audit(s, "crm.proposal_send", r, { version: r.version, channel, totalCents: c.totals.totalCents });
    if (first) await advanceDeal(client, r, c, s);
    return { token };
  });
}

/** What the team does by hand: negotiate, record an approval or refusal that came by other means, cancel. */
export async function changeStatus(
  s: CrmSession,
  id: string,
  input: { action?: unknown; reason?: unknown; approverName?: unknown; approverEmail?: unknown },
): Promise<ProposalStatus> {
  const action = input.action;
  const reason = cleanText(input.reason, 1000);
  await expireDue();
  return withTransaction(async (client) => {
    const r = await loadRow(client, id, true);
    requireAct(s, r);
    let to: ProposalStatus;
    if (action === "negociacao") {
      if (r.status !== "enviada" && r.status !== "visualizada") throw new CrmInputError("Só uma proposta enviada ou visualizada entra em negociação.");
      to = "em_negociacao";
    } else if (action === "aprovar" || action === "recusar") {
      if (!PROPOSAL_OPEN.includes(r.status) || r.sent_version !== r.version)
        throw new CrmInputError("Só uma proposta enviada, na versão enviada, pode ser aprovada ou recusada.");
      if (!reason || reason.length < 5) throw new CrmInputError("Diga como o cliente respondeu (ex.: aprovou por e-mail em 10/12).");
      to = action === "aprovar" ? "aprovada" : "recusada";
      const v = (
        await client.query<{ content_hash: string }>(`SELECT content_hash FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2`, [id, r.version])
      ).rows[0];
      const name = cleanText(input.approverName, 160) ?? r.contact_name;
      await client.query(
        `INSERT INTO crm_proposal_approvals (id, proposal_id, version, decision, name, email, comment, content_hash, via, recorded_by, recorded_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'equipe', $9, $10)`,
        [randomUUID(), id, r.version, to, name, cleanText(input.approverEmail, 200), reason, v.content_hash, s.userId, s.userName],
      );
    } else if (action === "cancelar") {
      if (PROPOSAL_FINAL.includes(r.status)) throw new CrmInputError(`Proposta ${proposalStatusLabel(r.status).toLowerCase()}: não pode ser cancelada.`);
      if (!reason || reason.length < 5) throw new CrmInputError("Diga o motivo do cancelamento.");
      to = "cancelada";
    } else throw new CrmInputError("Ação inválida.");
    await client.query(
      `UPDATE crm_proposals SET status = $2, decided_at = CASE WHEN $2 IN ('aprovada', 'recusada') THEN now() ELSE decided_at END, updated_at = now() WHERE id = $1`,
      [id, to],
    );
    await event(client, id, "status", r.version, { from: r.status, to, reason, via: "equipe" }, s);
    await addEvent(client, r.contact_id, "proposal", { action: to, proposalId: id, number: r.number, version: r.version, reason, via: "equipe" }, s);
    await audit(s, "crm.proposal_status", r, { from: r.status, to, reason, version: r.version });
    return to;
  });
}

/** A PDF was generated (who and which version: part of the proposal's trail). */
export async function recordPdf(s: CrmSession, id: string, version: number): Promise<void> {
  const db = await getDb();
  await event(db, id, "pdf", version, {}, s);
}

// ---------- the client's side (public link) ----------

export type PublicProposal = {
  number: string;
  status: ProposalStatus;
  /** What the client sees: the version sent (null while nothing was sent). */
  version: number | null;
  content: ProposalContent | null;
  contentHash: string | null;
  /** The current version is being reworked (a newer one wasn't sent yet). */
  updating: boolean;
  decision: { decision: "aprovada" | "recusada"; name: string; createdAt: string; version: number } | null;
};

async function byToken(q: Q, token: string, lock = false): Promise<ProposalRow | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { rows } = await q.query<ProposalRow>(`${SELECT} WHERE p.share_token = $1 ${lock ? "FOR UPDATE OF p" : ""}`, [token]);
  return rows[0] ?? null;
}

export async function getPublicProposal(token: string): Promise<PublicProposal | null> {
  const db = await getDb();
  await expireDue(db);
  const r = await byToken(db, token);
  if (!r) return null;
  const shown = r.sent_version;
  const v = shown
    ? (await db.query<VersionRow>(`SELECT * FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2`, [r.id, shown])).rows[0]
    : undefined;
  const d = (await db.query<ApprovalRow>(`SELECT * FROM crm_proposal_approvals WHERE proposal_id = $1 ORDER BY created_at DESC LIMIT 1`, [r.id])).rows[0];
  return {
    number: proposalNumber(r.number),
    status: r.status,
    version: shown,
    content: r.status === "cancelada" ? null : (v?.content ?? null),
    contentHash: v?.content_hash ?? null,
    updating: r.status === "em_elaboracao" && shown !== null,
    decision:
      d && (r.status === "aprovada" || r.status === "recusada")
        ? { decision: d.decision, name: d.name, createdAt: iso(d.created_at)!, version: d.version }
        : null,
  };
}

/** The page ran in a browser (not a link preview, not someone of the team): "visualizada". */
export async function recordView(token: string, meta: { ip: string | null; userAgent: string | null; version: unknown }): Promise<boolean> {
  return withTransaction(async (client) => {
    const r = await byToken(client, token, true);
    if (!r || r.sent_version === null) return false;
    const version = Number(meta.version);
    if (version !== r.sent_version) return false;
    // One view line per browser and half hour is enough evidence.
    const recent = await client.query(
      `SELECT 1 FROM crm_proposal_events WHERE proposal_id = $1 AND kind = 'viewed' AND ip IS NOT DISTINCT FROM $2 AND user_agent IS NOT DISTINCT FROM $3 AND created_at > now() - interval '30 minutes'`,
      [r.id, meta.ip, meta.userAgent?.slice(0, 300) ?? null],
    );
    if (recent.rows.length) return false;
    await event(client, r.id, "viewed", version, {}, null, meta);
    if (r.status === "enviada") {
      await client.query(`UPDATE crm_proposals SET status = 'visualizada', viewed_at = COALESCE(viewed_at, now()), updated_at = now() WHERE id = $1`, [r.id]);
      await client.query(`INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name) VALUES ($1, $2, 'proposal', $3, NULL, 'Cliente')`, [
        randomUUID(),
        r.contact_id,
        JSON.stringify({ action: "viewed", proposalId: r.id, number: r.number, version }),
      ]);
      const owner = ownerOf(r);
      if (owner)
        await notify(client, [owner], `Proposta nº ${proposalNumber(r.number)} visualizada`, `${r.contact_name} abriu a proposta "${r.title}".`, r.contact_id);
    } else {
      await client.query(`UPDATE crm_proposals SET viewed_at = COALESCE(viewed_at, now()) WHERE id = $1`, [r.id]);
    }
    return true;
  });
}

/** The client approves or refuses the version on screen. */
export async function decidePublic(
  token: string,
  input: {
    decision?: unknown;
    name?: unknown;
    email?: unknown;
    document?: unknown;
    comment?: unknown;
    version?: unknown;
    accept?: unknown;
    contentHash?: unknown;
  },
  meta: { ip: string | null; userAgent: string | null },
): Promise<"aprovada" | "recusada"> {
  const decision = input.decision === "aprovar" ? "aprovada" : input.decision === "recusar" ? "recusada" : null;
  if (!decision) throw new CrmInputError("Escolha aprovar ou recusar.");
  const name = cleanText(input.name, 160);
  if (!name || name.length < 3) throw new CrmInputError("Informe seu nome completo.");
  const email = cleanText(input.email, 200)?.toLowerCase() ?? null;
  if (decision === "aprovada" && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new CrmInputError("Informe um e-mail válido.");
  if (decision === "aprovada" && input.accept !== true) throw new CrmInputError("Confirme que leu e aprova a proposta.");
  const document = cleanText(input.document, 30);
  if (document && !/^[\d./-\s]{11,20}$|^[A-Za-z0-9./-]{14,20}$/.test(document)) throw new CrmInputError("CPF ou CNPJ inválido.");
  await expireDue();
  return withTransaction(async (client) => {
    const r = await byToken(client, token, true);
    if (!r) throw new CrmNotFoundError("Proposta não encontrada.");
    if (!PROPOSAL_OPEN.includes(r.status) || r.sent_version === null) {
      throw new CrmConflictError(
        r.status === "expirada"
          ? "Esta proposta expirou. Fale com a Legado para receber uma nova."
          : r.status === "aprovada" || r.status === "recusada"
            ? "Esta proposta já foi respondida."
            : "Esta proposta não está disponível para resposta agora.",
      );
    }
    const v = (
      await client.query<{ content_hash: string }>(`SELECT content_hash FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2`, [
        r.id,
        r.sent_version,
      ])
    ).rows[0];
    if (Number(input.version) !== r.sent_version || (input.contentHash !== undefined && input.contentHash !== v.content_hash)) {
      throw new CrmConflictError("A proposta foi atualizada enquanto você lia. Recarregue a página para ver a versão atual.");
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO crm_proposal_approvals (id, proposal_id, version, decision, name, email, document, comment, content_hash, via, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'cliente', $10, $11)`,
      [
        id,
        r.id,
        r.sent_version,
        decision,
        name,
        email,
        document,
        cleanText(input.comment, 1000),
        v.content_hash,
        meta.ip,
        meta.userAgent?.slice(0, 300) ?? null,
      ],
    );
    await client.query(`UPDATE crm_proposals SET status = $2, decided_at = now(), viewed_at = COALESCE(viewed_at, now()), updated_at = now() WHERE id = $1`, [
      r.id,
      decision,
    ]);
    await event(client, r.id, "status", r.sent_version, { from: r.status, to: decision, via: "cliente", name, approvalId: id }, null, meta);
    await client.query(`INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name) VALUES ($1, $2, 'proposal', $3, NULL, 'Cliente')`, [
      randomUUID(),
      r.contact_id,
      JSON.stringify({ action: decision, proposalId: r.id, number: r.number, version: r.sent_version, via: "cliente", name }),
    ]);
    const owner = ownerOf(r);
    const managers = decision === "aprovada" ? await approvers(client) : [];
    await notify(
      client,
      [...(owner ? [owner] : []), ...managers.map((m) => m.id)],
      `Proposta nº ${proposalNumber(r.number)} ${decision}`,
      decision === "aprovada" ? `${name} aprovou "${r.title}". Registre a venda na oportunidade.` : `${name} recusou "${r.title}".`,
      r.contact_id,
    );
    await audit(null, "crm.proposal_status", r, { from: r.status, to: decision, via: "cliente", name, email, version: r.sent_version, ip: meta.ip });
    return decision;
  });
}

// ---------- templates ----------

type TemplateRow = {
  id: string;
  name: string;
  intro: string | null;
  payment_terms: string | null;
  billing_period: string;
  execution_term: string | null;
  notes: string | null;
  valid_days: number;
  service_ids: string[];
  archived_at: Date | null;
};
const mapTemplate = (t: TemplateRow): CrmProposalTemplate => ({
  id: t.id,
  name: t.name,
  intro: t.intro,
  paymentTerms: t.payment_terms,
  billingPeriod: isProposalBillingPeriod(t.billing_period) ? t.billing_period : "mensal",
  executionTerm: t.execution_term,
  notes: t.notes,
  validDays: t.valid_days,
  serviceIds: t.service_ids,
  archivedAt: iso(t.archived_at),
});

export async function listTemplates(withArchived = false): Promise<CrmProposalTemplate[]> {
  const db = await getDb();
  const { rows } = await db.query<TemplateRow>(
    `SELECT * FROM crm_proposal_templates ${withArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY archived_at NULLS FIRST, lower(name)`,
  );
  return rows.map(mapTemplate);
}

export async function saveTemplate(s: CrmSession, id: string | null, input: Record<string, unknown>): Promise<CrmProposalTemplate> {
  requireCap(s, "customize");
  const db = await getDb();
  const cur = id ? (await db.query<TemplateRow>(`SELECT * FROM crm_proposal_templates WHERE id = $1`, [id])).rows[0] : undefined;
  if (id && !cur) throw new CrmNotFoundError("Modelo não encontrado.");
  const has = (k: string) => input[k] !== undefined;
  const name = has("name") ? cleanText(input.name, 120) : (cur?.name ?? null);
  if (!name) throw new CrmInputError("Dê um nome ao modelo.");
  const days = has("validDays") ? Number(input.validDays) : (cur?.valid_days ?? DEFAULT_VALID_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new CrmInputError("Validade inválida: de 1 a 365 dias.");
  const billing = has("billingPeriod") ? input.billingPeriod : (cur?.billing_period ?? "mensal");
  if (!isProposalBillingPeriod(billing)) throw new CrmInputError("Periodicidade de cobrança inválida.");
  let serviceIds = cur?.service_ids ?? [];
  if (has("serviceIds")) {
    if (!Array.isArray(input.serviceIds) || input.serviceIds.length > 30) throw new CrmInputError("Serviços inválidos.");
    const catalog = await services(db);
    serviceIds = [...new Set(input.serviceIds.filter((x): x is string => typeof x === "string"))];
    if (serviceIds.some((x) => !catalog.has(x))) throw new CrmInputError("Um dos serviços não está no catálogo.");
  }
  const text = (k: string, col: keyof TemplateRow, max: number) => (has(k) ? cleanText(input[k], max) : ((cur?.[col] as string | null) ?? null));
  const values = [
    name,
    text("intro", "intro", 4000),
    text("paymentTerms", "payment_terms", 2000),
    billing,
    text("executionTerm", "execution_term", 500),
    text("notes", "notes", 4000),
    days,
    serviceIds,
  ];
  let row: TemplateRow;
  if (cur) {
    row = (
      await db.query<TemplateRow>(
        `UPDATE crm_proposal_templates SET name = $2, intro = $3, payment_terms = $4, billing_period = $5, execution_term = $6, notes = $7, valid_days = $8, service_ids = $9,
                archived_at = CASE WHEN $10::boolean IS NULL THEN archived_at WHEN $10 THEN COALESCE(archived_at, now()) ELSE NULL END, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [cur.id, ...values, typeof input.archived === "boolean" ? input.archived : null],
      )
    ).rows[0];
  } else {
    row = (
      await db.query<TemplateRow>(
        `INSERT INTO crm_proposal_templates (id, name, intro, payment_terms, billing_period, execution_term, notes, valid_days, service_ids, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [randomUUID(), ...values, s.userName],
      )
    ).rows[0];
  }
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.proposal_settings",
    targetType: "crm_proposal_template",
    targetId: row.id,
    targetLabel: row.name,
    metadata: { action: cur ? (typeof input.archived === "boolean" ? (input.archived ? "archived" : "restored") : "edited") : "created" },
  });
  return mapTemplate(row);
}

export { proposalNumber };
