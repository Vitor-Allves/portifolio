// Server-only data layer for the CRM (área /crm). Every function here
// assumes the caller already checked the session is internal staff — see
// src/lib/crm-auth.ts. Companies live in crm-companies.ts, spreadsheet
// imports in crm-import.ts; the shared pieces are in crm-core.ts.

import { randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import {
  formatPhone,
  isCrmConsentStatus,
  isCrmStage,
  isCrmTemperature,
  isPlausibleEmail,
  temperatureLabel,
  normalizePhone,
  phoneVariants,
  type CrmAdReferral,
  type CrmConsentStatus,
  type CrmContactCard,
  type CrmContactDetail,
  type CrmConversation,
  type CrmEvent,
  type CrmEventKind,
  type CrmFacets,
  type CrmMessage,
  type CrmPage,
  type CrmQuickReply,
  type CrmSource,
  type CrmTeamMember,
} from "./crm-types";
import { isOptOutText } from "./crm-campaign-rules";
import { listContactTags, optionLabel, requireOptionId, requireSegment } from "./crm-options";
import {
  CrmInputError,
  addEvent,
  brDate,
  cleanText,
  escapeLike,
  iso,
  parseDateOnly,
  parseTemperature,
  resolveCompanyId,
  type CrmActor,
} from "./crm-core";
import { createDealTx, listContactDeals, setContactStageTx, updateDealTx } from "./crm-deals";
import { createTaskTx, listContactTasks } from "./crm-tasks";
import { afterContactCreated, afterInbound, afterOwnersAssigned } from "./crm-automation-hooks";
import type { InboundMessage, StatusUpdate } from "./whatsapp";
import { effectiveCrmAccess } from "./crm-permissions";
import type { StaffRole } from "./session-scope";

export { CrmInputError, type CrmActor } from "./crm-core";

type CardRow = {
  id: string;
  phone: string | null;
  name: string;
  email: string | null;
  job_title: string | null;
  company_id: string | null;
  company: string | null;
  segment: string | null;
  city: string | null;
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
  consent_status: string;
  consent_source: string | null;
  consent_at: Date | null;
  opted_out_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  tag_ids: string[];
  temperature: string | null;
  service_interest: string | null;
  return_at: string | null;
  is_decision_maker: boolean;
  last_interaction_at: Date | null;
  task_id: string | null;
  task_kind: string | null;
  task_title: string | null;
  task_due_at: Date | null;
  task_all_day: boolean | null;
  attendant_id: string | null;
  attendant_name: string | null;
  attendant_since: Date | null;
};

// Company name, segment and city come from the linked company when there is
// one (the legacy free-text column is only a fallback for unmigrated rows).
const CARD_SELECT = `
  SELECT c.id, c.phone, c.name, c.email, c.job_title, c.company_id,
         COALESCE(co.name, c.company) AS company,
         COALESCE(co.segment, c.segment) AS segment,
         COALESCE(co.city, c.city) AS city,
         c.source, c.referred_by, c.stage, c.owner_id, u.name AS owner_name,
         c.next_action, c.next_action_at, c.last_message_at, c.last_message_preview, c.last_inbound_at,
         c.unread_count, c.ad_referral, c.stage_changed_at, c.consent_status, c.consent_source, c.consent_at,
         c.opted_out_at, c.archived_at, c.created_at,
         ARRAY(SELECT ct.tag_id FROM crm_contact_tags ct WHERE ct.contact_id = c.id ORDER BY ct.applied_at, ct.tag_id) AS tag_ids,
         c.temperature, c.service_interest, to_char(c.return_at, 'YYYY-MM-DD') AS return_at, c.is_decision_maker,
         -- Última interação: the latest message, note or finished task (GREATEST skips nulls).
         GREATEST(
           c.last_message_at,
           (SELECT max(e.created_at) FROM crm_events e WHERE e.contact_id = c.id AND e.kind = 'note'),
           (SELECT max(t.done_at) FROM crm_tasks t WHERE t.contact_id = c.id AND t.done_at IS NOT NULL)
         ) AS last_interaction_at,
         nt.id AS task_id, nt.kind AS task_kind, nt.title AS task_title, nt.due_at AS task_due_at, nt.all_day AS task_all_day,
         c.attendant_id, au.name AS attendant_name, c.attendant_since
  FROM crm_contacts c
  LEFT JOIN crm_companies co ON co.id = c.company_id
  LEFT JOIN internal_users u ON u.id = c.owner_id
  LEFT JOIN internal_users au ON au.id = c.attendant_id
  -- Próxima atividade: the earliest pending task.
  LEFT JOIN LATERAL (
    SELECT t.id, t.kind, t.title, t.due_at, t.all_day FROM crm_tasks t
    WHERE t.contact_id = c.id AND t.done_at IS NULL AND t.canceled_at IS NULL
    ORDER BY t.due_at ASC NULLS LAST, t.created_at
    LIMIT 1
  ) nt ON true`;

function mapCard(r: CardRow): CrmContactCard {
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    email: r.email,
    jobTitle: r.job_title,
    companyId: r.company_id,
    company: r.company,
    segment: r.segment,
    city: r.city,
    source: r.source,
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
    consentStatus: isCrmConsentStatus(r.consent_status) ? r.consent_status : "nao_informado",
    optedOutAt: iso(r.opted_out_at),
    archivedAt: iso(r.archived_at),
    createdAt: iso(r.created_at)!,
    tagIds: r.tag_ids ?? [],
    temperature: isCrmTemperature(r.temperature) ? r.temperature : null,
    serviceInterest: r.service_interest,
    returnAt: r.return_at,
    isDecisionMaker: r.is_decision_maker,
    lastInteractionAt: iso(r.last_interaction_at),
    nextTask:
      r.task_id && r.task_kind
        ? { id: r.task_id, kind: r.task_kind, title: r.task_title ?? "", dueAt: iso(r.task_due_at), allDay: r.task_all_day ?? true }
        : null,
    attendantId: r.attendant_id,
    attendantName: r.attendant_name,
    attendantSince: iso(r.attendant_since),
  };
}

