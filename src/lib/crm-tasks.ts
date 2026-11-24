// Server-only: tasks and logged activities (especificação v1.0, módulo 8 —
// tarefas e agenda). A task belongs to a contact (and optionally one of its
// opportunities), to a company only, or to nobody (an internal activity).
// Logging "a call I just made" is a task created already done, with its
// result. Each task keeps its own history (crm_task_events); when it has a
// contact, the contact's history gets the usual entries too. Times are
// Brasília (fixed -03:00; Brazil has no daylight saving since 2019).

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import {
  TASK_REMINDERS_ALL_DAY,
  TASK_REMINDERS_TIMED,
  isCrmTaskStatus,
  type CrmReminders,
  type CrmTask,
  type CrmTaskEvent,
  type CrmTaskKind,
  type CrmTaskStatus,
} from "./crm-types";
import { optionLabel, requireOptionId } from "./crm-options";
import { CrmInputError, addEvent, cleanText, iso, type CrmActor } from "./crm-core";

type Db = Pick<PoolClient, "query">;

type TaskRow = {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  company_id: string | null;
  company: string | null;
  deal_id: string | null;
  deal_title: string | null;
  kind: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_at: Date | null;
  all_day: boolean;
  remind_minutes: number | null;
  remind_at: Date | null;
  owner_id: string | null;
  owner_name: string | null;
  done_at: Date | null;
  done_by_name: string | null;
  result: string | null;
  canceled_at: Date | null;
  created_at: Date;
  created_by_name: string | null;
};

const TASK_FROM = `
  FROM crm_tasks t
  LEFT JOIN crm_contacts c ON c.id = t.contact_id
  LEFT JOIN crm_companies co ON co.id = COALESCE(t.company_id, c.company_id)
  LEFT JOIN crm_deals d ON d.id = t.deal_id
  LEFT JOIN internal_users u ON u.id = t.owner_id`;

/**
 * Whose record the task is on, for "who can see it": the contact's owner;
 * with no contact, the company's owner; with neither (internal activity),
 * the task's own owner. null = everyone with access to the CRM.
 */
export const TASK_RECORD_OWNER = `CASE WHEN t.contact_id IS NOT NULL THEN c.owner_id WHEN t.company_id IS NOT NULL THEN co.owner_id ELSE t.owner_id END`;

const TASK_SELECT = `
  SELECT t.id, t.contact_id, c.name AS contact_name, COALESCE(t.company_id, c.company_id) AS company_id, COALESCE(co.name, c.company) AS company,
         t.deal_id, d.title AS deal_title, t.kind, t.title, t.description, t.priority, t.status, t.due_at, t.all_day,
         t.remind_minutes, t.remind_at, t.owner_id, u.name AS owner_name,
         t.done_at, t.done_by_name, t.result, t.canceled_at, t.created_at, t.created_by_name
  ${TASK_FROM}`;

/** Not on an archived contact (tasks with no contact always count). */
const NOT_ARCHIVED = "(t.contact_id IS NULL OR c.archived_at IS NULL)";

function mapTask(r: TaskRow): CrmTask {
  return {
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    companyId: r.company_id,
    company: r.company,
    dealId: r.deal_id,
    dealTitle: r.deal_title,
    kind: r.kind,
    title: r.title,
    description: r.description,
    priority: r.priority,
    status: isCrmTaskStatus(r.status) ? r.status : "pendente",
    dueAt: iso(r.due_at),
    allDay: r.all_day,
    remindMinutes: r.remind_minutes,
    remindAt: iso(r.remind_at),
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    doneAt: iso(r.done_at),
    doneByName: r.done_by_name,
    result: r.result,
    canceledAt: iso(r.canceled_at),
    createdAt: iso(r.created_at)!,
    createdByName: r.created_by_name,
  };
}

