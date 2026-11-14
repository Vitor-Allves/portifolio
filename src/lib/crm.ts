// Server-only data layer for the CRM (área /crm). Every function here
// assumes the caller already checked the session is internal staff — see
// src/lib/crm-auth.ts.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import {
  formatPhone,
  isCrmSource,
  isCrmStage,
  normalizePhone,
  phoneVariants,
  type CrmAdReferral,
  type CrmContactCard,
  type CrmContactDetail,
  type CrmEvent,
  type CrmEventKind,
  type CrmMessage,
  type CrmQuickReply,
  type CrmSource,
  type CrmTeamMember,
} from "./crm-types";
import type { InboundMessage, StatusUpdate } from "./whatsapp";

/** Who did it — null for things the system did on its own (an inbound message creating a contact, an automatic stage move). */
export type CrmActor = { userId: string; userName: string } | null;

/** A validation failure worth showing the user as-is (pt-BR), unlike an unexpected error. */
export class CrmInputError extends Error {}

type CardRow = {
  id: string;
  phone: string;
  name: string;
  company: string | null;
  source: string;
  referred_by: string | null;
  stage: string;
  owner_id: string | null;
  owner_name: string | null;
  next_action: string | null;
  next_action_at: Date | null;
  last_message_at: Date | null;
  last_message_preview: string | null;
  last_inbound_at: Date | null;
  unread_count: number;
  ad_referral: CrmAdReferral | null;
  stage_changed_at: Date;
};

const CARD_SELECT = `
  SELECT c.id, c.phone, c.name, c.company, c.source, c.referred_by, c.stage, c.owner_id, u.name AS owner_name,
         c.next_action, c.next_action_at, c.last_message_at, c.last_message_preview, c.last_inbound_at,
         c.unread_count, c.ad_referral, c.stage_changed_at, c.consent_source, c.created_at
  FROM crm_contacts c
  LEFT JOIN internal_users u ON u.id = c.owner_id`;

function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function mapCard(r: CardRow): CrmContactCard {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    company: r.company,
    source: isCrmSource(r.source) ? r.source : "outro",
    referredBy: r.referred_by,
    stage: isCrmStage(r.stage) ? r.stage : "novo",
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    nextAction: r.next_action,
    nextActionAt: iso(r.next_action_at),
    lastMessageAt: iso(r.last_message_at),
    lastMessagePreview: r.last_message_preview,
    lastInboundAt: iso(r.last_inbound_at),
    unreadCount: r.unread_count,
    hasAdReferral: r.ad_referral !== null,
    stageChangedAt: iso(r.stage_changed_at)!,
  };
}

export async function listContacts(): Promise<CrmContactCard[]> {
  const db = await getDb();
  const { rows } = await db.query<CardRow>(`${CARD_SELECT} ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`);
  return rows.map(mapCard);
}

export async function listTeam(): Promise<CrmTeamMember[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM internal_users WHERE revoked_at IS NULL ORDER BY name`
  );
  return rows;
}

export async function getContactDetail(id: string): Promise<CrmContactDetail | null> {
  const db = await getDb();
  const { rows } = await db.query<CardRow & { consent_source: string | null; created_at: Date }>(`${CARD_SELECT} WHERE c.id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;

  const [messages, events] = await Promise.all([
    db.query<{
      id: string;
      direction: "in" | "out";
      type: string;
      body: string | null;
      media_id: string | null;
      media_mime: string | null;
      template_name: string | null;
      status: string | null;
      error: string | null;
      sent_by_name: string | null;
      created_at: Date;
    }>(
      // The latest 500, returned oldest first for display.
      `SELECT * FROM (
         SELECT m.id, m.direction, m.type, m.body, m.media_id, m.media_mime, m.template_name, m.status, m.error,
                u.name AS sent_by_name, m.created_at, m.seq
         FROM crm_messages m LEFT JOIN internal_users u ON u.id = m.sent_by
         WHERE m.contact_id = $1 ORDER BY m.created_at DESC, m.seq DESC LIMIT 500
       ) recent ORDER BY created_at ASC, seq ASC`,
      [id]
    ),
    db.query<{ id: string; kind: CrmEventKind; payload: Record<string, unknown>; user_name: string | null; created_at: Date }>(
      `SELECT id, kind, payload, user_name, created_at FROM crm_events WHERE contact_id = $1 ORDER BY created_at ASC, seq ASC`,
      [id]
    ),
  ]);

  return {
    ...mapCard(row),
    consentSource: row.consent_source,
    adReferral: row.ad_referral,
    createdAt: iso(row.created_at)!,
    messages: messages.rows.map(
      (m): CrmMessage => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        body: m.body,
        mediaId: m.media_id,
        mediaMime: m.media_mime,
        templateName: m.template_name,
        status: m.status,
        error: m.error,
        sentByName: m.sent_by_name,
        createdAt: iso(m.created_at)!,
      })
    ),
    events: events.rows.map(
      (e): CrmEvent => ({ id: e.id, kind: e.kind, payload: e.payload, userName: e.user_name, createdAt: iso(e.created_at)! })
    ),
  };
}

