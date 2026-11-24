// Server-only. Automações do CRM (especificação v1.0, módulo 9).
//
// - Event rules run right after the action that triggers them commits
//   (crm-automation-hooks.ts); time rules run on the daily check
//   (/api/cron/automations, protected by CRON_SECRET) or when an
//   Administrador clicks "Rodar agora".
// - (automation, dedupe_key) is unique in crm_automation_runs: the same
//   lead / opportunity / task is never handled twice by the same rule, even
//   with two checks at once. A failure is recorded under its own key, so it
//   can be tried again, and never breaks what a person did.
// - Nothing here sends a WhatsApp message or e-mail: automations create
//   tasks, reminders, history lines and notices in the bell.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { CrmInputError, CrmNotFoundError, addEvent, cleanText, iso, type CrmActor, type CrmWriter } from "./crm-core";
import { addTaskEvent, createTaskTx, remindAt } from "./crm-tasks";
import { requireOptionId } from "./crm-options";
import { effectiveCrmAccess } from "./crm-permissions";
import { CAMPAIGN_REPLY_WINDOW } from "./crm-campaign-rules";
import { TASK_REMINDERS_TIMED, isCrmTemperature, reminderLabel, stageLabel, temperatureLabel, type CrmPage } from "./crm-types";
import {
  AUTOMATION_DEFS,
  automationDef,
  isAutomationStatus,
  type AutomationConfig,
  type AutomationDef,
  type AutomationId,
  type AutomationRunSummary,
  type AutomationStatus,
  type CrmAutomation,
  type CrmAutomationRun,
  type CrmNotification,
} from "./crm-automation-defs";
import type { StaffRole } from "./session-scope";

type Q = Pick<PoolClient, "query">;

/** Who the history says did it. */
const WRITER: CrmWriter = { userId: null, userName: "Automação" };

/** Most records one rule handles in one daily check (the next check continues). */
export const SCHEDULED_BATCH = 100;

// ---------- configuration ----------

/** The template's defaults with what was saved, limited to the rule's own fields. */
function mergedConfig(def: AutomationDef, stored: unknown): AutomationConfig {
  const saved = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...def.defaults };
  for (const f of def.fields) if (saved[f] !== undefined) out[f] = saved[f];
  return out as AutomationConfig;
}

type AutomationRow = {
  id: AutomationId;
  status: string;
  config: unknown;
  last_run_at: Date | null;
  last_run_summary: AutomationRunSummary | null;
  updated_by_name: string | null;
  updated_at: Date;
};

function mapAutomation(r: AutomationRow): CrmAutomation {
  const def = automationDef(r.id)!;
  return {
    id: r.id,
    status: isAutomationStatus(r.status) ? r.status : "desativada",
    config: mergedConfig(def, r.config),
    lastRunAt: iso(r.last_run_at),
    lastRunSummary: r.last_run_summary,
    updatedByName: r.updated_by_name,
    updatedAt: iso(r.updated_at)!,
  };
}

export async function listAutomations(): Promise<CrmAutomation[]> {
  const db = await getDb();
  const { rows } = await db.query<AutomationRow>(
    `SELECT id, status, config, last_run_at, last_run_summary, updated_by_name, updated_at FROM crm_automations`
  );
  return AUTOMATION_DEFS.map((d) => rows.find((r) => r.id === d.id))
    .filter((r): r is AutomationRow => Boolean(r))
    .map(mapAutomation);
}

/** The rule's configuration when it is on; null when it is paused, off or not available yet. */
async function activeConfig(id: AutomationId): Promise<AutomationConfig | null> {
  const def = automationDef(id);
  if (!def?.available) return null;
  const db = await getDb();
  const { rows } = await db.query<{ status: string; config: unknown }>(`SELECT status, config FROM crm_automations WHERE id = $1`, [id]);
  return rows[0]?.status === "ativa" ? mergedConfig(def, rows[0].config) : null;
}