/** Everything on the Kanban board — archived leads stay out of it. */
export async function listContacts(visibleTo: string | null = null): Promise<CrmContactCard[]> {
  const { sql, values } = contactWhere({ visibleTo });
  const db = await getDb();
  const { rows } = await db.query<CardRow>(`${CARD_SELECT} ${sql} ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`, values);
  return rows.map(mapCard);
}

export type ContactFilters = {
  q?: string;
  stage?: string;
  /** "mine" needs currentUserId; "none" = no owner; anything else = that user's id. */
  owner?: string;
  currentUserId?: string;
  source?: string;
  segment?: string;
  city?: string;
  /** "sim" | "nao_informado" | "descadastrado" */
  consent?: string;
  companyId?: string;
  /** true = only archived; default = only active. */
  archived?: boolean;
  /** Only contacts with this tag (crm_tags.id). */
  tag?: string;
  /** frio | morno | quente */
  temperature?: string;
  /** Serviço de interesse (crm_options kind "service"). */
  service?: string;
  /** "atrasado" = return date already past; "7d" = due within the next 7 days. */
  returnDue?: string;
  /** Comercial profile: only leads this user owns or that have no owner. */
  visibleTo?: string | null;
};

export type ContactSort = "recent" | "name" | "created";

export function contactWhere(f: ContactFilters): { sql: string; values: unknown[] } {
  const where: string[] = [f.archived ? "c.archived_at IS NOT NULL" : "c.archived_at IS NULL"];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    values.push(value);
    where.push(sql(values.length));
  };
  const q = f.q?.trim();
  if (q) {
    values.push(`%${escapeLike(q)}%`);
    const n = values.length;
    const digits = q.replace(/\D/g, "");
    let phoneSql = "";
    if (digits.length >= 4) {
      values.push(`%${digits}%`);
      phoneSql = ` OR c.phone LIKE $${values.length}`;
    }
    where.push(`(c.name ILIKE $${n} OR c.email ILIKE $${n} OR COALESCE(co.name, c.company, '') ILIKE $${n}${phoneSql})`);
  }
  if (f.stage && isCrmStage(f.stage)) add((n) => `c.stage = $${n}`, f.stage);
  if (f.owner === "mine" && f.currentUserId) add((n) => `c.owner_id = $${n}`, f.currentUserId);
  else if (f.owner === "none") where.push("c.owner_id IS NULL");
  // Leads still with someone who was deactivated (a carteira to transfer).
  else if (f.owner === "inactive") where.push("c.owner_id IN (SELECT id FROM internal_users WHERE revoked_at IS NOT NULL)");
  else if (f.owner && f.owner !== "all" && f.owner !== "mine") add((n) => `c.owner_id = $${n}`, f.owner);
  if (f.source) add((n) => `c.source = $${n}`, f.source);
  if (f.tag) add((n) => `EXISTS (SELECT 1 FROM crm_contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = $${n})`, f.tag);
  if (f.temperature && isCrmTemperature(f.temperature)) add((n) => `c.temperature = $${n}`, f.temperature);
  if (f.service) add((n) => `c.service_interest = $${n}`, f.service);
  // Brasília's calendar day, whatever the server's timezone.
  if (f.returnDue === "atrasado") where.push(`c.return_at < (now() AT TIME ZONE 'America/Sao_Paulo')::date`);
  else if (f.returnDue === "7d") where.push(`c.return_at BETWEEN (now() AT TIME ZONE 'America/Sao_Paulo')::date AND (now() AT TIME ZONE 'America/Sao_Paulo')::date + 7`);
  if (f.segment) add((n) => `COALESCE(co.segment, c.segment) = $${n}`, f.segment);
  if (f.city) add((n) => `COALESCE(co.city, c.city) = $${n}`, f.city);
  if (f.consent === "descadastrado") where.push("c.opted_out_at IS NOT NULL");
  else if (f.consent && isCrmConsentStatus(f.consent)) add((n) => `c.consent_status = $${n} AND c.opted_out_at IS NULL`, f.consent);
  if (f.companyId) add((n) => `c.company_id = $${n}`, f.companyId);
  if (f.visibleTo) add((n) => `(c.owner_id = $${n} OR c.owner_id IS NULL)`, f.visibleTo);
  return { sql: `WHERE ${where.join(" AND ")}`, values };
}