async function addEvent(client: PoolClient, contactId: string, kind: CrmEventKind, payload: Record<string, unknown>, actor: CrmActor) {
  await client.query(
    `INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name) VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), contactId, kind, JSON.stringify(payload), actor?.userId ?? null, actor?.userName ?? "Sistema"]
  );
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** "2026-11-14" (a date input) → noon in Brasília, so the stored instant never drifts into the previous/next day in either timezone. null clears it. */
function parseNextActionDate(value: unknown): Date | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CrmInputError("Data da próxima ação inválida.");
  return new Date(`${value}T12:00:00-03:00`);
}

export type NewContactInput = {
  name: unknown;
  phone: unknown;
  company?: unknown;
  source?: unknown;
  referredBy?: unknown;
  consentSource?: unknown;
  ownerId?: unknown;
};

export async function createContact(input: NewContactInput, actor: CrmActor): Promise<string> {
  const name = cleanText(input.name, 120);
  if (!name) throw new CrmInputError("Informe o nome do contato.");
  const phone = typeof input.phone === "string" ? normalizePhone(input.phone) : "";
  if (phone.length < 10 || phone.length > 15) throw new CrmInputError("Telefone inválido — use DDD + número, ex.: (15) 99999-8888.");
  const source: CrmSource = isCrmSource(input.source) ? input.source : "outro";
  const ownerId = typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null;

  return withTransaction(async (client) => {
    const existing = await client.query(`SELECT id FROM crm_contacts WHERE phone = ANY($1)`, [phoneVariants(phone)]);
    if (existing.rows.length > 0) throw new CrmInputError("Já existe um contato com esse telefone.");
    const id = randomUUID();
    await client.query(
      `INSERT INTO crm_contacts (id, phone, name, company, source, referred_by, consent_source, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, phone, name, cleanText(input.company, 120), source, cleanText(input.referredBy, 120), cleanText(input.consentSource, 200), ownerId]
    );
    await addEvent(client, id, "created", { via: "manual" }, actor);
    return id;
  });
}

export type ContactPatch = {
  name?: unknown;
  company?: unknown;
  source?: unknown;
  referredBy?: unknown;
  consentSource?: unknown;
  stage?: unknown;
  ownerId?: unknown;
  nextAction?: unknown;
  nextActionAt?: unknown;
};

