// Server-only: opportunities (negócios) — what the funnel shows. One contact
// may have several over time (a lost one and, months later, a new one); the
// WhatsApp conversation stays on the contact. Every change lands in the
// contact's history, and contact.stage follows the contact's main
// opportunity so the contact list and older code paths stay consistent.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import {
  isClosedStage,
  isCrmLostReason,
  isCrmSource,
  isCrmStage,
  isCrmTaskKind,
  parseMoneyToCents,
  type CrmDeal,
  type CrmDealCard,
  type CrmStage,
} from "./crm-types";
import { CrmInputError, addEvent, cleanText, iso, type CrmActor } from "./crm-core";

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
};

const DEAL_COLS = `d.id, d.contact_id, d.title, d.value_cents, d.stage, d.owner_id, u.name AS owner_name, d.expected_close_at,
  d.lost_reason, d.lost_note, d.stage_changed_at, d.closed_at, d.created_at`;

function mapDeal(r: DealRow): CrmDeal {
  return {
    id: r.id,
    contactId: r.contact_id,
    title: r.title,
    // BIGINT arrives as a string from pg
    valueCents: r.value_cents === null ? null : Number(r.value_cents),
    stage: isCrmStage(r.stage) ? r.stage : "novo",
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    expectedCloseAt: iso(r.expected_close_at),
    lostReason: isCrmLostReason(r.lost_reason) ? r.lost_reason : null,
    lostNote: r.lost_note,
    stageChangedAt: iso(r.stage_changed_at)!,
    closedAt: iso(r.closed_at),
    createdAt: iso(r.created_at)!,
  };
}

/** Days a won/lost opportunity stays visible in its funnel column. */
export const CLOSED_VISIBLE_DAYS = 30;

/** The funnel: open opportunities plus those won/lost in the last 30 days, for contacts that aren't archived. */
export async function listBoardDeals(): Promise<CrmDealCard[]> {
  const db = await getDb();
  const { rows } = await db.query<
    DealRow & {
      contact_name: string;
      company: string | null;
      phone: string | null;
      email: string | null;
      source: string;
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
    }
  >(
    `SELECT ${DEAL_COLS},
            c.name AS contact_name, COALESCE(co.name, c.company) AS company, c.phone, c.email, c.source, c.referred_by,
            c.ad_referral IS NOT NULL AS has_ad_referral, c.unread_count, c.last_inbound_at, c.last_message_at, c.last_message_preview,
            nt.id AS task_id, nt.kind AS task_kind, nt.title AS task_title, nt.due_at AS task_due_at, nt.all_day AS task_all_day
     FROM crm_deals d
     JOIN crm_contacts c ON c.id = d.contact_id
     LEFT JOIN crm_companies co ON co.id = c.company_id
     LEFT JOIN internal_users u ON u.id = d.owner_id
     LEFT JOIN LATERAL (
       SELECT t.id, t.kind, t.title, t.due_at, t.all_day FROM crm_tasks t
       WHERE t.done_at IS NULL AND t.canceled_at IS NULL
         AND (t.deal_id = d.id OR (t.deal_id IS NULL AND t.contact_id = d.contact_id))
       ORDER BY t.due_at ASC NULLS LAST, t.created_at
       LIMIT 1
     ) nt ON true
     WHERE c.archived_at IS NULL
       AND (d.stage NOT IN ('ganho', 'perdido') OR d.closed_at >= now() - make_interval(days => $1))
     ORDER BY COALESCE(c.last_message_at, d.updated_at) DESC, d.id`,
    [CLOSED_VISIBLE_DAYS]
  );
  return rows.map((r) => ({
    ...mapDeal(r),
    contactName: r.contact_name,
    company: r.company,
    phone: r.phone,
    email: r.email,
    source: isCrmSource(r.source) ? r.source : "outro",
    referredBy: r.referred_by,
    hasAdReferral: r.has_ad_referral,
    unreadCount: r.unread_count,
    lastInboundAt: iso(r.last_inbound_at),
    lastMessageAt: iso(r.last_message_at),
    lastMessagePreview: r.last_message_preview,
    nextTask:
      r.task_id && isCrmTaskKind(r.task_kind)
        ? { id: r.task_id, kind: r.task_kind, title: r.task_title ?? "", dueAt: iso(r.task_due_at), allDay: r.task_all_day ?? true }
        : null,
  }));
}