/** List/export filters from a request's query string (?q=&stage=&owner=…). */
export function contactFiltersFromSearch(params: URLSearchParams, currentUserId: string): ContactFilters {
  const get = (k: string) => params.get(k)?.trim() || undefined;
  return {
    q: get("q"),
    stage: get("stage"),
    owner: get("owner"),
    currentUserId,
    source: get("source"),
    segment: get("segment"),
    city: get("city"),
    consent: get("consent"),
    companyId: get("company"),
    tag: get("tag"),
    temperature: get("temperature"),
    service: get("service"),
    returnDue: get("returnDue"),
    archived: params.get("archived") === "1",
  };
}

export function pageFromSearch(params: URLSearchParams, maxSize = 100): { page: number; pageSize: number; sort: ContactSort } {
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const pageSize = Math.min(maxSize, Math.max(1, Math.floor(Number(params.get("pageSize")) || 25)));
  const s = params.get("sort");
  const sort: ContactSort = s === "name" || s === "created" ? s : "recent";
  return { page, pageSize, sort };
}

const SORT_SQL: Record<ContactSort, string> = {
  recent: "COALESCE(c.last_message_at, c.updated_at) DESC, c.id",
  name: "lower(c.name), c.id",
  created: "c.created_at DESC, c.id",
};

export async function listContactsPage(filters: ContactFilters, page: number, pageSize: number, sort: ContactSort = "recent"): Promise<CrmPage<CrmContactCard>> {
  const { sql, values } = contactWhere(filters);
  const db = await getDb();
  const [total, rows] = await Promise.all([
    db.query<{ n: string }>(`SELECT count(*) AS n FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id ${sql}`, values),
    db.query<CardRow>(`${CARD_SELECT} ${sql} ORDER BY ${SORT_SQL[sort]} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [
      ...values,
      pageSize,
      (page - 1) * pageSize,
    ]),
  ]);
  return { rows: rows.rows.map(mapCard), total: Number(total.rows[0].n), page, pageSize };
}

/** Rows for the CSV export (same filters as the list), capped so one click can't pull the whole base by accident. */
export async function listContactsForExport(filters: ContactFilters, limit = 10_000): Promise<CrmContactCard[]> {
  const { sql, values } = contactWhere(filters);
  const db = await getDb();
  const { rows } = await db.query<CardRow>(`${CARD_SELECT} ${sql} ORDER BY lower(c.name), c.id LIMIT $${values.length + 1}`, [...values, limit]);
  return rows.map(mapCard);
}

export async function listFacets(): Promise<CrmFacets> {
  const db = await getDb();
  const { rows } = await db.query<{ kind: string; value: string }>(
    `SELECT DISTINCT 'segment' AS kind, segment AS value FROM crm_companies WHERE segment IS NOT NULL
     UNION SELECT DISTINCT 'segment', segment FROM crm_contacts WHERE segment IS NOT NULL
     UNION SELECT DISTINCT 'city', city FROM crm_companies WHERE city IS NOT NULL
     UNION SELECT DISTINCT 'city', city FROM crm_contacts WHERE city IS NOT NULL`
  );
  const pick = (kind: string) =>
    rows
      .filter((r) => r.kind === kind)
      .map((r) => r.value)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { segments: pick("segment"), cities: pick("city") };
}

/** People who can own leads: active staff with access to the CRM. */
export async function listTeam(): Promise<CrmTeamMember[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string; role: StaffRole; crm_role: string | null }>(
    `SELECT id, name, role, crm_role FROM internal_users WHERE revoked_at IS NULL ORDER BY name`
  );
  return rows.filter((r) => effectiveCrmAccess(r.crm_role, r.role) !== "sem_acesso").map((r) => ({ id: r.id, name: r.name }));
}

export async function getContactDetail(id: string): Promise<CrmContactDetail | null> {
  const db = await getDb();
  const { rows } = await db.query<CardRow>(`${CARD_SELECT} WHERE c.id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;

  const [messages, events, deals, tasks] = await Promise.all([
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
      campaign_name: string | null;
      created_at: Date;
    }>(
      // The latest 500, returned oldest first for display.
      `SELECT * FROM (
         SELECT m.id, m.direction, m.type, m.body, m.media_id, m.media_mime, m.template_name, m.status, m.error,
                u.name AS sent_by_name, k.name AS campaign_name, m.created_at, m.seq
         FROM crm_messages m LEFT JOIN internal_users u ON u.id = m.sent_by
         LEFT JOIN crm_campaigns k ON k.id = m.campaign_id
         WHERE m.contact_id = $1 ORDER BY m.created_at DESC, m.seq DESC LIMIT 500
       ) recent ORDER BY created_at ASC, seq ASC`,
      [id]
    ),
    db.query<{ id: string; kind: CrmEventKind; payload: Record<string, unknown>; user_name: string | null; created_at: Date }>(
      `SELECT id, kind, payload, user_name, created_at FROM crm_events WHERE contact_id = $1 ORDER BY created_at ASC, seq ASC`,
      [id]
    ),
    listContactDeals(db, id),
    listContactTasks(db, id),
  ]);
  const tagLinks = await listContactTags(id);

  return {
    ...mapCard(row),
    consentSource: row.consent_source,
    consentAt: iso(row.consent_at),
    adReferral: row.ad_referral,
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
        campaignName: m.campaign_name,
        createdAt: iso(m.created_at)!,
      })
    ),
    events: events.rows.map(
      (e): CrmEvent => ({ id: e.id, kind: e.kind, payload: e.payload, userName: e.user_name, createdAt: iso(e.created_at)! })
    ),
    deals,
    tasks,
    tagLinks,
  };
}