/** Applies whatever fields are present; stage, owner and next-action changes also land in the contact's history. false = no such contact. */
export async function updateContact(id: string, patch: ContactPatch, actor: CrmActor): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      stage: string;
      owner_id: string | null;
      next_action: string | null;
      next_action_at: Date | null;
    }>(`SELECT stage, owner_id, next_action, next_action_at FROM crm_contacts WHERE id = $1 FOR UPDATE`, [id]);
    const current = rows[0];
    if (!current) return false;

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (patch.name !== undefined) {
      const name = cleanText(patch.name, 120);
      if (!name) throw new CrmInputError("O nome não pode ficar vazio.");
      set("name", name);
    }
    if (patch.company !== undefined) set("company", cleanText(patch.company, 120));
    if (patch.referredBy !== undefined) set("referred_by", cleanText(patch.referredBy, 120));
    if (patch.consentSource !== undefined) set("consent_source", cleanText(patch.consentSource, 200));
    if (patch.source !== undefined) {
      if (!isCrmSource(patch.source)) throw new CrmInputError("Origem inválida.");
      set("source", patch.source);
    }

    if (patch.stage !== undefined && patch.stage !== current.stage) {
      if (!isCrmStage(patch.stage)) throw new CrmInputError("Etapa inválida.");
      set("stage", patch.stage);
      sets.push("stage_changed_at = now()");
      await addEvent(client, id, "stage", { from: current.stage, to: patch.stage }, actor);
    }

    if (patch.ownerId !== undefined) {
      const ownerId = typeof patch.ownerId === "string" && patch.ownerId ? patch.ownerId : null;
      if (ownerId !== current.owner_id) {
        const names = await client.query<{ id: string; name: string }>(
          `SELECT id, name FROM internal_users WHERE id = ANY($1)`,
          [[ownerId, current.owner_id].filter(Boolean)]
        );
        if (ownerId && !names.rows.some((n) => n.id === ownerId)) throw new CrmInputError("Responsável inválido.");
        const nameOf = (uid: string | null) => names.rows.find((n) => n.id === uid)?.name ?? null;
        set("owner_id", ownerId);
        await addEvent(client, id, "owner", { from: nameOf(current.owner_id), to: nameOf(ownerId) }, actor);
      }
    }

    if (patch.nextAction !== undefined || patch.nextActionAt !== undefined) {
      const nextAction = patch.nextAction !== undefined ? cleanText(patch.nextAction, 200) : current.next_action;
      const nextActionAt = patch.nextActionAt !== undefined ? parseNextActionDate(patch.nextActionAt) : current.next_action_at;
      set("next_action", nextAction);
      set("next_action_at", nextActionAt);
      await addEvent(client, id, "next_action", { text: nextAction, at: nextActionAt ? nextActionAt.toISOString() : null }, actor);
    }

    if (sets.length === 0) return true;
    sets.push("updated_at = now()");
    values.push(id);
    await client.query(`UPDATE crm_contacts SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    return true;
  });
}

export async function addNote(id: string, text: unknown, actor: CrmActor): Promise<boolean> {
  const note = cleanText(text, 2000);
  if (!note) throw new CrmInputError("A nota está vazia.");
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT 1 FROM crm_contacts WHERE id = $1`, [id]);
    if (rows.length === 0) return false;
    await addEvent(client, id, "note", { text: note }, actor);
    await client.query(`UPDATE crm_contacts SET updated_at = now() WHERE id = $1`, [id]);
    return true;
  });
}

export async function markRead(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`UPDATE crm_contacts SET unread_count = 0 WHERE id = $1 AND unread_count <> 0`, [id]);
}

export async function getContactForSending(id: string): Promise<{ phone: string; lastInboundAt: string | null } | null> {
  const db = await getDb();
  const { rows } = await db.query<{ phone: string; last_inbound_at: Date | null }>(
    `SELECT phone, last_inbound_at FROM crm_contacts WHERE id = $1`,
    [id]
  );
  return rows[0] ? { phone: rows[0].phone, lastInboundAt: iso(rows[0].last_inbound_at) } : null;
}

const MEDIA_LABEL: Record<string, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
};

function preview(type: string, body: string | null, templateName: string | null): string {
  const text = body ?? (templateName ? `Modelo: ${templateName}` : MEDIA_LABEL[type] ?? "Mensagem");
  return text.slice(0, 140);
}

