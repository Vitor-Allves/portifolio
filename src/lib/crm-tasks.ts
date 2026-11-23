// Server-only: tasks and logged activities (ligação, reunião, WhatsApp,
// e-mail, tarefa). A task always belongs to a contact and, optionally, to one
// of its opportunities. Logging "a call I just made" is a task created
// already done, with its result. Times are Brasília (fixed -03:00; Brazil has
// no daylight saving since 2019).

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import type { CrmTask, CrmTaskKind } from "./crm-types";
import { optionLabel, requireOptionId } from "./crm-options";
import { CrmInputError, addEvent, cleanText, iso, type CrmActor } from "./crm-core";

type Db = Pick<PoolClient, "query">;

type TaskRow = {
  id: string;
  contact_id: string;
  contact_name: string;
  company: string | null;
  deal_id: string | null;
  deal_title: string | null;
  kind: string;
  title: string;
  due_at: Date | null;
  all_day: boolean;
  owner_id: string | null;
  owner_name: string | null;
  done_at: Date | null;
  done_by_name: string | null;
  result: string | null;
  canceled_at: Date | null;
  created_at: Date;
  created_by_name: string | null;
};

const TASK_SELECT = `
  SELECT t.id, t.contact_id, c.name AS contact_name, COALESCE(co.name, c.company) AS company,
         t.deal_id, d.title AS deal_title, t.kind, t.title, t.due_at, t.all_day, t.owner_id, u.name AS owner_name,
         t.done_at, t.done_by_name, t.result, t.canceled_at, t.created_at, t.created_by_name
  FROM crm_tasks t
  JOIN crm_contacts c ON c.id = t.contact_id
  LEFT JOIN crm_companies co ON co.id = c.company_id
  LEFT JOIN crm_deals d ON d.id = t.deal_id
  LEFT JOIN internal_users u ON u.id = t.owner_id`;

function mapTask(r: TaskRow): CrmTask {
  return {
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    company: r.company,
    dealId: r.deal_id,
    dealTitle: r.deal_title,
    kind: r.kind,
    title: r.title,
    dueAt: iso(r.due_at),
    allDay: r.all_day,
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
  status?: "pending" | "done";
  /** Inclusive window on due_at (agenda). */
  from?: Date;
  to?: Date;
  /** Comercial profile: only tasks on leads this user owns or that have no owner. */
  visibleTo?: string | null;
};

/** Pending tasks soonest first (no date last), or recently finished ones — contacts that aren't archived. */
export async function listTasks(f: TaskFilters): Promise<CrmTask[]> {
  const where = ["c.archived_at IS NULL", "t.canceled_at IS NULL"];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, v: unknown) => {
    values.push(v);
    where.push(sql(values.length));
  };
  where.push(f.status === "done" ? "t.done_at IS NOT NULL" : "t.done_at IS NULL");
  if (f.owner === "mine" && f.currentUserId) add((n) => `t.owner_id = $${n}`, f.currentUserId);
  else if (f.owner === "none") where.push("t.owner_id IS NULL");
  else if (f.owner && f.owner !== "all" && f.owner !== "mine") add((n) => `t.owner_id = $${n}`, f.owner);
  if (f.from) add((n) => `t.due_at >= $${n}`, f.from);
  if (f.to) add((n) => `t.due_at <= $${n}`, f.to);
  if (f.visibleTo) add((n) => `(c.owner_id = $${n} OR c.owner_id IS NULL)`, f.visibleTo);
  const order = f.status === "done" ? "t.done_at DESC" : "t.due_at ASC NULLS LAST, t.created_at";
  const db = await getDb();
  const { rows } = await db.query<TaskRow>(`${TASK_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 500`, values);
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
  return new Map(rows.map((r) => [r.contact_id, mapTask(r)]));
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

async function validOwner(client: Db, ownerId: string | null): Promise<void> {
  if (!ownerId) return;
  const { rows } = await client.query(`SELECT 1 FROM internal_users WHERE id = $1`, [ownerId]);
  if (rows.length === 0) throw new CrmInputError("Responsável inválido.");
}

export type NewTaskInput = {
  contactId?: unknown;
  dealId?: unknown;
  kind?: unknown;
  title?: unknown;
  dueDate?: unknown;
  dueTime?: unknown;
  ownerId?: unknown;
  /** true = log an activity that already happened. */
  done?: unknown;
  result?: unknown;
};

export async function createTaskTx(client: PoolClient, input: NewTaskInput, actor: CrmActor): Promise<string> {
  const contactId = typeof input.contactId === "string" ? input.contactId : "";
  const contact = await client.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_contacts WHERE id = $1`, [contactId]);
  if (!contact.rows[0]) throw new CrmInputError("Contato não encontrado.");
  let dealId: string | null = null;
  if (typeof input.dealId === "string" && input.dealId) {
    const deal = await client.query(`SELECT 1 FROM crm_deals WHERE id = $1 AND contact_id = $2`, [input.dealId, contactId]);
    if (deal.rows.length === 0) throw new CrmInputError("Oportunidade inválida para este contato.");
    dealId = input.dealId;
  }
  const kind: CrmTaskKind = await requireOptionId(client, "task_kind", typeof input.kind === "string" && input.kind ? input.kind : "tarefa");
  const title = cleanText(input.title, 200) ?? (await optionLabel(client, "task_kind", kind)) ?? "Tarefa";
  const done = input.done === true;
  const parsed = parseDue(input.dueDate, input.dueTime);
  // An activity logged without a date happened now — so it shows on the agenda.
  const { dueAt, allDay } = done && !parsed.dueAt ? { dueAt: new Date(), allDay: false } : parsed;
  const ownerId = typeof input.ownerId === "string" ? input.ownerId || null : actor?.userId ?? contact.rows[0].owner_id;
  await validOwner(client, ownerId);
  const result = cleanText(input.result, 2000);
  const id = randomUUID();
  await client.query(
    `INSERT INTO crm_tasks (id, contact_id, deal_id, kind, title, due_at, all_day, owner_id, done_at, done_by, done_by_name, result, created_by, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      contactId,
      dealId,
      kind,
      title,
      dueAt,
      allDay,
      ownerId,
      done ? new Date() : null,
      done ? actor?.userId ?? null : null,
      done ? actor?.userName ?? null : null,
      done ? result : null,
      actor?.userId ?? null,
      actor?.userName ?? null,
    ]
  );
  await addEvent(
    client,
    contactId,
    "task",
    { action: done ? "logged" : "created", taskId: id, kind, title, dueAt: dueAt?.toISOString() ?? null, allDay, ...(done && result ? { result } : {}) },
    actor
  );
  return id;
}