/** Contacts with messages nobody has opened yet — the inbox at the top of the Tarefas tab. */
export async function listUnreadContacts(visibleTo: string | null = null): Promise<CrmContactCard[]> {
  const { sql, values } = contactWhere({ visibleTo });
  const db = await getDb();
  const { rows } = await db.query<CardRow>(
    `${CARD_SELECT} ${sql} AND c.unread_count > 0 ORDER BY c.last_inbound_at DESC NULLS LAST LIMIT 50`,
    values
  );
  return rows.map(mapCard);
}


export type ConversationFilters = Pick<ContactFilters, "q" | "owner" | "currentUserId" | "visibleTo" | "tag"> & {
  /** Only conversations with an opportunity in this funnel stage. */
  stage?: string;
  unread?: boolean;
  /** Atendimento: "mine" | "none" | a user id. */
  attendant?: string;
  /** Only conversations waiting for our answer (the newest message is the contact's). */
  waiting?: boolean;
};

/** The contact's first message after our last one (null when we answered last, or nothing came from them). */
const WAITING_SINCE = `(SELECT min(m.created_at) FROM crm_messages m
   WHERE m.contact_id = x.id AND m.direction = 'in'
     AND m.created_at > COALESCE((SELECT max(o.created_at) FROM crm_messages o WHERE o.contact_id = x.id AND o.direction = 'out'), '-infinity'))`;

/**
 * WhatsApp conversations — active contacts with at least one message — newest
 * first, each with the stages of its opportunities. Keyset-paginated by
 * (last_message_at, id): pass the returned `next` back as `before`.
 */
export async function listConversations(
  f: ConversationFilters,
  opts: { before?: string | null; limit?: number } = {}
): Promise<{ rows: CrmConversation[]; next: string | null; unreadTotal: number }> {
  const { sql, values } = contactWhere({ q: f.q, owner: f.owner, currentUserId: f.currentUserId, visibleTo: f.visibleTo, tag: f.tag });
  const unreadScope = contactWhere({ visibleTo: f.visibleTo });
  const extra = ["c.last_message_at IS NOT NULL"];
  if (f.unread) extra.push("c.unread_count > 0");
  if (f.attendant === "mine" && f.currentUserId) {
    values.push(f.currentUserId);
    extra.push(`c.attendant_id = $${values.length}`);
  } else if (f.attendant === "none") {
    extra.push("c.attendant_id IS NULL");
  } else if (f.attendant && f.attendant !== "all") {
    values.push(f.attendant);
    extra.push(`c.attendant_id = $${values.length}`);
  }
  // The newest message is the contact's: waiting for us.
  if (f.waiting) extra.push("c.last_inbound_at IS NOT NULL AND c.last_inbound_at >= c.last_message_at");
  if (f.stage && isCrmStage(f.stage)) {
    values.push(f.stage);
    extra.push(`EXISTS (SELECT 1 FROM crm_deals d WHERE d.contact_id = c.id AND d.stage = $${values.length})`);
  }
  const cut = (opts.before ?? "").lastIndexOf("|");
  const beforeAt = cut > 0 ? opts.before!.slice(0, cut) : "";
  const beforeId = cut > 0 ? opts.before!.slice(cut + 1) : "";
  if (beforeAt && beforeId && !Number.isNaN(Date.parse(beforeAt))) {
    values.push(new Date(beforeAt), beforeId);
    extra.push(`(c.last_message_at, c.id) < ($${values.length - 1}, $${values.length})`);
  }
  const limit = Math.min(200, Math.max(1, Math.floor(opts.limit ?? 60)));
  values.push(limit + 1);
  const db = await getDb();
  const [list, unread] = await Promise.all([
    db.query<CardRow & { deal_stages: string[]; waiting_since: Date | null }>(
      `SELECT x.*, ARRAY(SELECT d.stage FROM crm_deals d LEFT JOIN crm_options o ON o.kind = 'stage' AND o.id = d.stage
                          WHERE d.contact_id = x.id GROUP BY d.stage, o.sort ORDER BY o.sort NULLS LAST, d.stage) AS deal_stages, ${WAITING_SINCE} AS waiting_since
       FROM (${CARD_SELECT} ${sql} AND ${extra.join(" AND ")}
             ORDER BY c.last_message_at DESC, c.id DESC LIMIT $${values.length}) x
       ORDER BY x.last_message_at DESC, x.id DESC`,
      values
    ),
    db.query<{ n: string }>(`SELECT count(*) AS n FROM crm_contacts c ${unreadScope.sql} AND c.unread_count > 0`, unreadScope.values),
  ]);
  const rows = list.rows.slice(0, limit).map((r) => ({
    ...mapCard(r),
    // In the funnel's order (Personalização).
    dealStages: r.deal_stages.filter(isCrmStage),
    waitingSince: iso(r.waiting_since),
  }));
  const last = rows[rows.length - 1];
  return {
    rows,
    next: list.rows.length > limit && last?.lastMessageAt ? `${last.lastMessageAt}|${last.id}` : null,
    unreadTotal: Number(unread.rows[0].n),
  };
}