/** A contact's opportunities: open ones first, then closed, newest first. */
export async function listContactDeals(db: Db, contactId: string): Promise<CrmDeal[]> {
  const { rows } = await db.query<DealRow>(
    `SELECT ${DEAL_COLS} FROM crm_deals d LEFT JOIN internal_users u ON u.id = d.owner_id
     WHERE d.contact_id = $1
     ORDER BY (d.stage IN ('ganho', 'perdido')) ASC, d.updated_at DESC`,
    [contactId]
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

function parseValue(value: unknown): number | null {
  try {
    return parseMoneyToCents(value);
  } catch {
    throw new CrmInputError("Valor inválido — use, por exemplo, 2.500 ou 2.500,00.");
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

export type NewDealInput = {
  contactId?: unknown;
  title?: unknown;
  value?: unknown;
  ownerId?: unknown;
  stage?: unknown;
  expectedCloseAt?: unknown;
};

/** Creates an opportunity inside a caller's transaction; returns its id. */
export async function createDealTx(client: PoolClient, input: NewDealInput, actor: CrmActor): Promise<string> {
  const contactId = typeof input.contactId === "string" ? input.contactId : "";
  const { rows } = await client.query<{ name: string; company: string | null; owner_id: string | null }>(
    `SELECT c.name, COALESCE(co.name, c.company) AS company, c.owner_id
     FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id WHERE c.id = $1`,
    [contactId]
  );
  const contact = rows[0];
  if (!contact) throw new CrmInputError("Contato não encontrado.");
  const title = cleanText(input.title, 120) ?? contact.company ?? contact.name;
  let stage: CrmStage = "novo";
  if (input.stage !== undefined && input.stage !== null && input.stage !== "") {
    if (!isCrmStage(input.stage)) throw new CrmInputError("Etapa inválida.");
    stage = input.stage;
  }
  if (stage === "perdido") throw new CrmInputError("Uma oportunidade nova não pode começar como perdida.");
  const ownerId = typeof input.ownerId === "string" ? input.ownerId || null : contact.owner_id;
  await ownerName(client, ownerId);
  const valueCents = parseValue(input.value);
  const id = randomUUID();
  await client.query(
    `INSERT INTO crm_deals (id, contact_id, title, value_cents, stage, owner_id, expected_close_at, closed_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, contactId, title, valueCents, stage, ownerId, parseCloseDate(input.expectedCloseAt), stage === "ganho" ? new Date() : null, actor?.userId ?? null]
  );
  await addEvent(client, contactId, "deal", { action: "created", dealId: id, title, valueCents, stage }, actor);
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
};

/**
 * Applies whatever is present. Moving to "Perdido" requires a loss reason;
 * entering won/lost stamps closed_at and reopening clears it (and the loss
 * reason). null = no such opportunity.
 */
export async function updateDealTx(
  client: PoolClient,
  id: string,
  patch: DealPatch,
  actor: CrmActor,
  opts: { auto?: boolean } = {}
): Promise<{ contactId: string; stage: CrmStage; title: string } | null> {
  const { rows } = await client.query<DealRow>(
    `SELECT ${DEAL_COLS} FROM crm_deals d LEFT JOIN internal_users u ON u.id = d.owner_id WHERE d.id = $1 FOR UPDATE OF d`,
    [id]
  );
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

  if (patch.title !== undefined) {
    const t = cleanText(patch.title, 120);
    if (!t) throw new CrmInputError("O título da oportunidade não pode ficar vazio.");
    if (t !== current.title) changes.push({ field: "Título", from: current.title, to: t });
    title = t;
    set("title", t);
  }
  if (patch.value !== undefined) {
    const v = parseValue(patch.value);
    const before = current.value_cents === null ? null : Number(current.value_cents);
    if (v !== before) changes.push({ field: "Valor", from: before === null ? null : String(before), to: v === null ? null : String(v) });
    set("value_cents", v);
  }
  if (patch.expectedCloseAt !== undefined) {
    const d = parseCloseDate(patch.expectedCloseAt);
    const before = iso(current.expected_close_at);
    if ((d?.toISOString() ?? null) !== before) changes.push({ field: "Previsão de fechamento", from: before, to: d?.toISOString() ?? null });
    set("expected_close_at", d);
  }
  if (patch.ownerId !== undefined) {
    const ownerId = typeof patch.ownerId === "string" && patch.ownerId ? patch.ownerId : null;
    if (ownerId !== current.owner_id) {
      const to = await ownerName(client, ownerId);
      set("owner_id", ownerId);
      await addEvent(client, current.contact_id, "owner", { from: current.owner_name, to, dealId: id, dealTitle: title }, actor);
    }
  }

  let stage = (isCrmStage(current.stage) ? current.stage : "novo") as CrmStage;
  if (patch.stage !== undefined && patch.stage !== current.stage) {
    if (!isCrmStage(patch.stage)) throw new CrmInputError("Etapa inválida.");
    stage = patch.stage;
    set("stage", stage);
    sets.push("stage_changed_at = now()");
    if (isClosedStage(stage) && !isClosedStage(current.stage)) sets.push("closed_at = now()");
    if (!isClosedStage(stage)) sets.push("closed_at = NULL");
  }
  // Loss reason: required to be lost; cleared when the opportunity is reopened.
  if (stage === "perdido") {
    const reason = patch.lostReason !== undefined ? patch.lostReason : current.lost_reason;
    if (!isCrmLostReason(reason)) throw new CrmInputError("Informe o motivo da perda.");
    if (patch.lostReason !== undefined) set("lost_reason", reason);
    if (patch.lostNote !== undefined) set("lost_note", cleanText(patch.lostNote, 500));
  } else if (current.stage === "perdido") {
    set("lost_reason", null);
    set("lost_note", null);
  }
  if (stage !== current.stage) {
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
        ...(stage === "perdido" ? { lostReason: patch.lostReason ?? current.lost_reason, lostNote: cleanText(patch.lostNote, 500) } : {}),
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
    await updateDealTx(client, rows[0].id, stage === "perdido" ? { stage, lostReason: "outro" } : { stage }, actor);
  } else {
    await createDealTx(client, { contactId, stage: stage === "perdido" ? "novo" : stage }, actor);
    if (stage === "perdido") await setContactStageTx(client, contactId, stage, actor);
  }
}
