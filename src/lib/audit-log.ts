// Server-only. Append-only audit trail for every access-management action
// the brief requires tracked. Never records passwords, tokens, TOTP secrets
// or recovery codes — only who did what to which account, when.

import { randomUUID } from "crypto";
import { getDb } from "./db";

export type AuditAction =
  | "user.create"
  | "user.username_change"
  | "user.role_change"
  | "user.permissions_change"
  | "user.company_change"
  | "user.password_reset"
  | "user.password_change_self"
  | "user.revoke"
  | "user.session_revoke"
  | "report.generate"
  | "report.download"
  | "auth.2fa_enroll"
  | "auth.2fa_disable"
  | "auth.2fa_reset_by_admin"
  | "auth.login_failed";

export type AuditActorKind = "admin" | "client" | "system";

export type AuditEntry = {
  actorUserId: string | null;
  actorLabel: string;
  actorKind: AuditActorKind;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown>;
};

/** Never throws — a logging failure must not turn a successful operation into a user-facing error. Failures are surfaced server-side only (console.error), for operator visibility. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDb();
    await db.query(
      `INSERT INTO audit_log (id, actor_user_id, actor_label, actor_kind, action, target_type, target_id, target_label, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        randomUUID(),
        entry.actorUserId,
        entry.actorLabel,
        entry.actorKind,
        entry.action,
        entry.targetType,
        entry.targetId ?? null,
        entry.targetLabel ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ]
    );
  } catch (err) {
    console.error("[audit-log] failed to write entry", entry.action, err);
  }
}

export type AuditLogRow = {
  id: string;
  actorUserId: string | null;
  actorLabel: string;
  actorKind: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  metadata: unknown;
  createdAt: string;
};

export async function listAuditLog(limit = 200): Promise<AuditLogRow[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    actor_user_id: string | null;
    actor_label: string;
    actor_kind: string;
    action: string;
    target_type: string;
    target_id: string | null;
    target_label: string | null;
    metadata: unknown;
    created_at: string;
  }>(`SELECT id, actor_user_id, actor_label, actor_kind, action, target_type, target_id, target_label, metadata, created_at
      FROM audit_log ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    actorUserId: r.actor_user_id,
    actorLabel: r.actor_label,
    actorKind: r.actor_kind,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    targetLabel: r.target_label,
    metadata: r.metadata,
    createdAt: r.created_at,
  }));
}