/** An active person with access to the CRM (a deactivated owner never gets new work). */
async function activeUser(q: Q, userId: string | null | undefined): Promise<{ id: string; name: string } | null> {
  if (!userId) return null;
  const { rows } = await q.query<{ name: string; role: StaffRole; crm_role: string | null }>(
    `SELECT name, role, crm_role FROM internal_users WHERE id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  const r = rows[0];
  return r && effectiveCrmAccess(r.crm_role, r.role) !== "sem_acesso" ? { id: userId, name: r.name } : null;
}

const int = (v: unknown, min: number, max: number, label: string): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new CrmInputError(`${label}: use um número de ${min} a ${max}.`);
  return n;
};

/** Checks every parameter the rule has; unknown keys are ignored. */
async function cleanConfig(q: Q, def: AutomationDef, input: unknown, current: AutomationConfig): Promise<AutomationConfig> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new CrmInputError("Configuração inválida.");
  const raw = input as Record<string, unknown>;
  const out: AutomationConfig = { ...current };
  for (const f of def.fields) {
    const v = raw[f];
    if (v === undefined) continue;
    switch (f) {
      case "taskKind":
        out.taskKind = await requireOptionId(q, "task_kind", v, current.taskKind);
        break;
      case "priority":
        out.priority = await requireOptionId(q, "priority", v, current.priority);
        break;
      case "title": {
        const t = cleanText(v, 200);
        if (!t) throw new CrmInputError("Dê um título para a tarefa.");
        out.title = t;
        break;
      }
      case "dueDays":
        out.dueDays = int(v, 0, 60, "Prazo");
        break;
      case "days":
        out.days = int(v, 1, 90, "Dias");
        break;
      case "reminderMinutes": {
        const m = int(v, 0, 1440, "Lembrete");
        if (!TASK_REMINDERS_TIMED.some((r) => r.minutes === m)) throw new CrmInputError("Lembrete inválido.");
        out.reminderMinutes = m;
        break;
      }
      case "owner":
        if (v === "lead") out.owner = "lead";
        else if (typeof v === "string" && (await activeUser(q, v))) out.owner = v;
        else throw new CrmInputError("Responsável inválido: escolha alguém ativo no CRM.");
        break;
      case "fallbackOwnerId":
        if (v === null || v === "") out.fallbackOwnerId = null;
        else if (typeof v === "string" && (await activeUser(q, v))) out.fallbackOwnerId = v;
        else throw new CrmInputError("Responsável inválido: escolha alguém ativo no CRM.");
        break;
      case "temperature":
        if (v === "" || v === null) out.temperature = "";
        else if (isCrmTemperature(v)) out.temperature = v;
        else throw new CrmInputError("Temperatura inválida.");
        break;
      case "notifyOwner":
        if (typeof v !== "boolean") throw new CrmInputError("Configuração inválida.");
        out.notifyOwner = v;
        break;
      case "sources": {
        if (!Array.isArray(v)) throw new CrmInputError("Origens inválidas.");
        const ids: string[] = [];
        for (const s of v) ids.push(await requireOptionId(q, "source", s, (current.sources ?? []).includes(String(s)) ? String(s) : null));
        out.sources = [...new Set(ids)];
        break;
      }
    }
  }
  return out;
}

export type AutomationPatch = { status?: unknown; config?: unknown };

/** Administrador: turn a rule on / pause / off, or adjust its parameters. Returns before and after (for the audit trail). */
export async function updateAutomation(id: string, patch: AutomationPatch, actor: CrmActor): Promise<{ before: CrmAutomation; after: CrmAutomation }> {
  const def = automationDef(id);
  if (!def) throw new CrmNotFoundError("Automação não encontrada.");
  return withTransaction(async (client) => {
    const { rows } = await client.query<AutomationRow>(
      `SELECT id, status, config, last_run_at, last_run_summary, updated_by_name, updated_at FROM crm_automations WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!rows[0]) throw new CrmNotFoundError("Automação não encontrada.");
    const before = mapAutomation(rows[0]);
    let status: AutomationStatus = before.status;
    if (patch.status !== undefined) {
      if (!isAutomationStatus(patch.status)) throw new CrmInputError("Situação inválida.");
      if (!def.available && patch.status !== "desativada") throw new CrmInputError("Essa automação depende dos clientes ativos (Fase 5) e ainda não pode ser ligada.");
      status = patch.status;
    }
    const config = patch.config !== undefined ? await cleanConfig(client, def, patch.config, before.config) : before.config;
    const updated = await client.query<AutomationRow>(
      `UPDATE crm_automations SET status = $2, config = $3, updated_by = $4, updated_by_name = $5, updated_at = now() WHERE id = $1
       RETURNING id, status, config, last_run_at, last_run_summary, updated_by_name, updated_at`,
      [id, status, JSON.stringify(config), actor?.userId ?? null, actor?.userName ?? null]
    );
    return { before, after: mapAutomation(updated.rows[0]) };
  });
}