export type TaskFilters = {
  /** "all" | "mine" | "none" | a user id */
  owner?: string;
  currentUserId?: string;
  /** pending = pendente + em andamento (default); any = everything but canceled (agenda). */
  status?: "pending" | "em_andamento" | "done" | "any";
  kind?: string;
  priority?: string;
  /** Tasks on this company: its own, and those of its contacts. */
  companyId?: string;
  /** Inclusive window on due_at (agenda). */
  from?: Date;
  to?: Date;
  /** Comercial profile: only tasks on records this user owns or that have no owner. */
  visibleTo?: string | null;
};

/** Pending tasks soonest first (no date last), or recently finished ones — not on archived contacts, never canceled. */
export async function listTasks(f: TaskFilters): Promise<CrmTask[]> {
  const where = [NOT_ARCHIVED, "t.canceled_at IS NULL"];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, v: unknown) => {
    values.push(v);
    where.push(sql(values.length));
  };
  if (f.status === "done") where.push("t.done_at IS NOT NULL");
  else if (f.status === "em_andamento") where.push("t.done_at IS NULL AND t.status = 'em_andamento'");
  else if (f.status !== "any") where.push("t.done_at IS NULL");
  if (f.owner === "mine" && f.currentUserId) add((n) => `t.owner_id = $${n}`, f.currentUserId);
  else if (f.owner === "none") where.push("t.owner_id IS NULL");
  else if (f.owner && f.owner !== "all" && f.owner !== "mine") add((n) => `t.owner_id = $${n}`, f.owner);
  if (f.kind) add((n) => `t.kind = $${n}`, f.kind);
  if (f.priority) add((n) => `t.priority = $${n}`, f.priority);
  if (f.companyId) add((n) => `COALESCE(t.company_id, c.company_id) = $${n}`, f.companyId);
  if (f.from) add((n) => `t.due_at >= $${n}`, f.from);
  if (f.to) add((n) => `t.due_at <= $${n}`, f.to);
  if (f.visibleTo) add((n) => `(${TASK_RECORD_OWNER} = $${n} OR ${TASK_RECORD_OWNER} IS NULL)`, f.visibleTo);
  const order = f.status === "done" ? "t.done_at DESC" : "t.due_at ASC NULLS LAST, t.created_at";
  const db = await getDb();
  const { rows } = await db.query<TaskRow>(`${TASK_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 1000`, values);
  return rows.map(mapTask);
}

/** A contact's pending tasks (soonest first) and its 20 latest finished ones. */
export async function listContactTasks(db: Db, contactId: string): Promise<CrmTask[]> {
  const { rows } = await db.query<TaskRow>(
    `(${TASK_SELECT} WHERE t.contact_id = $1 AND t.done_at IS NULL AND t.canceled_at IS NULL ORDER BY t.due_at ASC NULLS LAST, t.created_at)
     UNION ALL
     (${TASK_SELECT} WHERE t.contact_id = $1 AND t.done_at IS NOT NULL ORDER BY t.done_at DESC LIMIT 20)`,
    [contactId]
  );
  return rows.map(mapTask);
}

/** Earliest pending task per contact, for the CSV export. */
export async function nextTasksByContact(contactIds: string[]): Promise<Map<string, CrmTask>> {
  if (contactIds.length === 0) return new Map();
  const db = await getDb();
  const { rows } = await db.query<TaskRow>(
    `SELECT DISTINCT ON (x.contact_id) x.*
     FROM (${TASK_SELECT} WHERE t.contact_id = ANY($1) AND t.done_at IS NULL AND t.canceled_at IS NULL) x
     ORDER BY x.contact_id, x.due_at ASC NULLS LAST, x.created_at`,
    [contactIds]
  );
  return new Map(rows.map((r) => [r.contact_id!, mapTask(r)]));
}

