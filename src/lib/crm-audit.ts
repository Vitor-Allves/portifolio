// Server-only: the CRM's Auditoria screen and each person's activity
// (especificação v1.0, Fase 2). Two sources, read-only:
//  - audit_log rows of the CRM (crm.*): administrative actions — profiles,
//    permissions, logins, imports, exports, campaigns, Personalização,
//    carteiras, sessions;
//  - crm_events: commercial changes on records — stage moves, values,
//    owners, archiving, opt-outs, field edits.

import { getDb } from "./db";
import { iso } from "./crm-core";
import type { CrmEventKind, CrmPage } from "./crm-types";

export type CrmAuditEntry = {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  metadata: Record<string, unknown>;
};

export type CrmCommercialChange = {
  id: string;
  at: string;
  userId: string | null;
  userName: string | null;
  kind: CrmEventKind;
  payload: Record<string, unknown>;
  contactId: string;
  contactName: string;
};

/** The kinds of contact history that count as commercial changes (not notes, messages or tags). */
export const COMMERCIAL_KINDS: CrmEventKind[] = ["stage", "deal", "owner", "edited", "archived", "restored", "opt_out", "consent"];

export type AuditFilters = { actor?: string; from?: string; to?: string; action?: string; page: number; pageSize: number };

/** "2026-11-01" → start of that day in Brasília; invalid → undefined. */
function dayStart(day: string | undefined): Date | undefined {
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T00:00:00-03:00`) : undefined;
}
function dayEnd(day: string | undefined): Date | undefined {
  const d = dayStart(day);
  return d ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : undefined;
}

export async function listAdminAudit(f: AuditFilters): Promise<CrmPage<CrmAuditEntry>> {
  const where = ["action LIKE 'crm.%'"];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, v: unknown) => {
    values.push(v);
    where.push(sql(values.length));
  };
  if (f.actor) add((n) => `actor_user_id = $${n}`, f.actor);
  if (f.action) add((n) => `action = $${n}`, f.action);
  const from = dayStart(f.from);
  const to = dayEnd(f.to);
  if (from) add((n) => `created_at >= $${n}`, from);
  if (to) add((n) => `created_at < $${n}`, to);
  const db = await getDb();
  const sql = `WHERE ${where.join(" AND ")}`;
  const [total, rows] = await Promise.all([
    db.query<{ n: string }>(`SELECT count(*) AS n FROM audit_log ${sql}`, values),
    db.query<{
      id: string;
      created_at: Date;
      actor_user_id: string | null;
      actor_label: string;
      action: string;
      target_type: string;
      target_id: string | null;
      target_label: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      `SELECT id, created_at, actor_user_id, actor_label, action, target_type, target_id, target_label, metadata
       FROM audit_log ${sql} ORDER BY created_at DESC, id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, f.pageSize, (f.page - 1) * f.pageSize]
    ),
  ]);
  return {
    rows: rows.rows.map((r) => ({
      id: r.id,
      at: iso(r.created_at)!,
      actorId: r.actor_user_id,
      actorName: r.actor_label,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      targetLabel: r.target_label,
      metadata: r.metadata ?? {},
    })),
    total: Number(total.rows[0].n),
    page: f.page,
    pageSize: f.pageSize,
  };
}

