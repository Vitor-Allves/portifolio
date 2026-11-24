// Server-only: opportunities (negócios) — what the funnel shows. One contact
// may have several over time (a lost one and, months later, a new one); the
// WhatsApp conversation stays on the contact. Every change lands in the
// contact's history, and contact.stage follows the contact's main
// opportunity so the contact list and older code paths stay consistent.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { afterDealStage } from "./crm-automation-hooks";
import {
  STAGE_REQUIREMENT_LABEL,
  isClosedStage,
  isCrmStage,
  isCrmTemperature,
  joinPt,
  missingForStage,
  parseMoneyToCents,
  stageLabel,
  temperatureLabel,
  type CrmDeal,
  type CrmDealCard,
  type CrmStage,
} from "./crm-types";
import { CrmInputError, addEvent, cleanText, iso, parseTemperature, type CrmActor } from "./crm-core";
import { loadStageLabels, optionLabel, requireOptionId } from "./crm-options";
import { isLostCloseGroup, isWonResult, type LostCloseGroup } from "./crm-catalog";

type Db = Pick<PoolClient, "query">;

type DealRow = {
  id: string;
  contact_id: string;
  title: string;
  value_cents: string | number | null;
  stage: string;
  owner_id: string | null;
  owner_name: string | null;
  expected_close_at: Date | null;
  lost_reason: string | null;
  lost_note: string | null;
  stage_changed_at: Date;
  closed_at: Date | null;
  created_at: Date;
  service: string | null;
  negotiated_cents: string | number | null;
  own_source: string | null;
  own_temperature: string | null;
  contact_source: string;
  contact_temperature: string | null;
  won_reason: string | null;
  won_note: string | null;
  client_id: string | null;
  probability: number | null;
  stage_probability: string | number | null;
  won_result: string | null;
  close_group: string | null;
  closed_by_name: string | null;
  return_on: string | null;
};

// Origin and temperature fall back to the contact's when the opportunity has none of its own.
const DEAL_COLS = `d.id, d.contact_id, d.title, d.value_cents, d.stage, d.owner_id, u.name AS owner_name, d.expected_close_at,
  d.lost_reason, d.lost_note, d.stage_changed_at, d.closed_at, d.created_at,
  d.service, d.negotiated_cents, d.source AS own_source, d.temperature AS own_temperature,
  cx.source AS contact_source, cx.temperature AS contact_temperature, d.won_reason, d.won_note,
  (SELECT k.client_id FROM crm_contracts k WHERE k.deal_id = d.id) AS client_id,
  d.probability, (SELECT so.meta->>'probability' FROM crm_options so WHERE so.kind = 'stage' AND so.id = d.stage) AS stage_probability,
  d.won_result, d.close_group, d.closed_by_name, d.return_on::text AS return_on`;
const DEAL_FROM = `crm_deals d JOIN crm_contacts cx ON cx.id = d.contact_id LEFT JOIN internal_users u ON u.id = d.owner_id`;

const cents = (v: string | number | null) => (v === null ? null : Number(v));

function mapDeal(r: DealRow): CrmDeal {
  return {
    id: r.id,
    contactId: r.contact_id,
    title: r.title,
    // BIGINT arrives as a string from pg
    valueCents: r.value_cents === null ? null : Number(r.value_cents),
    stage: r.stage || "novo",
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    expectedCloseAt: iso(r.expected_close_at),
    lostReason: r.lost_reason,
    lostNote: r.lost_note,
    service: r.service,
    negotiatedCents: cents(r.negotiated_cents),
    source: r.own_source ?? r.contact_source ?? "outro",
    temperature: [r.own_temperature, r.contact_temperature].find(isCrmTemperature) ?? null,
    wonReason: r.won_reason,
    wonNote: r.won_note,
    stageChangedAt: iso(r.stage_changed_at)!,
    closedAt: iso(r.closed_at),
    createdAt: iso(r.created_at)!,
    clientId: r.client_id ?? null,
    probability: r.stage === "ganho" ? 100 : r.stage === "perdido" ? 0 : (r.probability ?? (r.stage_probability === null ? 10 : Number(r.stage_probability))),
    probabilityOwn: r.probability !== null,
    closeGroup: r.stage === "ganho" ? "positivo" : r.stage === "perdido" ? ((isLostCloseGroup(r.close_group) ? r.close_group : "negativo") as LostCloseGroup) : null,
    wonResult: r.stage === "ganho" && isWonResult(r.won_result) ? r.won_result : null,
    closedByName: r.closed_by_name,
    returnOn: r.return_on,
  };
}