// ---------- runs ----------

type Outcome = { status?: "ok" | "ignorada"; detail: string; taskId?: string | null };

/**
 * Claims (automation, key) and does `act` in one transaction. The same key
 * twice → nothing happens the second time ("duplicada"). A failure rolls the
 * work back and is recorded under a key of its own, so it can be retried.
 */
async function runOnce(
  automationId: AutomationId,
  key: string,
  target: { contactId?: string | null; dealId?: string | null },
  act: (client: PoolClient) => Promise<Outcome>
): Promise<"ok" | "ignorada" | "duplicada" | "falha"> {
  try {
    return await withTransaction(async (client) => {
      const claim = await client.query<{ id: string }>(
        `INSERT INTO crm_automation_runs (id, automation_id, dedupe_key, status, contact_id, deal_id)
         VALUES ($1, $2, $3, 'ok', $4, $5) ON CONFLICT (automation_id, dedupe_key) DO NOTHING RETURNING id`,
        [randomUUID(), automationId, key, target.contactId ?? null, target.dealId ?? null]
      );
      if (!claim.rows[0]) return "duplicada" as const;
      const out = await act(client);
      const status = out.status ?? "ok";
      await client.query(`UPDATE crm_automation_runs SET status = $2, detail = $3, task_id = $4 WHERE id = $1`, [
        claim.rows[0].id,
        status,
        out.detail.slice(0, 500),
        out.taskId ?? null,
      ]);
      return status;
    });
  } catch (err) {
    const message = err instanceof CrmInputError || err instanceof CrmNotFoundError ? err.message : "Erro inesperado (veja os registros do servidor).";
    console.error(`[automations] ${automationId} ${key} failed`, err);
    try {
      const db = await getDb();
      await db.query(
        `INSERT INTO crm_automation_runs (id, automation_id, dedupe_key, status, detail, contact_id, deal_id)
         VALUES ($1, $2, $3, 'falha', $4, $5, $6)`,
        [randomUUID(), automationId, `${key}:falha:${randomUUID()}`, message.slice(0, 500), target.contactId ?? null, target.dealId ?? null]
      );
    } catch (logErr) {
      console.error("[automations] could not record the failure", logErr);
    }
    return "falha";
  }
}

export type RunFilters = { automationId?: string; status?: string };