/** Normalized phone, or null when empty. Throws on something that can't be a phone. */
export function parsePhone(value: unknown): string | null {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "string") throw new CrmInputError("Telefone inválido.");
  const phone = normalizePhone(value);
  if (phone.length < 10 || phone.length > 15) throw new CrmInputError("Telefone inválido — use DDD + número, ex.: (15) 99999-8888.");
  return phone;
}

export function parseEmail(value: unknown): string | null {
  const email = cleanText(value, 160)?.toLowerCase() ?? null;
  if (email && !isPlausibleEmail(email)) throw new CrmInputError("E-mail inválido.");
  return email;
}

type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: { id: string; name: string }[] }> };

/** The contact already using this phone (either spelling of a BR mobile) or e-mail — archived ones included, so an archived lead is restored rather than duplicated. */
export async function findDuplicate(
  db: Queryable,
  phone: string | null,
  email: string | null,
  exceptId?: string
): Promise<{ id: string; name: string; by: "phone" | "email" } | null> {
  if (phone) {
    const { rows } = await db.query(`SELECT id, name FROM crm_contacts WHERE phone = ANY($1) AND id <> $2 LIMIT 1`, [phoneVariants(phone), exceptId ?? ""]);
    if (rows[0]) return { ...rows[0], by: "phone" };
  }
  if (email) {
    const { rows } = await db.query(`SELECT id, name FROM crm_contacts WHERE lower(email) = $1 AND id <> $2 LIMIT 1`, [email, exceptId ?? ""]);
    if (rows[0]) return { ...rows[0], by: "email" };
  }
  return null;
}

export function duplicateMessage(dup: { name: string; by: "phone" | "email" }): string {
  return `Já existe um contato com esse ${dup.by === "phone" ? "telefone" : "e-mail"}: ${dup.name}.`;
}

export type NewContactInput = {
  name: unknown;
  phone?: unknown;
  email?: unknown;
  jobTitle?: unknown;
  company?: unknown;
  segment?: unknown;
  city?: unknown;
  source?: unknown;
  referredBy?: unknown;
  consentStatus?: unknown;
  consentSource?: unknown;
  ownerId?: unknown;
  temperature?: unknown;
  serviceInterest?: unknown;
  returnAt?: unknown;
  isDecisionMaker?: unknown;
  /** Open an opportunity in "Novo" for this lead (default true). */
  createDeal?: unknown;
  dealTitle?: unknown;
  dealValue?: unknown;
};