/** Days a won/lost opportunity stays visible in its funnel column. */
export const CLOSED_VISIBLE_DAYS = 30;

/** The funnel: open opportunities plus those won/lost in the last 30 days, for contacts that aren't archived. */
export async function listBoardDeals(visibleTo: string | null = null): Promise<CrmDealCard[]> {
  const db = await getDb();
  const { rows } = await db.query<
    DealRow & {
      contact_name: string;
      company: string | null;
      phone: string | null;
      email: string | null;
      referred_by: string | null;
      has_ad_referral: boolean;
      unread_count: number;
      last_inbound_at: Date | null;
      last_message_at: Date | null;
      last_message_preview: string | null;
      task_id: string | null;
      task_kind: string | null;
      task_title: string | null;
      task_due_at: Date | null;
      task_all_day: boolean | null;
      tag_ids: string[];
    }
  >(
    `SELECT ${DEAL_COLS},
            c.name AS contact_name, COALESCE(co.name, c.company) AS company, c.phone, c.email, c.referred_by,
            c.ad_referral IS NOT NULL AS has_ad_referral, c.unread_count, c.last_inbound_at, c.last_message_at, c.last_message_preview,
            nt.id AS task_id, nt.kind AS task_kind, nt.title AS task_title, nt.due_at AS task_due_at, nt.all_day AS task_all_day,
            ARRAY(SELECT ct.tag_id FROM crm_contact_tags ct WHERE ct.contact_id = c.id ORDER BY ct.applied_at, ct.tag_id) AS tag_ids
     FROM ${DEAL_FROM}
     JOIN crm_contacts c ON c.id = d.contact_id
     LEFT JOIN crm_companies co ON co.id = c.company_id
     LEFT JOIN LATERAL (
       SELECT t.id, t.kind, t.title, t.due_at, t.all_day FROM crm_tasks t
       WHERE t.done_at IS NULL AND t.canceled_at IS NULL
         AND (t.deal_id = d.id OR (t.deal_id IS NULL AND t.contact_id = d.contact_id))
       ORDER BY t.due_at ASC NULLS LAST, t.created_at
       LIMIT 1
     ) nt ON true
     WHERE c.archived_at IS NULL
       AND (d.stage NOT IN ('ganho', 'perdido') OR d.closed_at >= now() - make_interval(days => $1))
       AND ($2::text IS NULL OR c.owner_id = $2 OR c.owner_id IS NULL)
     ORDER BY COALESCE(c.last_message_at, d.updated_at) DESC, d.id`,
    [CLOSED_VISIBLE_DAYS, visibleTo]
  );
  return rows.map((r) => ({
    ...mapDeal(r),
    contactName: r.contact_name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    referredBy: r.referred_by,
    hasAdReferral: r.has_ad_referral,
    unreadCount: r.unread_count,
    lastInboundAt: iso(r.last_inbound_at),
    lastMessageAt: iso(r.last_message_at),
    lastMessagePreview: r.last_message_preview,
    nextTask:
      r.task_id && r.task_kind
        ? { id: r.task_id, kind: r.task_kind, title: r.task_title ?? "", dueAt: iso(r.task_due_at), allDay: r.task_all_day ?? true }
        : null,
    tagIds: r.tag_ids ?? [],
  }));
}

/** A contact's opportunities: open ones first, then closed, newest first. */
export async function listContactDeals(db: Db, contactId: string): Promise<CrmDeal[]> {
  const { rows } = await db.query<DealRow>(
    `SELECT ${DEAL_COLS} FROM ${DEAL_FROM}
     WHERE d.contact_id = $1
     ORDER BY (d.stage IN ('ganho', 'perdido')) ASC, d.updated_at DESC`,
    [contactId]
  );
  return rows.map(mapDeal);
}