export async function listRuns(f: RunFilters, page: number, pageSize = 50): Promise<CrmPage<CrmAutomationRun>> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (f.automationId && automationDef(f.automationId)) {
    values.push(f.automationId);
    where.push(`r.automation_id = $${values.length}`);
  }
  if (f.status === "ok" || f.status === "ignorada" || f.status === "falha") {
    values.push(f.status);
    where.push(`r.status = $${values.length}`);
  }
  const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const db = await getDb();
  const [rows, total] = await Promise.all([
    db.query<{ id: string; automation_id: AutomationId; status: CrmAutomationRun["status"]; detail: string | null; contact_id: string | null; contact_name: string | null; created_at: Date }>(
      `SELECT r.id, r.automation_id, r.status, r.detail, r.contact_id, c.name AS contact_name, r.created_at
       FROM crm_automation_runs r LEFT JOIN crm_contacts c ON c.id = r.contact_id ${sql}
       ORDER BY r.created_at DESC, r.id LIMIT ${pageSize} OFFSET ${(Math.max(1, page) - 1) * pageSize}`,
      values
    ),
    db.query<{ n: string }>(`SELECT count(*) AS n FROM crm_automation_runs r ${sql}`, values),
  ]);
  return {
    rows: rows.rows.map((r) => ({
      id: r.id,
      automationId: r.automation_id,
      status: r.status,
      detail: r.detail,
      contactId: r.contact_id,
      contactName: r.contact_name,
      at: iso(r.created_at)!,
    })),
    total: Number(total.rows[0].n),
    page: Math.max(1, page),
    pageSize,
  };
}

// ---------- notices (the bell) ----------

async function notify(
  q: Q,
  userId: string,
  automationId: AutomationId,
  n: { kind: string; title: string; body?: string | null; contactId?: string | null }
): Promise<void> {
  await q.query(
    `INSERT INTO crm_notifications (id, user_id, kind, title, body, contact_id, automation_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), userId, n.kind, n.title.slice(0, 200), n.body?.slice(0, 500) ?? null, n.contactId ?? null, automationId]
  );
}

/** My unread notices, newest first (the bell). */
export async function listNotifications(userId: string): Promise<CrmNotification[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; kind: string; title: string; body: string | null; contact_id: string | null; created_at: Date }>(
    `SELECT id, kind, title, body, contact_id, created_at FROM crm_notifications WHERE user_id = $1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 30`,
    [userId]
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, contactId: r.contact_id, at: iso(r.created_at)! }));
}

/** Marks my notices read: the given ids, or all of them. Only ever one's own. */
export async function markNotificationsRead(userId: string, ids: unknown): Promise<number> {
  const db = await getDb();
  if (ids === "all") {
    return (await db.query(`UPDATE crm_notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId])).rowCount ?? 0;
  }
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) throw new CrmInputError("Avisos inválidos.");
  return (await db.query(`UPDATE crm_notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2) AND read_at IS NULL`, [userId, ids])).rowCount ?? 0;
}

// ---------- helpers for the rules ----------