export async function listCommercialChanges(f: AuditFilters & { kind?: string }): Promise<CrmPage<CrmCommercialChange>> {
  const where = ["e.kind = ANY($1)"];
  const values: unknown[] = [f.kind && COMMERCIAL_KINDS.includes(f.kind as CrmEventKind) ? [f.kind] : COMMERCIAL_KINDS];
  const add = (sql: (n: number) => string, v: unknown) => {
    values.push(v);
    where.push(sql(values.length));
  };
  if (f.actor) add((n) => `e.user_id = $${n}`, f.actor);
  const from = dayStart(f.from);
  const to = dayEnd(f.to);
  if (from) add((n) => `e.created_at >= $${n}`, from);
  if (to) add((n) => `e.created_at < $${n}`, to);
  const db = await getDb();
  const sql = `WHERE ${where.join(" AND ")}`;
  const [total, rows] = await Promise.all([
    db.query<{ n: string }>(`SELECT count(*) AS n FROM crm_events e ${sql}`, values),
    db.query<{
      id: string;
      created_at: Date;
      user_id: string | null;
      user_name: string | null;
      kind: CrmEventKind;
      payload: Record<string, unknown>;
      contact_id: string;
      contact_name: string;
    }>(
      `SELECT e.id, e.created_at, e.user_id, e.user_name, e.kind, e.payload, e.contact_id, c.name AS contact_name
       FROM crm_events e JOIN crm_contacts c ON c.id = e.contact_id
       ${sql} ORDER BY e.created_at DESC, e.seq DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, f.pageSize, (f.page - 1) * f.pageSize]
    ),
  ]);
  return {
    rows: rows.rows.map((r) => ({
      id: r.id,
      at: iso(r.created_at)!,
      userId: r.user_id,
      userName: r.user_name,
      kind: r.kind,
      payload: r.payload,
      contactId: r.contact_id,
      contactName: r.contact_name,
    })),
    total: Number(total.rows[0].n),
    page: f.page,
    pageSize: f.pageSize,
  };
}

export type CrmPersonActivity = {
  days: number;
  messagesSent: number;
  notes: number;
  tasksDone: number;
  stageMoves: number;
  won: number;
  wonValueCents: number;
  lastActivityAt: string | null;
  /** The person's latest actions on records (any kind). */
  recent: CrmCommercialChange[];
};

/** Produtividade e histórico de atividades de uma pessoa: the last `days` days, plus their latest 30 actions. */
export async function personActivity(userId: string, days = 30): Promise<CrmPersonActivity> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [stats, recent] = await Promise.all([
    db.query<{
      messages: string;
      notes: string;
      tasks_done: string;
      stage_moves: string;
      won: string;
      won_value: string;
      last_event: Date | null;
      last_message: Date | null;
    }>(
      `SELECT (SELECT count(*) FROM crm_messages WHERE sent_by = $1 AND direction = 'out' AND created_at >= $2) AS messages,
              (SELECT count(*) FROM crm_events WHERE user_id = $1 AND kind = 'note' AND created_at >= $2) AS notes,
              (SELECT count(*) FROM crm_tasks WHERE done_by = $1 AND done_at >= $2) AS tasks_done,
              (SELECT count(*) FROM crm_events WHERE user_id = $1 AND kind = 'stage' AND created_at >= $2) AS stage_moves,
              (SELECT count(*) FROM crm_deals WHERE owner_id = $1 AND stage = 'ganho' AND closed_at >= $2) AS won,
              (SELECT COALESCE(sum(COALESCE(negotiated_cents, value_cents)), 0) FROM crm_deals WHERE owner_id = $1 AND stage = 'ganho' AND closed_at >= $2) AS won_value,
              (SELECT max(created_at) FROM crm_events WHERE user_id = $1) AS last_event,
              (SELECT max(created_at) FROM crm_messages WHERE sent_by = $1) AS last_message`,
      [userId, since]
    ),
    db.query<{
      id: string;
      created_at: Date;
      user_id: string | null;
      user_name: string | null;
      kind: CrmEventKind;
      payload: Record<string, unknown>;
      contact_id: string;
      contact_name: string;
    }>(
      `SELECT e.id, e.created_at, e.user_id, e.user_name, e.kind, e.payload, e.contact_id, c.name AS contact_name
       FROM crm_events e JOIN crm_contacts c ON c.id = e.contact_id
       WHERE e.user_id = $1 ORDER BY e.created_at DESC, e.seq DESC LIMIT 30`,
      [userId]
    ),
  ]);
  const s = stats.rows[0];
  const last = [s.last_event, s.last_message].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    days,
    messagesSent: Number(s.messages),
    notes: Number(s.notes),
    tasksDone: Number(s.tasks_done),
    stageMoves: Number(s.stage_moves),
    won: Number(s.won),
    wonValueCents: Number(s.won_value),
    lastActivityAt: iso(last),
    recent: recent.rows.map((r) => ({
      id: r.id,
      at: iso(r.created_at)!,
      userId: r.user_id,
      userName: r.user_name,
      kind: r.kind,
      payload: r.payload,
      contactId: r.contact_id,
      contactName: r.contact_name,
    })),
  };
}