/** Opportunities of several contacts at once (a company's): open ones first, then closed, newest first. */
export async function listDealsForContacts(db: Db, contactIds: string[]): Promise<CrmDeal[]> {
  if (contactIds.length === 0) return [];
  const { rows } = await db.query<DealRow>(
    `SELECT ${DEAL_COLS} FROM ${DEAL_FROM}
     WHERE d.contact_id = ANY($1)
     ORDER BY (d.stage IN ('ganho', 'perdido')) ASC, d.created_at DESC`,
    [contactIds]
  );
  return rows.map(mapDeal);
}

/** contact.stage = the stage of the contact's main opportunity (open first, most recently touched). */
export async function syncContactStage(client: Db, contactId: string): Promise<void> {
  await client.query(
    `UPDATE crm_contacts c SET stage = m.stage, stage_changed_at = m.stage_changed_at
     FROM (
       SELECT stage, stage_changed_at FROM crm_deals WHERE contact_id = $1
       ORDER BY (stage IN ('ganho', 'perdido')) ASC, updated_at DESC LIMIT 1
     ) m
     WHERE c.id = $1 AND (c.stage <> m.stage OR c.stage_changed_at <> m.stage_changed_at)`,
    [contactId]
  );
}

function parseValue(value: unknown, what = "Valor"): number | null {
  try {
    return parseMoneyToCents(value);
  } catch {
    throw new CrmInputError(`${what} inválido — use, por exemplo, 2.500 ou 2.500,00.`);
  }
}

/** "2026-12-20" → noon in Brasília (never drifts a day in either timezone); empty → null. */
function parseCloseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CrmInputError("Data de fechamento inválida.");
  return new Date(`${value}T12:00:00-03:00`);
}

async function ownerName(client: Db, ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const { rows } = await client.query<{ name: string }>(`SELECT name FROM internal_users WHERE id = $1`, [ownerId]);
  if (!rows[0]) throw new CrmInputError("Responsável inválido.");
  return rows[0].name;
}

const absent = (v: unknown) => v === undefined || v === null || v === "";

/** Refuses a move (or a new opportunity) into a stage whose required fields aren't filled. */
function requireStageFields(
  stage: CrmStage,
  deal: { service: string | null; valueCents: number | null; negotiatedCents: number | null; wonReason: string | null }
) {
  const missing = missingForStage(stage, deal);
  if (missing.length > 0) {
    throw new CrmInputError(`Para ir a "${stageLabel(stage)}", preencha: ${joinPt(missing.map((m) => STAGE_REQUIREMENT_LABEL[m]))}.`);
  }
}

export type NewDealInput = {
  contactId?: unknown;
  title?: unknown;
  value?: unknown;
  ownerId?: unknown;
  stage?: unknown;
  expectedCloseAt?: unknown;
  service?: unknown;
  negotiatedValue?: unknown;
  source?: unknown;
  temperature?: unknown;
  wonReason?: unknown;
  wonNote?: unknown;
  wonResult?: unknown;
  probability?: unknown;
};

/** Probabilidade de fechamento typed on a form: blank = follow the stage's. */
function parseProbability(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace("%", "").trim()) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) throw new CrmInputError("Probabilidade inválida: use um número de 0 a 100.");
  return n;
}