/** One task with its own history, oldest first. */
export async function getTask(id: string): Promise<{ task: CrmTask; events: CrmTaskEvent[] } | null> {
  const db = await getDb();
  const [task, events] = await Promise.all([
    db.query<TaskRow>(`${TASK_SELECT} WHERE t.id = $1`, [id]),
    db.query<{ id: string; action: string; payload: Record<string, unknown>; user_name: string | null; created_at: Date }>(
      `SELECT id, action, payload, user_name, created_at FROM crm_task_events WHERE task_id = $1 ORDER BY created_at, id`,
      [id]
    ),
  ]);
  if (!task.rows[0]) return null;
  return {
    task: mapTask(task.rows[0]),
    events: events.rows.map((e) => ({ id: e.id, action: e.action, payload: e.payload, userName: e.user_name, at: iso(e.created_at)! })),
  };
}

/** Brasília calendar day of an instant (YYYY-MM-DD). */
function spDay(d: Date): string {
  return new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** My reminders that are due now, and how many of my tasks are late. */
export async function listReminders(userId: string, visible: string | null, now = new Date()): Promise<CrmReminders> {
  const db = await getDb();
  const todayStart = new Date(`${spDay(now)}T00:00:00-03:00`);
  const vis = visible ? `AND (${TASK_RECORD_OWNER} = $1 OR ${TASK_RECORD_OWNER} IS NULL)` : "";
  const [due, overdue] = await Promise.all([
    db.query<TaskRow>(
      `${TASK_SELECT} WHERE t.owner_id = $1 AND ${NOT_ARCHIVED} AND t.done_at IS NULL AND t.canceled_at IS NULL
         AND t.remind_at IS NOT NULL AND t.remind_at <= $2 AND t.reminder_dismissed_at IS NULL ${vis}
       ORDER BY t.remind_at LIMIT 50`,
      [userId, now]
    ),
    db.query<{ n: string }>(
      `SELECT count(*) AS n ${TASK_FROM} WHERE t.owner_id = $1 AND ${NOT_ARCHIVED} AND t.done_at IS NULL AND t.canceled_at IS NULL
         AND ((NOT t.all_day AND t.due_at < $2) OR (t.all_day AND t.due_at < $3)) ${vis}`,
      [userId, now, todayStart]
    ),
  ]);
  return { due: due.rows.map(mapTask), overdue: Number(overdue.rows[0].n) };
}

/**
 * Due date (+ optional "HH:MM") in Brasília → instant. A day without a time
 * is stored at noon, so it never drifts to another day in either timezone.
 */
export function parseDue(date: unknown, time: unknown): { dueAt: Date | null; allDay: boolean } {
  if (date === null || date === undefined || date === "") {
    if (time) throw new CrmInputError("Informe a data junto com o horário.");
    return { dueAt: null, allDay: true };
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CrmInputError("Data inválida.");
  if (time === null || time === undefined || time === "") return { dueAt: new Date(`${date}T12:00:00-03:00`), allDay: true };
  if (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new CrmInputError("Horário inválido.");
  return { dueAt: new Date(`${date}T${time}:00-03:00`), allDay: false };
}

/** The reminder offset a task may get: null = none; must be one of the choices for timed / all-day tasks. */
export function parseReminder(value: unknown, allDay: boolean, hasDate: boolean): number | null {
  if (value === null || value === undefined || value === "") return null;
  const minutes = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  const allowed: readonly { minutes: number }[] = allDay ? TASK_REMINDERS_ALL_DAY : TASK_REMINDERS_TIMED;
  if (!allowed.some((r) => r.minutes === minutes)) throw new CrmInputError("Lembrete inválido.");
  if (!hasDate) throw new CrmInputError("Para ter lembrete, a tarefa precisa de uma data.");
  return minutes;
}

/** When the reminder fires: `minutes` before the task's time, or before 08:00 of its day when it has no time. */
export function remindAt(dueAt: Date | null, allDay: boolean, minutes: number | null): Date | null {
  if (minutes === null || !dueAt) return null;
  const base = allDay ? new Date(`${spDay(dueAt)}T08:00:00-03:00`) : dueAt;
  return new Date(base.getTime() - minutes * 60_000);
}

async function validOwner(client: Db, ownerId: string | null): Promise<void> {
  if (!ownerId) return;
  const { rows } = await client.query(`SELECT 1 FROM internal_users WHERE id = $1`, [ownerId]);
  if (rows.length === 0) throw new CrmInputError("Responsável inválido.");
}

async function ownerName(client: Db, ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const { rows } = await client.query<{ name: string }>(`SELECT name FROM internal_users WHERE id = $1`, [ownerId]);
  return rows[0]?.name ?? null;
}

/** One line in the task's own history. */
export async function addTaskEvent(client: Db, taskId: string, action: string, payload: Record<string, unknown>, actor: CrmActor): Promise<void> {
  await client.query(`INSERT INTO crm_task_events (id, task_id, action, payload, user_id, user_name) VALUES ($1, $2, $3, $4, $5, $6)`, [
    randomUUID(),
    taskId,
    action,
    JSON.stringify(payload),
    actor?.userId ?? null,
    actor?.userName ?? null,
  ]);
}

export type NewTaskInput = {
  /** A contact (the company comes from it)… */
  contactId?: unknown;
  /** …or only a company… */
  companyId?: unknown;
  /** …or neither: an internal activity. */
  dealId?: unknown;
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  dueDate?: unknown;
  dueTime?: unknown;
  /** Minutes before (see TASK_REMINDERS_*), or null. */
  reminder?: unknown;
  ownerId?: unknown;
  /** true = log an activity that already happened. */
  done?: unknown;
  result?: unknown;
};

export async function createTaskTx(client: PoolClient, input: NewTaskInput, actor: CrmActor): Promise<string> {
  const contactId = typeof input.contactId === "string" && input.contactId ? input.contactId : null;
  let companyId: string | null = null;
  let recordOwner: string | null = null;
  if (contactId) {
    const contact = await client.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_contacts WHERE id = $1`, [contactId]);
    if (!contact.rows[0]) throw new CrmInputError("Contato não encontrado.");
    recordOwner = contact.rows[0].owner_id;
  } else if (typeof input.companyId === "string" && input.companyId) {
    const company = await client.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_companies WHERE id = $1`, [input.companyId]);
    if (!company.rows[0]) throw new CrmInputError("Empresa não encontrada.");
    companyId = input.companyId;
    recordOwner = company.rows[0].owner_id;
  }
  let dealId: string | null = null;
  if (typeof input.dealId === "string" && input.dealId) {
    if (!contactId) throw new CrmInputError("Para ligar a uma oportunidade, escolha o contato.");
    const deal = await client.query(`SELECT 1 FROM crm_deals WHERE id = $1 AND contact_id = $2`, [input.dealId, contactId]);
    if (deal.rows.length === 0) throw new CrmInputError("Oportunidade inválida para este contato.");
    dealId = input.dealId;
  }
  const kind: CrmTaskKind = await requireOptionId(client, "task_kind", typeof input.kind === "string" && input.kind ? input.kind : "tarefa");
  const priority = await requireOptionId(client, "priority", typeof input.priority === "string" && input.priority ? input.priority : "media");
  const title = cleanText(input.title, 200) ?? (await optionLabel(client, "task_kind", kind)) ?? "Tarefa";
  const description = cleanText(input.description, 4000);
  const done = input.done === true;
  const parsed = parseDue(input.dueDate, input.dueTime);
  // An activity logged without a date happened now — so it shows on the agenda.
  const { dueAt, allDay } = done && !parsed.dueAt ? { dueAt: new Date(), allDay: false } : parsed;
  const reminder = done ? null : parseReminder(input.reminder, allDay, dueAt !== null);
  const ownerId = typeof input.ownerId === "string" ? input.ownerId || null : actor?.userId ?? recordOwner;
  await validOwner(client, ownerId);
  const result = cleanText(input.result, 2000);
  const id = randomUUID();
  await client.query(
    `INSERT INTO crm_tasks (id, contact_id, company_id, deal_id, kind, title, description, priority, status, due_at, all_day,
                            remind_minutes, remind_at, owner_id, done_at, done_by, done_by_name, result, created_by, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      id,
      contactId,
      companyId,
      dealId,
      kind,
      title,
      description,
      priority,
      done ? "concluida" : "pendente",
      dueAt,
      allDay,
      reminder,
      remindAt(dueAt, allDay, reminder),
      ownerId,
      done ? new Date() : null,
      done ? actor?.userId ?? null : null,
      done ? actor?.userName ?? null : null,
      done ? result : null,
      actor?.userId ?? null,
      actor?.userName ?? null,
    ]
  );
  await addTaskEvent(client, id, done ? "logged" : "created", { kind, title, priority, dueAt: dueAt?.toISOString() ?? null, allDay, owner: await ownerName(client, ownerId) }, actor);
  if (contactId) {
    await addEvent(
      client,
      contactId,
      "task",
      { action: done ? "logged" : "created", taskId: id, kind, title, dueAt: dueAt?.toISOString() ?? null, allDay, ...(done && result ? { result } : {}) },
      actor
    );
  }
  return id;
}

export async function createTask(input: NewTaskInput, actor: CrmActor): Promise<string> {
  return withTransaction((client) => createTaskTx(client, input, actor));
}

export type TaskPatch = {
  title?: unknown;
  kind?: unknown;
  description?: unknown;
  priority?: unknown;
  /** pendente | em_andamento | concluida | cancelada */
  status?: unknown;
  dueDate?: unknown;
  dueTime?: unknown;
  reminder?: unknown;
  ownerId?: unknown;
  /** Same as status concluida (true) / pendente (false). */
  done?: unknown;
  result?: unknown;
  /** Same as status cancelada. */
  canceled?: unknown;
  /** The owner saw the reminder: stop showing it (until the task is rescheduled). */
  dismissReminder?: unknown;
};

type CurrentTask = {
  contact_id: string | null;
  kind: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_at: Date | null;
  all_day: boolean;
  remind_minutes: number | null;
  owner_id: string | null;
  done_at: Date | null;
  canceled_at: Date | null;
};

/**
 * false = no such task. Every change lands in the task's own history;
 * done, reopened, rescheduled and canceled also land in the contact's.
 */
export async function updateTask(id: string, patch: TaskPatch, actor: CrmActor): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<CurrentTask>(
      `SELECT contact_id, kind, title, description, priority, status, due_at, all_day, remind_minutes, owner_id, done_at, canceled_at
       FROM crm_tasks WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const current = rows[0];
    if (!current) return false;
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    const contactEvent = async (payload: Record<string, unknown>) => {
      if (current.contact_id) await addEvent(client, current.contact_id, "task", { taskId: id, kind, title, ...payload }, actor);
    };
    const edited: string[] = [];

    let kind = current.kind;
    let title = current.title;
    if (patch.kind !== undefined && patch.kind !== current.kind) {
      kind = await requireOptionId(client, "task_kind", patch.kind, current.kind);
      set("kind", kind);
      edited.push("tipo");
    }
    if (patch.title !== undefined) {
      const t = cleanText(patch.title, 200);
      if (!t) throw new CrmInputError("O título da tarefa não pode ficar vazio.");
      if (t !== current.title) edited.push("título");
      title = t;
      set("title", t);
    }
    if (patch.description !== undefined) {
      const d = cleanText(patch.description, 4000);
      if (d !== current.description) edited.push("descrição");
      set("description", d);
    }
    if (patch.priority !== undefined && patch.priority !== current.priority) {
      set("priority", await requireOptionId(client, "priority", patch.priority, current.priority));
      edited.push("prioridade");
    }

    // Date, time and reminder: the reminder follows the task when it moves, and shows again.
    let dueAt = current.due_at;
    let allDay = current.all_day;
    let reminder = current.remind_minutes;
    let timing = false;
    if (patch.dueDate !== undefined || patch.dueTime !== undefined) {
      ({ dueAt, allDay } = parseDue(patch.dueDate, patch.dueTime));
      set("due_at", dueAt);
      set("all_day", allDay);
      if ((dueAt?.toISOString() ?? null) !== iso(current.due_at) || allDay !== current.all_day) {
        timing = true;
        const payload = { dueAt: dueAt?.toISOString() ?? null, allDay };
        await addTaskEvent(client, id, "rescheduled", { ...payload, from: iso(current.due_at), fromAllDay: current.all_day }, actor);
        await contactEvent({ action: "rescheduled", ...payload });
      }
      // A reminder that no longer fits (no date, or 15 min on an all-day task) is dropped.
      if (reminder !== null && patch.reminder === undefined) {
        try {
          reminder = parseReminder(reminder, allDay, dueAt !== null);
        } catch {
          reminder = null;
        }
      }
    }
    if (patch.reminder !== undefined) {
      reminder = parseReminder(patch.reminder, allDay, dueAt !== null);
      if (reminder !== current.remind_minutes) edited.push("lembrete");
    }
    if (timing || patch.reminder !== undefined) {
      set("remind_minutes", reminder);
      set("remind_at", remindAt(dueAt, allDay, reminder));
      sets.push("reminder_dismissed_at = NULL");
    } else if (patch.dismissReminder === true) {
      sets.push("reminder_dismissed_at = COALESCE(reminder_dismissed_at, now())");
    }

    if (patch.ownerId !== undefined) {
      const ownerId = typeof patch.ownerId === "string" && patch.ownerId ? patch.ownerId : null;
      await validOwner(client, ownerId);
      set("owner_id", ownerId);
      if (ownerId !== current.owner_id) {
        await addTaskEvent(client, id, "owner", { from: await ownerName(client, current.owner_id), to: await ownerName(client, ownerId) }, actor);
      }
    }

    // Status. The legacy flags map onto it: done ↔ concluida/pendente, canceled → cancelada.
    let status: CrmTaskStatus | null = null;
    if (patch.status !== undefined) {
      if (!isCrmTaskStatus(patch.status)) throw new CrmInputError("Situação inválida.");
      status = patch.status;
    } else if (patch.canceled === true) status = "cancelada";
    else if (patch.done !== undefined) status = patch.done === true ? "concluida" : current.done_at ? "pendente" : null;
    if (status && status !== current.status) {
      if (current.canceled_at && status !== "pendente") throw new CrmInputError("Tarefa cancelada: reative antes de mudar a situação.");
      set("status", status);
      if (status === "concluida") {
        const result = cleanText(patch.result, 2000);
        sets.push("done_at = now()");
        set("done_by", actor?.userId ?? null);
        set("done_by_name", actor?.userName ?? null);
        set("result", result);
        await contactEvent({ action: "done", ...(result ? { result } : {}) });
      } else if (status === "cancelada") {
        sets.push("canceled_at = now()");
        await contactEvent({ action: "canceled" });
      } else if (current.canceled_at) {
        sets.push("canceled_at = NULL");
      } else if (current.done_at) {
        sets.push("done_at = NULL", "done_by = NULL", "done_by_name = NULL");
        await contactEvent({ action: "reopened" });
      }
      await addTaskEvent(client, id, "status", { from: current.status, to: status, ...(status === "concluida" && patch.result ? { result: cleanText(patch.result, 2000) } : {}) }, actor);
    } else if (patch.result !== undefined && current.done_at) {
      set("result", cleanText(patch.result, 2000));
      edited.push("resultado");
    }

    if (edited.length > 0) await addTaskEvent(client, id, "edited", { fields: edited }, actor);
    if (sets.length === 0) return true;
    sets.push("updated_at = now()");
    values.push(id);
    await client.query(`UPDATE crm_tasks SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    return true;
  });
}