export async function createContact(input: NewContactInput, actor: CrmActor): Promise<string> {
  const name = cleanText(input.name, 120);
  if (!name) throw new CrmInputError("Informe o nome do contato.");
  const phone = parsePhone(input.phone);
  const email = parseEmail(input.email);
  if (!phone && !email) throw new CrmInputError("Informe o WhatsApp ou o e-mail do contato.");
  const ownerId = typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null;
  const consentSource = cleanText(input.consentSource, 200);
  // Filling in "como aceitou" is itself a yes; otherwise use what was picked.
  const consentStatus: CrmConsentStatus = isCrmConsentStatus(input.consentStatus) ? input.consentStatus : consentSource ? "sim" : "nao_informado";
  const segment = cleanText(input.segment, 80);
  const city = cleanText(input.city, 80);
  const temperature = parseTemperature(input.temperature);
  const returnAt = parseDateOnly(input.returnAt, "Data de retorno");

  return withTransaction(async (client) => {
    const dup = await findDuplicate(client, phone, email);
    if (dup) throw new CrmInputError(duplicateMessage(dup));
    const source: CrmSource = await requireOptionId(client, "source", input.source === undefined || input.source === "" ? "outro" : input.source);
    const serviceInterest =
      input.serviceInterest === undefined || input.serviceInterest === null || input.serviceInterest === ""
        ? null
        : await requireOptionId(client, "service", input.serviceInterest);
    await requireSegment(client, segment);
    const companyId = await resolveCompanyId(client, input.company, { segment, city }, actor);
    const id = randomUUID();
    await client.query(
      `INSERT INTO crm_contacts (id, phone, name, email, job_title, company_id, segment, city, source, referred_by,
                                 consent_status, consent_source, consent_at, owner_id,
                                 temperature, service_interest, return_at, is_decision_maker)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        id,
        phone,
        name,
        email,
        cleanText(input.jobTitle, 80),
        companyId,
        // linked to a company → segment/city live there (resolveCompanyId filled the gaps)
        companyId ? null : segment,
        companyId ? null : city,
        source,
        cleanText(input.referredBy, 120),
        consentStatus,
        consentSource,
        consentStatus === "sim" ? new Date() : null,
        ownerId,
        temperature,
        serviceInterest,
        returnAt,
        input.isDecisionMaker === true,
      ]
    );
    await addEvent(client, id, "created", { via: "manual" }, actor);
    await afterContactCreated(client, id, "manual");
    if (ownerId) await afterOwnersAssigned(client, [{ contactId: id, ownerId }], actor);
    if (input.createDeal !== false) {
      await createDealTx(
        client,
        { contactId: id, title: input.dealTitle, value: input.dealValue, ownerId: ownerId ?? "", service: serviceInterest ?? undefined },
        actor
      );
    }
    return id;
  });
}

export type ContactPatch = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  jobTitle?: unknown;
  company?: unknown;
  segment?: unknown;
  city?: unknown;
  source?: unknown;
  referredBy?: unknown;
  consentStatus?: unknown;
  consentSource?: unknown;
  optedOut?: unknown;
  archived?: unknown;
  stage?: unknown;
  ownerId?: unknown;
  nextAction?: unknown;
  nextActionAt?: unknown;
  temperature?: unknown;
  serviceInterest?: unknown;
  returnAt?: unknown;
  isDecisionMaker?: unknown;
};

const FIELD_LABEL: Record<string, string> = {
  name: "Nome",
  phone: "WhatsApp",
  email: "E-mail",
  job_title: "Cargo",
  company: "Empresa",
  segment: "Segmento",
  city: "Cidade",
  source: "Origem",
  referred_by: "Indicado por",
  consent_source: "Como aceitou",
  temperature: "Temperatura",
  service_interest: "Serviço de interesse",
  return_at: "Retorno previsto",
  is_decision_maker: "Decisor",
};

/** Applies whatever fields are present; every meaningful change lands in the contact's history. false = no such contact. */
export async function updateContact(id: string, patch: ContactPatch, actor: CrmActor): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<CardRow & { own_segment: string | null; own_city: string | null }>(
      `SELECT c.*, c.segment AS own_segment, c.city AS own_city, COALESCE(co.name, c.company) AS company,
              to_char(c.return_at, 'YYYY-MM-DD') AS return_at_day,
              co.segment AS co_segment, co.city AS co_city
       FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id
       WHERE c.id = $1 FOR UPDATE OF c`,
      [id]
    );
    const current = rows[0] as
      | (CardRow & { own_segment: string | null; own_city: string | null; co_segment: string | null; co_city: string | null; return_at_day: string | null })
      | undefined;
    if (!current) return false;

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    const changes: { field: string; from: string | null; to: string | null }[] = [];
    const change = (key: string, from: string | null, to: string | null) => {
      if ((from ?? null) !== (to ?? null)) changes.push({ field: FIELD_LABEL[key] ?? key, from: from ?? null, to: to ?? null });
    };
    const text = (key: keyof ContactPatch, column: keyof CardRow, max: number) => {
      if (patch[key] === undefined) return;
      const value = cleanText(patch[key], max);
      change(column, current[column] as string | null, value);
      set(column, value);
    };

    if (patch.name !== undefined) {
      const name = cleanText(patch.name, 120);
      if (!name) throw new CrmInputError("O nome não pode ficar vazio.");
      change("name", current.name, name);
      set("name", name);
    }
    let nextPhone = current.phone;
    let nextEmail = current.email;
    if (patch.phone !== undefined) nextPhone = parsePhone(patch.phone);
    if (patch.email !== undefined) nextEmail = parseEmail(patch.email);
    if (patch.phone !== undefined || patch.email !== undefined) {
      if (!nextPhone && !nextEmail) throw new CrmInputError("O contato precisa ter WhatsApp ou e-mail.");
      const dup = await findDuplicate(
        client,
        nextPhone !== current.phone ? nextPhone : null,
        nextEmail !== current.email ? nextEmail : null,
        id
      );
      if (dup) throw new CrmInputError(duplicateMessage(dup));
      if (patch.phone !== undefined) {
        change("phone", current.phone, nextPhone);
        set("phone", nextPhone);
      }
      if (patch.email !== undefined) {
        change("email", current.email, nextEmail);
        set("email", nextEmail);
      }
    }
    text("jobTitle", "job_title", 80);
    text("referredBy", "referred_by", 120);
    text("consentSource", "consent_source", 200);
    if (patch.source !== undefined && patch.source !== current.source) {
      const next = await requireOptionId(client, "source", patch.source, current.source);
      change("source", await optionLabel(client, "source", current.source), await optionLabel(client, "source", next));
      set("source", next);
    }
    if (patch.temperature !== undefined) {
      const next = parseTemperature(patch.temperature);
      change("temperature", temperatureLabel(current.temperature) || null, temperatureLabel(next) || null);
      set("temperature", next);
    }
    if (patch.serviceInterest !== undefined && (patch.serviceInterest || null) !== current.service_interest) {
      const next = patch.serviceInterest ? await requireOptionId(client, "service", patch.serviceInterest, current.service_interest) : null;
      change(
        "service_interest",
        current.service_interest ? await optionLabel(client, "service", current.service_interest) : null,
        next ? await optionLabel(client, "service", next) : null
      );
      set("service_interest", next);
    }
    if (patch.returnAt !== undefined) {
      const next = parseDateOnly(patch.returnAt, "Data de retorno");
      change("return_at", brDate(current.return_at_day), brDate(next));
      set("return_at", next);
    }
    if (patch.isDecisionMaker !== undefined) {
      const next = patch.isDecisionMaker === true;
      if (next !== current.is_decision_maker) {
        change("is_decision_maker", current.is_decision_maker ? "Sim" : "Não", next ? "Sim" : "Não");
        set("is_decision_maker", next);
      }
    }

    // Company first, then segment/city: they belong to the company when there is one.
    let companyId = current.company_id;
    let companySegment = current.co_segment;
    let companyCity = current.co_city;
    if (patch.company !== undefined) {
      const segmentHint = cleanText(patch.segment, 80) ?? current.own_segment;
      const cityHint = cleanText(patch.city, 80) ?? current.own_city;
      companyId = await resolveCompanyId(client, patch.company, { segment: segmentHint, city: cityHint }, actor);
      if (companyId !== current.company_id) {
        const name = companyId ? (await client.query<{ name: string; segment: string | null; city: string | null }>(`SELECT name, segment, city FROM crm_companies WHERE id = $1`, [companyId])).rows[0] : null;
        companySegment = name?.segment ?? null;
        companyCity = name?.city ?? null;
        change("company", current.company, name?.name ?? null);
        set("company_id", companyId);
      }
    }
    for (const field of ["segment", "city"] as const) {
      if (patch[field] === undefined) continue;
      const value = cleanText(patch[field], 80);
      if (field === "segment") await requireSegment(client, value, companyId ? companySegment : current.own_segment);
      if (companyId) {
        const before = field === "segment" ? companySegment : companyCity;
        if ((before ?? null) !== value) {
          await client.query(`UPDATE crm_companies SET ${field} = $2, updated_at = now() WHERE id = $1`, [companyId, value]);
          change(field, before, value);
        }
      } else {
        const before = field === "segment" ? current.own_segment : current.own_city;
        change(field, before, value);
        set(field, value);
      }
    }

    if (patch.consentStatus !== undefined && patch.consentStatus !== current.consent_status) {
      if (!isCrmConsentStatus(patch.consentStatus)) throw new CrmInputError("Consentimento inválido.");
      set("consent_status", patch.consentStatus);
      set("consent_at", patch.consentStatus === "sim" ? new Date() : null);
      await addEvent(client, id, "consent", { to: patch.consentStatus }, actor);
    }
    if (patch.optedOut !== undefined) {
      const optedOut = patch.optedOut === true;
      if (optedOut !== (current.opted_out_at !== null)) {
        set("opted_out_at", optedOut ? new Date() : null);
        await addEvent(client, id, "opt_out", { value: optedOut }, actor);
      }
    }
    if (patch.archived !== undefined) {
      const archived = patch.archived === true;
      if (archived !== (current.archived_at !== null)) {
        set("archived_at", archived ? new Date() : null);
        await addEvent(client, id, archived ? "archived" : "restored", {}, actor);
      }
    }

    // Legacy: the funnel lives on opportunities now; a stage set on the
    // contact goes to its main opportunity (which syncs contact.stage back).
    if (patch.stage !== undefined && patch.stage !== current.stage) {
      await setContactStageTx(client, id, patch.stage, actor);
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
        await afterOwnersAssigned(client, [{ contactId: id, ownerId }], actor);
      }
    }

    // Legacy: "próxima ação" is a task now.
    if ((patch.nextAction !== undefined && cleanText(patch.nextAction, 200)) || (typeof patch.nextActionAt === "string" && patch.nextActionAt)) {
      await createTaskTx(client, { contactId: id, kind: "tarefa", title: patch.nextAction, dueDate: patch.nextActionAt }, actor);
    }

    if (changes.length > 0) await addEvent(client, id, "edited", { changes }, actor);
    if (sets.length === 0) {
      if (changes.length > 0) await client.query(`UPDATE crm_contacts SET updated_at = now() WHERE id = $1`, [id]);
      return true;
    }
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

/** null = no such contact. A contact without a phone (e-mail-only lead) can't be messaged on WhatsApp. */
export async function getContactForSending(id: string): Promise<{ phone: string; lastInboundAt: string | null } | null> {
  const db = await getDb();
  const { rows } = await db.query<{ phone: string | null; last_inbound_at: Date | null }>(
    `SELECT phone, last_inbound_at FROM crm_contacts WHERE id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  if (!rows[0].phone) throw new CrmInputError("Este contato não tem WhatsApp cadastrado.");
  return { phone: rows[0].phone, lastInboundAt: iso(rows[0].last_inbound_at) };
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
  data: { waMessageId: string; type: "text" | "template"; body: string | null; templateName: string | null; campaignId?: string | null },
  actor: CrmActor
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO crm_messages (id, contact_id, wa_message_id, direction, type, body, template_name, status, sent_by, campaign_id)
     VALUES ($1, $2, $3, 'out', $4, $5, $6, 'sent', $7, $8)`,
    [randomUUID(), contactId, data.waMessageId, data.type, data.body, data.templateName, actor?.userId ?? null, data.campaignId ?? null]
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
 * answers a message the team sent moves to "Em conversa" on its own; an
 * archived lead that writes again comes back to the board.
 */
export async function recordInbound(msg: InboundMessage): Promise<{ optedOut: { contactId: string; phone: string } | null }> {
  // WhatsApp's timestamp has whole seconds only: a reply arriving in the same
  // second as our last message would sort before it (and the conversation
  // wouldn't read as waiting). A fresh delivery is stamped with the arrival
  // time; a late redelivery keeps WhatsApp's time.
  const age = Date.now() - msg.timestamp.getTime();
  const at = age >= -60_000 && age < 10_000 ? new Date() : msg.timestamp;
  return withTransaction(async (client) => {
    const found = await client.query<{ id: string; stage: string; archived_at: Date | null; opted_out_at: Date | null }>(
      `SELECT id, stage, archived_at, opted_out_at FROM crm_contacts WHERE phone = ANY($1) ORDER BY created_at LIMIT 1 FOR UPDATE`,
      [phoneVariants(msg.from)]
    );
    let contactId = found.rows[0]?.id;
    const isNew = !contactId;
    if (!contactId) {
      contactId = randomUUID();
      // Writing to the number first is the lead's own opt-in to this conversation.
      await client.query(
        `INSERT INTO crm_contacts (id, phone, name, source, ad_referral, consent_status, consent_source, consent_at)
         VALUES ($1, $2, $3, $4, $5, 'sim', 'Iniciou a conversa pelo WhatsApp', now())`,
        [contactId, msg.from, msg.profileName?.trim() || formatPhone(msg.from), msg.referral ? "anuncio" : "outro", msg.referral ? JSON.stringify(msg.referral) : null]
      );
      await addEvent(client, contactId, "created", { via: msg.referral ? "anuncio" : "whatsapp" }, null);
      await createDealTx(client, { contactId, title: msg.referral?.headline ? `${msg.profileName?.trim() || formatPhone(msg.from)} · anúncio` : undefined }, null);
      await afterContactCreated(client, contactId, msg.referral ? "anuncio" : "whatsapp");
    }

    const inserted = await client.query(
      `INSERT INTO crm_messages (id, contact_id, wa_message_id, direction, type, body, media_id, media_mime, status, created_at)
       VALUES ($1, $2, $3, 'in', $4, $5, $6, $7, 'received', $8)
       ON CONFLICT (wa_message_id) DO NOTHING`,
      [randomUUID(), contactId, msg.waMessageId, msg.type, msg.body, msg.mediaId, msg.mediaMime, at]
    );
    if (inserted.rowCount === 0) return { optedOut: null };

    await client.query(
      `UPDATE crm_contacts
       SET last_message_at = GREATEST(COALESCE(last_message_at, $2), $2),
           last_inbound_at = GREATEST(COALESCE(last_inbound_at, $2), $2),
           -- a late retry of an older message must not replace the preview
           last_message_preview = CASE WHEN last_message_at IS NULL OR $2 >= last_message_at THEN $3 ELSE last_message_preview END,
           unread_count = unread_count + 1,
           ad_referral = COALESCE(ad_referral, $4),
           archived_at = NULL,
           updated_at = now()
       WHERE id = $1`,
      [contactId, at, preview(msg.type, msg.body, null), msg.referral ? JSON.stringify(msg.referral) : null]
    );
    if (!isNew && found.rows[0].archived_at) {
      await addEvent(client, contactId, "restored", { auto: true }, null);
    }

    // A lead answering the team: its opportunities still in "Novo" move to "Em conversa".
    if (!isNew) {
      const fresh = await client.query<{ id: string }>(`SELECT id FROM crm_deals WHERE contact_id = $1 AND stage = 'novo'`, [contactId]);
      if (fresh.rows.length > 0) {
        const outbound = await client.query(`SELECT 1 FROM crm_messages WHERE contact_id = $1 AND direction = 'out' LIMIT 1`, [contactId]);
        if (outbound.rows.length > 0) {
          for (const d of fresh.rows) await updateDealTx(client, d.id, { stage: "conversa" }, null, { auto: true });
        }
      }
    }

    // "SAIR" (and similar, as the whole message) unsubscribes from campaigns.
    // The webhook route sends the confirmation after this commits.
    if (!isNew && !found.rows[0].opted_out_at && isOptOutText(msg.body)) {
      await client.query(`UPDATE crm_contacts SET opted_out_at = now(), updated_at = now() WHERE id = $1`, [contactId]);
      await addEvent(client, contactId, "opt_out", { value: true, auto: true, text: msg.body?.trim().slice(0, 60) }, null);
      return { optedOut: { contactId, phone: msg.from } };
    }
    // A real answer (not "SAIR", not from someone unsubscribed) may be a reply to a campaign.
    if (!isNew && !found.rows[0].opted_out_at) await afterInbound(client, contactId, at);
    return { optedOut: null };
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