/** "YYYY-MM-DD" in Brasília, `days` from today. */
function dayFromToday(days: number): string {
  const d = new Date(Date.now() - 3 * 3_600_000);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Who gets the task / notice: a fixed person, or the lead's owner; the fallback when that one is missing or deactivated. */
async function recipient(q: Q, cfg: AutomationConfig, leadOwnerId: string | null): Promise<{ id: string; name: string } | null> {
  const first = cfg.owner && cfg.owner !== "lead" ? cfg.owner : leadOwnerId;
  return (await activeUser(q, first)) ?? (await activeUser(q, cfg.fallbackOwnerId ?? null));
}

async function contactName(q: Q, contactId: string): Promise<string> {
  const { rows } = await q.query<{ name: string }>(`SELECT name FROM crm_contacts WHERE id = $1`, [contactId]);
  return rows[0]?.name ?? "Contato";
}

// ---------- event rules ----------

/** 1. Novo lead: primeiro contato. */
export async function onNewLead(contactId: string, via: string): Promise<void> {
  if (via === "importacao") return;
  const cfg = await activeConfig("novo_lead");
  if (!cfg) return;
  const db = await getDb();
  const { rows } = await db.query<{ source: string; owner_id: string | null }>(`SELECT source, owner_id FROM crm_contacts WHERE id = $1`, [contactId]);
  const c = rows[0];
  if (!c || ((cfg.sources ?? []).length > 0 && !cfg.sources!.includes(c.source))) return;
  await runOnce("novo_lead", `contato:${contactId}`, { contactId }, async (client) => {
    const owner = await recipient(client, cfg, c.owner_id);
    const deal = await client.query<{ id: string }>(
      `SELECT id FROM crm_deals WHERE contact_id = $1 AND stage NOT IN ('ganho', 'perdido') ORDER BY created_at LIMIT 1`,
      [contactId]
    );
    const taskId = await createTaskTx(
      client,
      { contactId, dealId: deal.rows[0]?.id ?? null, kind: cfg.taskKind, title: cfg.title, priority: cfg.priority, dueDate: dayFromToday(cfg.dueDays ?? 0), ownerId: owner?.id ?? "" },
      WRITER
    );
    return { detail: `Tarefa "${cfg.title}" para ${owner?.name ?? "ninguém (sem responsável)"}`, taskId };
  });
}

/** 2. Lead atribuído: aviso ao novo responsável (em lote, um aviso por pessoa). */
export async function onOwnersAssigned(items: { contactId: string; ownerId: string | null }[], by: CrmWriter, bulk: boolean): Promise<void> {
  const cfg = await activeConfig("lead_atribuido");
  if (!cfg) return;
  const byOwner = new Map<string, string[]>();
  for (const it of items) {
    if (!it.ownerId || it.ownerId === by?.userId) continue;
    byOwner.set(it.ownerId, [...(byOwner.get(it.ownerId) ?? []), it.contactId]);
  }
  const minute = new Date().toISOString().slice(0, 16);
  for (const [ownerId, contactIds] of byOwner) {
    const single = contactIds.length === 1 && !bulk;
    const key = single ? `contato:${contactIds[0]}:para:${ownerId}:${minute}` : `lote:${randomUUID()}:para:${ownerId}`;
    await runOnce("lead_atribuido", key, { contactId: single ? contactIds[0] : null }, async (client) => {
      const owner = await activeUser(client, ownerId);
      if (!owner) return { status: "ignorada", detail: "O novo responsável não está ativo no CRM." };
      const byText = by?.userName ? `Atribuído por ${by.userName}.` : null;
      if (single || contactIds.length === 1) {
        const name = await contactName(client, contactIds[0]);
        await notify(client, ownerId, "lead_atribuido", { kind: "lead_atribuido", title: `Novo lead para você: ${name}`, body: byText, contactId: contactIds[0] });
        return { detail: `Aviso para ${owner.name}: ${name}` };
      }
      await notify(client, ownerId, "lead_atribuido", { kind: "lead_atribuido", title: `${contactIds.length} leads atribuídos a você`, body: byText });
      return { detail: `Aviso para ${owner.name}: ${contactIds.length} leads` };
    });
  }
}

/** 5. Proposta enviada: follow-up. */
export async function onDealStage(dealId: string, stage: string): Promise<void> {
  if (stage !== "proposta") return;
  const cfg = await activeConfig("proposta_enviada");
  if (!cfg) return;
  const db = await getDb();
  const { rows } = await db.query<{ contact_id: string; stage: string; stage_changed_at: Date; owner_id: string | null; contact_owner: string | null; title: string }>(
    `SELECT d.contact_id, d.stage, d.stage_changed_at, d.owner_id, c.owner_id AS contact_owner, d.title
     FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id WHERE d.id = $1`,
    [dealId]
  );
  const d = rows[0];
  if (!d || d.stage !== "proposta") return;
  const pending = await db.query(`SELECT 1 FROM crm_tasks WHERE deal_id = $1 AND kind = $2 AND done_at IS NULL AND canceled_at IS NULL LIMIT 1`, [
    dealId,
    cfg.taskKind,
  ]);
  if (pending.rows.length > 0) return;
  await runOnce("proposta_enviada", `oportunidade:${dealId}:proposta:${d.stage_changed_at.toISOString()}`, { contactId: d.contact_id, dealId }, async (client) => {
    const owner = await recipient(client, cfg, d.owner_id ?? d.contact_owner);
    const taskId = await createTaskTx(
      client,
      { contactId: d.contact_id, dealId, kind: cfg.taskKind, title: cfg.title, priority: cfg.priority, dueDate: dayFromToday(cfg.dueDays ?? 3), ownerId: owner?.id ?? "" },
      WRITER
    );
    return { detail: `"${d.title}": tarefa "${cfg.title}" para ${owner?.name ?? "ninguém (sem responsável)"}`, taskId };
  });
}

/** 4. Reunião agendada: lembrete (quando quem criou não escolheu um). */
export async function onTaskCreated(taskId: string): Promise<void> {
  const cfg = await activeConfig("reuniao_agendada");
  if (!cfg) return;
  const db = await getDb();
  const { rows } = await db.query<{ kind: string; due_at: Date | null; all_day: boolean; remind_minutes: number | null; done_at: Date | null; contact_id: string | null; title: string }>(
    `SELECT kind, due_at, all_day, remind_minutes, done_at, contact_id, title FROM crm_tasks WHERE id = $1`,
    [taskId]
  );
  const t = rows[0];
  if (!t || t.kind !== cfg.taskKind || !t.due_at || t.done_at || t.remind_minutes !== null) return;
  const minutes = t.all_day ? 0 : cfg.reminderMinutes ?? 60;
  await runOnce("reuniao_agendada", `tarefa:${taskId}`, { contactId: t.contact_id }, async (client) => {
    const set = await client.query(
      `UPDATE crm_tasks SET remind_minutes = $2, remind_at = $3, reminder_dismissed_at = NULL, updated_at = now() WHERE id = $1 AND remind_minutes IS NULL`,
      [taskId, minutes, remindAt(t.due_at, t.all_day, minutes)]
    );
    if (set.rowCount === 0) return { status: "ignorada", detail: "A reunião já tinha lembrete." };
    await addTaskEvent(client, taskId, "edited", { fields: ["lembrete"], automation: "reuniao_agendada" }, WRITER);
    return { detail: `"${t.title}": lembrete ${reminderLabel(minutes, t.all_day).toLowerCase()}`, taskId };
  });
}

/** 10. Resposta de campanha: registrar e sinalizar interesse. */
export async function onInbound(contactId: string, at: Date): Promise<void> {
  const cfg = await activeConfig("resposta_campanha");
  if (!cfg) return;
  const db = await getDb();
  const { rows } = await db.query<{ campaign_id: string; name: string }>(
    `SELECT r.campaign_id, k.name FROM crm_campaign_recipients r JOIN crm_campaigns k ON k.id = r.campaign_id
     WHERE r.contact_id = $1 AND r.sent_at IS NOT NULL AND r.sent_at <= $2 AND $2 <= r.sent_at + interval '${CAMPAIGN_REPLY_WINDOW}'
     ORDER BY r.sent_at DESC LIMIT 1`,
    [contactId, at]
  );
  const campaign = rows[0];
  if (!campaign) return;
  await runOnce("resposta_campanha", `campanha:${campaign.campaign_id}:contato:${contactId}`, { contactId }, async (client) => {
    const c = await client.query<{ name: string; owner_id: string | null; temperature: string | null }>(
      `SELECT name, owner_id, temperature FROM crm_contacts WHERE id = $1 FOR UPDATE`,
      [contactId]
    );
    const contact = c.rows[0];
    if (!contact) return { status: "ignorada", detail: "Contato não encontrado." };
    const parts = [`Respondeu à campanha "${campaign.name}"`];
    if (cfg.temperature && isCrmTemperature(cfg.temperature) && contact.temperature !== cfg.temperature) {
      await client.query(`UPDATE crm_contacts SET temperature = $2, updated_at = now() WHERE id = $1`, [contactId, cfg.temperature]);
      parts.push(`temperatura: ${temperatureLabel(contact.temperature) || "vazia"} → ${temperatureLabel(cfg.temperature)}`);
    }
    await addEvent(client, contactId, "automation", { automation: "resposta_campanha", text: parts.join(" · "), campaignId: campaign.campaign_id }, WRITER);
    let notified = "";
    if (cfg.notifyOwner) {
      const owner = await activeUser(client, contact.owner_id);
      if (owner) {
        await notify(client, owner.id, "resposta_campanha", { kind: "interesse", title: `${contact.name} respondeu à campanha`, body: campaign.name, contactId });
        notified = ` · aviso para ${owner.name}`;
      }
    }
    return { detail: `${contact.name}: ${parts.join(" · ")}${notified}` };
  });
}

// ---------- time rules (daily check) ----------

/** 3. Lead sem movimentação: alerta, uma vez por parada. */
async function checkStalledDeals(cfg: AutomationConfig): Promise<AutomationRunSummary> {
  const days = cfg.days ?? 7;
  const db = await getDb();
  const { rows } = await db.query<{ id: string; contact_id: string; title: string; stage: string; stage_changed_at: Date; owner_id: string | null; name: string }>(
    `SELECT d.id, d.contact_id, d.title, d.stage, d.stage_changed_at, COALESCE(d.owner_id, c.owner_id) AS owner_id, c.name
     FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
     WHERE c.archived_at IS NULL AND d.stage NOT IN ('ganho', 'perdido')
       AND d.stage_changed_at < now() - make_interval(days => $1)
       AND NOT EXISTS (SELECT 1 FROM crm_messages m WHERE m.contact_id = c.id AND m.created_at >= now() - make_interval(days => $1))
       AND NOT EXISTS (SELECT 1 FROM crm_tasks t WHERE t.contact_id = c.id AND t.done_at >= now() - make_interval(days => $1))
       AND NOT EXISTS (SELECT 1 FROM crm_automation_runs r WHERE r.automation_id = 'lead_sem_movimentacao'
                         AND r.dedupe_key = 'oportunidade:' || d.id || ':parada:' || floor(extract(epoch FROM d.stage_changed_at))::bigint)
     ORDER BY d.stage_changed_at
     LIMIT ${SCHEDULED_BATCH + 1}`,
    [days]
  );
  const summary: AutomationRunSummary = { ok: 0, ignored: 0, failed: 0, more: rows.length > SCHEDULED_BATCH };
  for (const d of rows.slice(0, SCHEDULED_BATCH)) {
    // One alert per stall: the key carries when the opportunity entered its stage (whole seconds, same as the query above).
    const r = await runOnce("lead_sem_movimentacao", `oportunidade:${d.id}:parada:${Math.floor(d.stage_changed_at.getTime() / 1000)}`, { contactId: d.contact_id, dealId: d.id }, async (client) => {
      const owner = await recipient(client, cfg, d.owner_id);
      if (!owner) return { status: "ignorada", detail: `"${d.title}" parada sem responsável para avisar.` };
      const since = d.stage_changed_at.toISOString().slice(0, 10).split("-").reverse().join("/");
      await notify(client, owner.id, "lead_sem_movimentacao", {
        kind: "alerta",
        title: `Lead parado: ${d.name}`,
        body: `"${d.title}" está em ${stageLabel(d.stage)} desde ${since}, sem mensagem nem tarefa concluída há ${days} dias.`,
        contactId: d.contact_id,
      });
      return { detail: `"${d.title}" (${stageLabel(d.stage)} desde ${since}): alerta para ${owner.name}` };
    });
    if (r === "ok") summary.ok++;
    else if (r === "ignorada") summary.ignored++;
    else if (r === "falha") summary.failed++;
  }
  return summary;
}

/** 6. Lead sem resposta: tarefa de acompanhamento. Campaign messages don't count as "our last message". */
async function checkUnanswered(cfg: AutomationConfig): Promise<AutomationRunSummary> {
  const days = cfg.days ?? 3;
  const db = await getDb();
  const { rows } = await db.query<{ id: string; owner_id: string | null; msg_id: string; deal_id: string; name: string }>(
    `SELECT c.id, c.owner_id, c.name, lm.id AS msg_id, od.id AS deal_id
     FROM crm_contacts c
     JOIN LATERAL (SELECT m.id, m.direction, m.campaign_id, m.created_at FROM crm_messages m WHERE m.contact_id = c.id ORDER BY m.created_at DESC LIMIT 1) lm ON true
     JOIN LATERAL (SELECT d.id FROM crm_deals d WHERE d.contact_id = c.id AND d.stage NOT IN ('ganho', 'perdido') ORDER BY d.updated_at DESC LIMIT 1) od ON true
     WHERE c.archived_at IS NULL AND c.opted_out_at IS NULL
       AND lm.direction = 'out' AND lm.campaign_id IS NULL AND lm.created_at < now() - make_interval(days => $1)
       AND NOT EXISTS (SELECT 1 FROM crm_tasks t WHERE t.contact_id = c.id AND t.done_at IS NULL AND t.canceled_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM crm_automation_runs r WHERE r.automation_id = 'lead_sem_resposta' AND r.dedupe_key = 'contato:' || c.id || ':mensagem:' || lm.id)
     ORDER BY lm.created_at
     LIMIT ${SCHEDULED_BATCH + 1}`,
    [days]
  );
  const summary: AutomationRunSummary = { ok: 0, ignored: 0, failed: 0, more: rows.length > SCHEDULED_BATCH };
  for (const c of rows.slice(0, SCHEDULED_BATCH)) {
    const r = await runOnce("lead_sem_resposta", `contato:${c.id}:mensagem:${c.msg_id}`, { contactId: c.id, dealId: c.deal_id }, async (client) => {
      const owner = await recipient(client, cfg, c.owner_id);
      const taskId = await createTaskTx(
        client,
        { contactId: c.id, dealId: c.deal_id, kind: cfg.taskKind, title: cfg.title, priority: cfg.priority, dueDate: dayFromToday(0), ownerId: owner?.id ?? "" },
        WRITER
      );
      return { detail: `${c.name}: tarefa "${cfg.title}" para ${owner?.name ?? "ninguém (sem responsável)"}`, taskId };
    });
    if (r === "ok") summary.ok++;
    else if (r === "ignorada") summary.ignored++;
    else if (r === "falha") summary.failed++;
  }
  return summary;
}

const SCHEDULED: Partial<Record<AutomationId, (cfg: AutomationConfig) => Promise<AutomationRunSummary>>> = {
  lead_sem_movimentacao: checkStalledDeals,
  lead_sem_resposta: checkUnanswered,
};

/**
 * The daily check: every active time rule, at most SCHEDULED_BATCH records
 * each (the next check continues). `only` limits it to one rule ("Rodar agora").
 */
export async function runScheduled(only?: AutomationId): Promise<Partial<Record<AutomationId, AutomationRunSummary>>> {
  const out: Partial<Record<AutomationId, AutomationRunSummary>> = {};
  const db = await getDb();
  for (const [id, check] of Object.entries(SCHEDULED) as [AutomationId, (cfg: AutomationConfig) => Promise<AutomationRunSummary>][]) {
    if (only && id !== only) continue;
    const cfg = await activeConfig(id);
    if (!cfg) continue;
    const summary = await check(cfg);
    out[id] = summary;
    await db.query(`UPDATE crm_automations SET last_run_at = now(), last_run_summary = $2 WHERE id = $1`, [id, JSON.stringify(summary)]);
  }
  return out;
}

/** Whether the daily check can be called by the scheduler (the secret exists; its value is never read here otherwise). */
export function scheduleConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET);
}