export async function recordOutbound(
  contactId: string,
  data: { waMessageId: string; type: "text" | "template"; body: string | null; templateName: string | null },
  actor: CrmActor
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO crm_messages (id, contact_id, wa_message_id, direction, type, body, template_name, status, sent_by)
     VALUES ($1, $2, $3, 'out', $4, $5, $6, 'sent', $7)`,
    [randomUUID(), contactId, data.waMessageId, data.type, data.body, data.templateName, actor?.userId ?? null]
  );
  await db.query(
    `UPDATE crm_contacts SET last_message_at = now(), last_message_preview = $2, updated_at = now() WHERE id = $1`,
    [contactId, preview(data.type, data.body, data.templateName)]
  );
}

/**
 * Stores one inbound WhatsApp message: finds the contact (either spelling of
 * a Brazilian mobile) or creates it, saves the message once (WhatsApp
 * retries deliveries, so a repeated wa_message_id is ignored), bumps the
 * unread counter and reopens the 24h window. A lead still in "Novo" that
 * answers a message the team sent moves to "Em conversa" on its own.
 */
export async function recordInbound(msg: InboundMessage): Promise<void> {
  await withTransaction(async (client) => {
    const found = await client.query<{ id: string; stage: string }>(
      `SELECT id, stage FROM crm_contacts WHERE phone = ANY($1) ORDER BY created_at LIMIT 1 FOR UPDATE`,
      [phoneVariants(msg.from)]
    );
    let contactId = found.rows[0]?.id;
    const isNew = !contactId;
    if (!contactId) {
      contactId = randomUUID();
      await client.query(
        `INSERT INTO crm_contacts (id, phone, name, source, ad_referral) VALUES ($1, $2, $3, $4, $5)`,
        [contactId, msg.from, msg.profileName?.trim() || formatPhone(msg.from), msg.referral ? "anuncio" : "outro", msg.referral ? JSON.stringify(msg.referral) : null]
      );
      await addEvent(client, contactId, "created", { via: msg.referral ? "anuncio" : "whatsapp" }, null);
    }

    const inserted = await client.query(
      `INSERT INTO crm_messages (id, contact_id, wa_message_id, direction, type, body, media_id, media_mime, status, created_at)
       VALUES ($1, $2, $3, 'in', $4, $5, $6, $7, 'received', $8)
       ON CONFLICT (wa_message_id) DO NOTHING`,
      [randomUUID(), contactId, msg.waMessageId, msg.type, msg.body, msg.mediaId, msg.mediaMime, msg.timestamp]
    );
    if (inserted.rowCount === 0) return;

    await client.query(
      `UPDATE crm_contacts
       SET last_message_at = GREATEST(COALESCE(last_message_at, $2), $2),
           last_inbound_at = GREATEST(COALESCE(last_inbound_at, $2), $2),
           -- a late retry of an older message must not replace the preview
           last_message_preview = CASE WHEN last_message_at IS NULL OR $2 >= last_message_at THEN $3 ELSE last_message_preview END,
           unread_count = unread_count + 1,
           ad_referral = COALESCE(ad_referral, $4),
           updated_at = now()
       WHERE id = $1`,
      [contactId, msg.timestamp, preview(msg.type, msg.body, null), msg.referral ? JSON.stringify(msg.referral) : null]
    );

    if (!isNew && found.rows[0].stage === "novo") {
      const outbound = await client.query(`SELECT 1 FROM crm_messages WHERE contact_id = $1 AND direction = 'out' LIMIT 1`, [contactId]);
      if (outbound.rows.length > 0) {
        await client.query(`UPDATE crm_contacts SET stage = 'conversa', stage_changed_at = now() WHERE id = $1`, [contactId]);
        await addEvent(client, contactId, "stage", { from: "novo", to: "conversa", auto: true }, null);
      }
    }
  });
}

/** Never moves a message backwards (a late "delivered" after "read" is ignored); "failed" always wins. */
export async function applyStatus(update: StatusUpdate): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE crm_messages SET status = $2, error = COALESCE($3, error)
     WHERE wa_message_id = $1
       AND COALESCE(array_position(ARRAY['sent','delivered','read','failed'], status), 0)
           < array_position(ARRAY['sent','delivered','read','failed'], $2::text)`,
    [update.waMessageId, update.status, update.error]
  );
}

export async function isKnownMedia(mediaId: string): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query(`SELECT 1 FROM crm_messages WHERE media_id = $1 LIMIT 1`, [mediaId]);
  return rows.length > 0;
}

export async function listQuickReplies(): Promise<CrmQuickReply[]> {
  const db = await getDb();
  const { rows } = await db.query<CrmQuickReply>(`SELECT id, title, body FROM crm_quick_replies ORDER BY title`);
  return rows;
}

export async function createQuickReply(title: unknown, body: unknown, actor: CrmActor): Promise<CrmQuickReply> {
  const t = cleanText(title, 60);
  const b = cleanText(body, 2000);
  if (!t || !b) throw new CrmInputError("Informe o título e o texto da resposta rápida.");
  const db = await getDb();
  const id = randomUUID();
  await db.query(`INSERT INTO crm_quick_replies (id, title, body, created_by) VALUES ($1, $2, $3, $4)`, [id, t, b, actor?.userId ?? null]);
  return { id, title: t, body: b };
}

export async function deleteQuickReply(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM crm_quick_replies WHERE id = $1`, [id]);
}