/** Creates an opportunity inside a caller's transaction; returns its id. */
export async function createDealTx(client: PoolClient, input: NewDealInput, actor: CrmActor): Promise<string> {
  const contactId = typeof input.contactId === "string" ? input.contactId : "";
  const { rows } = await client.query<{ name: string; company: string | null; owner_id: string | null; source: string; service_interest: string | null }>(
    `SELECT c.name, COALESCE(co.name, c.company) AS company, c.owner_id, c.source, c.service_interest
     FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id WHERE c.id = $1`,
    [contactId]
  );
  const contact = rows[0];
  if (!contact) throw new CrmInputError("Contato não encontrado.");
  const title = cleanText(input.title, 120) ?? contact.company ?? contact.name;
  let stage: CrmStage = "novo";
  if (input.stage !== undefined && input.stage !== null && input.stage !== "") {
    if (!isCrmStage(input.stage)) throw new CrmInputError("Etapa inválida.");
    stage = await requireOptionId(client, "stage", input.stage);
    await loadStageLabels(client);
  }
  if (stage === "perdido") throw new CrmInputError("Uma oportunidade nova não pode começar como perdida.");
  const probability = parseProbability(input.probability);
  let wonResult: string | null = null;
  if (stage === "ganho") {
    if (!isWonResult(input.wonResult)) throw new CrmInputError("Informe o resultado da venda (venda realizada ou proposta aprovada).");
    if (!cleanText(input.wonNote, 500)) throw new CrmInputError("Escreva uma observação sobre o fechamento.");
    wonResult = input.wonResult;
  }
  const ownerId = typeof input.ownerId === "string" ? input.ownerId || null : contact.owner_id;
  await ownerName(client, ownerId);
  const valueCents = parseValue(input.value);
  const negotiatedCents = parseValue(input.negotiatedValue, "Valor negociado");
  // Serviço starts as the contact's interest; origem as the contact's origin.
  const service = absent(input.service)
    ? contact.service_interest
    : await requireOptionId(client, "service", input.service);
  const source = absent(input.source) ? contact.source : await requireOptionId(client, "source", input.source);
  const temperature = parseTemperature(input.temperature);
  const wonReason = stage === "ganho" && !absent(input.wonReason) ? await requireOptionId(client, "won_reason", input.wonReason) : null;
  requireStageFields(stage, { service, valueCents, negotiatedCents, wonReason });
  const id = randomUUID();
  await client.query(
    `INSERT INTO crm_deals (id, contact_id, title, value_cents, stage, owner_id, expected_close_at, closed_at, created_by,
                            service, negotiated_cents, source, temperature, won_reason, won_note,
                            probability, won_result, close_group, closed_by, closed_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      id,
      contactId,
      title,
      valueCents,
      stage,
      ownerId,
      parseCloseDate(input.expectedCloseAt),
      stage === "ganho" ? new Date() : null,
      actor?.userId ?? null,
      service,
      negotiatedCents,
      source,
      temperature,
      wonReason,
      stage === "ganho" ? cleanText(input.wonNote, 500) : null,
      probability,
      wonResult,
      stage === "ganho" ? "positivo" : null,
      stage === "ganho" ? actor?.userId ?? null : null,
      stage === "ganho" ? actor?.userName ?? null : null,
    ]
  );
  await addEvent(client, contactId, "deal", { action: "created", dealId: id, title, valueCents, stage }, actor);
  if (stage !== "novo") await afterDealStage(client, id, stage);
  await syncContactStage(client, contactId);
  return id;
}

export async function createDeal(input: NewDealInput, actor: CrmActor): Promise<string> {
  return withTransaction((client) => createDealTx(client, input, actor));
}

export type DealPatch = {
  title?: unknown;
  value?: unknown;
  ownerId?: unknown;
  stage?: unknown;
  expectedCloseAt?: unknown;
  lostReason?: unknown;
  lostNote?: unknown;
  service?: unknown;
  negotiatedValue?: unknown;
  source?: unknown;
  temperature?: unknown;
  wonReason?: unknown;
  wonNote?: unknown;
  /** Tabulação positiva: venda_realizada | proposta_aprovada. */
  wonResult?: unknown;
  /** Oportunidade futura: when to pick it up again ("YYYY-MM-DD"). */
  returnOn?: unknown;
  /** Reabrir (or change the result of) a closed opportunity needs a justification. */
  reopenReason?: unknown;
  probability?: unknown;
};

/**
 * Applies whatever is present. Moving to "Perdido" requires a loss reason;
 * "Proposta enviada" and "Ganho" require the fields in STAGE_REQUIREMENTS
 * (moves the system makes on its own are exempt — they only go to "Em
 * conversa"); a field an opportunity's stage requires can't be emptied.
 * Entering won/lost stamps closed_at and reopening clears it (and the
 * loss/win reason). Every change of value lands in the history. null = no
 * such opportunity.
 */
export async function updateDealTx(
  client: PoolClient,
  id: string,
  patch: DealPatch,
  actor: CrmActor,
  /** auto = a move the system makes itself; legacy = the old contact-level stage call (no tabulação form). */
  opts: { auto?: boolean; legacy?: boolean } = {}
): Promise<{ contactId: string; stage: CrmStage; title: string } | null> {
  const { rows } = await client.query<DealRow>(`SELECT ${DEAL_COLS} FROM ${DEAL_FROM} WHERE d.id = $1 FOR UPDATE OF d`, [id]);
  const current = rows[0];
  if (!current) return null;
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  const changes: { field: string; from: string | null; to: string | null }[] = [];
  let title = current.title;
  // What the opportunity will look like after this patch (for the stage requirements).
  const next = {
    service: current.service,
    valueCents: cents(current.value_cents),
    negotiatedCents: cents(current.negotiated_cents),
    wonReason: current.won_reason,
  };

  if (patch.title !== undefined) {
    const t = cleanText(patch.title, 120);
    if (!t) throw new CrmInputError("O título da oportunidade não pode ficar vazio.");
    if (t !== current.title) changes.push({ field: "Título", from: current.title, to: t });
    title = t;
    set("title", t);
  }
  if (patch.value !== undefined) {
    const v = parseValue(patch.value);
    const before = cents(current.value_cents);
    if (v !== before) changes.push({ field: "Valor", from: before === null ? null : String(before), to: v === null ? null : String(v) });
    next.valueCents = v;
    set("value_cents", v);
  }
  if (patch.negotiatedValue !== undefined) {
    const v = parseValue(patch.negotiatedValue, "Valor negociado");
    const before = cents(current.negotiated_cents);
    if (v !== before) changes.push({ field: "Valor negociado", from: before === null ? null : String(before), to: v === null ? null : String(v) });
    next.negotiatedCents = v;
    set("negotiated_cents", v);
  }
  if (patch.service !== undefined && (patch.service || null) !== current.service) {
    const v = absent(patch.service) ? null : await requireOptionId(client, "service", patch.service, current.service);
    changes.push({
      field: "Serviço",
      from: current.service ? await optionLabel(client, "service", current.service) : null,
      to: v ? await optionLabel(client, "service", v) : null,
    });
    next.service = v;
    set("service", v);
  }
  if (patch.source !== undefined && !absent(patch.source) && patch.source !== (current.own_source ?? current.contact_source)) {
    const before = current.own_source ?? current.contact_source;
    const v = await requireOptionId(client, "source", patch.source, before);
    changes.push({ field: "Origem", from: await optionLabel(client, "source", before), to: await optionLabel(client, "source", v) });
    set("source", v);
  }
  if (patch.temperature !== undefined) {
    const v = parseTemperature(patch.temperature);
    if (v !== current.own_temperature) {
      changes.push({ field: "Temperatura", from: temperatureLabel(current.own_temperature) || null, to: temperatureLabel(v) || null });
      set("temperature", v);
    }
  }
  if (patch.expectedCloseAt !== undefined) {
    const d = parseCloseDate(patch.expectedCloseAt);
    const before = iso(current.expected_close_at);
    if ((d?.toISOString() ?? null) !== before) changes.push({ field: "Previsão de fechamento", from: before, to: d?.toISOString() ?? null });
    set("expected_close_at", d);
  }
  if (patch.probability !== undefined) {
    const p = parseProbability(patch.probability);
    if (p !== current.probability) {
      changes.push({ field: "Probabilidade", from: current.probability === null ? null : `${current.probability}%`, to: p === null ? "da etapa" : `${p}%` });
      set("probability", p);
    }
  }
  if (patch.ownerId !== undefined) {
    const ownerId = typeof patch.ownerId === "string" && patch.ownerId ? patch.ownerId : null;
    if (ownerId !== current.owner_id) {
      const to = await ownerName(client, ownerId);
      set("owner_id", ownerId);
      await addEvent(client, current.contact_id, "owner", { from: current.owner_name, to, dealId: id, dealTitle: title }, actor);
    }
  }

  let stage = (current.stage || "novo") as CrmStage;
  const human = !opts.auto && !opts.legacy;
  let reopenReason: string | null = null;
  // Tabulação (evolução v1.0, item 5): what is recorded when an opportunity is closed.
  const tab: { group: string | null; returnOn: string | null; wonResult: string | null } = { group: null, returnOn: null, wonResult: null };
  if (patch.stage !== undefined && patch.stage !== current.stage) {
    if (!isCrmStage(patch.stage)) throw new CrmInputError("Etapa inválida.");
    stage = await requireOptionId(client, "stage", patch.stage, current.stage);
    await loadStageLabels(client);
    // Reopening (or changing the result of) a closed opportunity needs a reason, kept in the history.
    if (isClosedStage(current.stage) && human) {
      reopenReason = cleanText(patch.reopenReason, 500);
      if (!reopenReason) throw new CrmInputError("Para reabrir uma oportunidade encerrada, escreva a justificativa.");
    }
    set("stage", stage);
    sets.push("stage_changed_at = now()");
    if (isClosedStage(stage)) {
      sets.push("closed_at = now()");
      set("closed_by", actor?.userId ?? null);
      set("closed_by_name", actor?.userName ?? null);
    }
    if (!isClosedStage(stage)) {
      sets.push("closed_at = NULL");
      for (const c of ["close_group", "closed_by", "closed_by_name", "return_on", "won_result"]) set(c, null);
    }
  }
  const closing = stage !== current.stage && isClosedStage(stage);
  // Encerrar sem venda: reason (with its group), observation and — for an oportunidade futura — the date to pick it up again.
  if (stage === "perdido") {
    const reason = patch.lostReason !== undefined ? patch.lostReason : current.lost_reason;
    if (typeof reason !== "string" || !reason) throw new CrmInputError("Informe o motivo do encerramento.");
    if (patch.lostReason !== undefined || closing) {
      const id = await requireOptionId(client, "lost_reason", reason, current.lost_reason);
      set("lost_reason", id);
      const g = await client.query<{ grp: string | null }>(`SELECT meta->>'group' AS grp FROM crm_options WHERE kind = 'lost_reason' AND id = $1`, [id]);
      tab.group = isLostCloseGroup(g.rows[0]?.grp) ? g.rows[0]!.grp : "negativo";
      set("close_group", tab.group);
    }
    const note = patch.lostNote !== undefined ? cleanText(patch.lostNote, 500) : closing ? null : current.lost_note;
    if (closing && human && !note) throw new CrmInputError("Escreva uma observação sobre o encerramento.");
    if (patch.lostNote !== undefined) set("lost_note", note);
    if (tab.group === "futuro") {
      const d = typeof patch.returnOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(patch.returnOn) ? patch.returnOn : null;
      if (!d && human) throw new CrmInputError("Para uma oportunidade futura, informe a data para retomar.");
      tab.returnOn = d;
      set("return_on", d);
    } else if (tab.group) set("return_on", null);
  } else if (current.stage === "perdido") {
    set("lost_reason", null);
    set("lost_note", null);
  }
  // Venda fechada: result, reason (part of what the stage requires) and observation.
  let wonProblem: string | null = null;
  if (stage === "ganho") {
    if (patch.wonReason !== undefined && (patch.wonReason || null) !== current.won_reason) {
      next.wonReason = absent(patch.wonReason) ? null : await requireOptionId(client, "won_reason", patch.wonReason, current.won_reason);
      set("won_reason", next.wonReason);
    }
    const note = patch.wonNote !== undefined ? cleanText(patch.wonNote, 500) : closing ? null : current.won_note;
    if (patch.wonNote !== undefined) set("won_note", note);
    if (closing && human) {
      // Checked after what the stage requires (below), so the first message is about the missing fields.
      if (!isWonResult(patch.wonResult)) wonProblem = "Informe o resultado: venda realizada ou proposta aprovada.";
      else if (!note) wonProblem = "Escreva uma observação sobre o fechamento.";
    }
    if (patch.wonResult !== undefined || closing) {
      tab.wonResult = isWonResult(patch.wonResult) ? patch.wonResult : current.won_result ?? "venda_realizada";
      set("won_result", tab.wonResult);
      set("close_group", "positivo");
      tab.group = "positivo";
    }
  } else if (current.stage === "ganho") {
    set("won_reason", null);
    set("won_note", null);
  }
  // Exigência por etapa: on entering the stage (unless the system moved it),
  // and whenever a field the current stage requires is being emptied.
  const entering = stage !== current.stage && !opts.auto;
  const emptied = missingForStage(stage, next).filter((m) => !missingForStage(stage, {
    service: current.service,
    valueCents: cents(current.value_cents),
    negotiatedCents: cents(current.negotiated_cents),
    wonReason: current.won_reason,
  }).includes(m));
  if (entering) requireStageFields(stage, next);
  else if (emptied.length > 0) {
    throw new CrmInputError(`Em "${stageLabel(stage)}" a oportunidade precisa de ${joinPt(emptied.map((m) => STAGE_REQUIREMENT_LABEL[m]))}.`);
  }
  if (wonProblem) throw new CrmInputError(wonProblem);

  if (stage !== current.stage) {
    await afterDealStage(client, id, stage);
    await addEvent(
      client,
      current.contact_id,
      "stage",
      {
        from: current.stage,
        to: stage,
        dealId: id,
        dealTitle: title,
        ...(opts.auto ? { auto: true } : {}),
        ...(reopenReason ? { reopenReason, previous: { group: current.close_group, lostReason: current.lost_reason, wonResult: current.won_result } } : {}),
        ...(stage === "perdido"
          ? { lostReason: patch.lostReason ?? current.lost_reason, lostNote: cleanText(patch.lostNote, 500), group: tab.group, ...(tab.returnOn ? { returnOn: tab.returnOn } : {}) }
          : {}),
        ...(stage === "ganho"
          ? {
              wonReason: next.wonReason,
              wonNote: patch.wonNote !== undefined ? cleanText(patch.wonNote, 500) : current.won_note,
              valueCents: next.negotiatedCents,
              wonResult: tab.wonResult,
              group: "positivo",
            }
          : {}),
      },
      actor
    );
  }
  if (changes.length > 0) await addEvent(client, current.contact_id, "deal", { action: "edited", dealId: id, title, changes }, actor);

  if (sets.length > 0) {
    sets.push("updated_at = now()");
    values.push(id);
    await client.query(`UPDATE crm_deals SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    await syncContactStage(client, current.contact_id);
  }
  return { contactId: current.contact_id, stage, title };
}

export async function updateDeal(id: string, patch: DealPatch, actor: CrmActor) {
  return withTransaction((client) => updateDealTx(client, id, patch, actor));
}

/**
 * Legacy path (contact-level stage, e.g. older API calls): applies the stage
 * to the contact's main opportunity, creating one when it has none.
 */
export async function setContactStageTx(client: PoolClient, contactId: string, stage: unknown, actor: CrmActor): Promise<void> {
  if (!isCrmStage(stage)) throw new CrmInputError("Etapa inválida.");
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM crm_deals WHERE contact_id = $1 ORDER BY (stage IN ('ganho', 'perdido')) ASC, updated_at DESC LIMIT 1`,
    [contactId]
  );
  if (rows[0]) {
    await updateDealTx(client, rows[0].id, stage === "perdido" ? { stage, lostReason: "outro" } : { stage }, actor, { legacy: true });
  } else {
    await createDealTx(client, { contactId, stage: stage === "perdido" ? "novo" : stage }, actor);
    if (stage === "perdido") await setContactStageTx(client, contactId, stage, actor);
  }
}