export async function createTask(input: NewTaskInput, actor: CrmActor): Promise<string> {
  return withTransaction((client) => createTaskTx(client, input, actor));
}

export type TaskPatch = {
  title?: unknown;
  kind?: unknown;
  dueDate?: unknown;
  dueTime?: unknown;
  ownerId?: unknown;
  done?: unknown;
  result?: unknown;
  canceled?: unknown;
};

/** false = no such task. Done, reopened, rescheduled and canceled all land in the contact's history. */
export async function updateTask(id: string, patch: TaskPatch, actor: CrmActor): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      contact_id: string;
      kind: string;
      title: string;
      due_at: Date | null;
      done_at: Date | null;
      canceled_at: Date | null;
    }>(`SELECT contact_id, kind, title, due_at, done_at, canceled_at FROM crm_tasks WHERE id = $1 FOR UPDATE`, [id]);
    const current = rows[0];
    if (!current) return false;
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    let kind = current.kind;
    let title = current.title;
    if (patch.kind !== undefined && patch.kind !== current.kind) {
      kind = await requireOptionId(client, "task_kind", patch.kind, current.kind);
      set("kind", kind);
    }
    if (patch.title !== undefined) {
      const t = cleanText(patch.title, 200);
      if (!t) throw new CrmInputError("O título da tarefa não pode ficar vazio.");
      title = t;
      set("title", t);
    }
    if (patch.dueDate !== undefined || patch.dueTime !== undefined) {
      const { dueAt, allDay } = parseDue(patch.dueDate, patch.dueTime);
      set("due_at", dueAt);
      set("all_day", allDay);
      if ((dueAt?.toISOString() ?? null) !== iso(current.due_at)) {
        await addEvent(client, current.contact_id, "task", { action: "rescheduled", taskId: id, kind, title, dueAt: dueAt?.toISOString() ?? null, allDay }, actor);
      }
    }
    if (patch.ownerId !== undefined) {
      const ownerId = typeof patch.ownerId === "string" && patch.ownerId ? patch.ownerId : null;
      await validOwner(client, ownerId);
      set("owner_id", ownerId);
    }
    if (patch.done !== undefined) {
      const done = patch.done === true;
      if (done && !current.done_at) {
        const result = cleanText(patch.result, 2000);
        sets.push("done_at = now()");
        set("done_by", actor?.userId ?? null);
        set("done_by_name", actor?.userName ?? null);
        set("result", result);
        await addEvent(client, current.contact_id, "task", { action: "done", taskId: id, kind, title, ...(result ? { result } : {}) }, actor);
      } else if (!done && current.done_at) {
        sets.push("done_at = NULL", "done_by = NULL", "done_by_name = NULL");
        await addEvent(client, current.contact_id, "task", { action: "reopened", taskId: id, kind, title }, actor);
      }
    } else if (patch.result !== undefined && current.done_at) {
      set("result", cleanText(patch.result, 2000));
    }
    if (patch.canceled === true && !current.canceled_at) {
      sets.push("canceled_at = now()");
      await addEvent(client, current.contact_id, "task", { action: "canceled", taskId: id, kind, title }, actor);
    }
    if (sets.length === 0) return true;
    sets.push("updated_at = now()");
    values.push(id);
    await client.query(`UPDATE crm_tasks SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    return true;
  });
}
