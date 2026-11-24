// Server-only: carteiras (especificação v1.0, Fase 2). Distributing leads in
// bulk to a person and transferring someone's whole portfolio (typically
// when they leave). Every moved contact and opportunity gets an "owner"
// entry in its history (via "carteira"); nothing is removed.

import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { CrmForbiddenError, CrmInputError, CrmNotFoundError } from "./crm-core";
import { contactFiltersFromSearch, contactWhere } from "./crm";
import { effectiveCrmAccess } from "./crm-permissions";
import { requireCap, visibleTo, type CrmSession } from "./crm-access";
import type { StaffRole } from "./session-scope";

/** Most contacts one operation may move (a filter that matches more must be narrowed). */
export const PORTFOLIO_MAX = 5000;

export type PortfolioCounts = { contacts: number; deals: number; tasks: number; companies: number };

type Q = Pick<PoolClient, "query">;

/** The new owner: an active person with access to the CRM, or null (no owner). Returns their name. */
async function requireOwner(q: Q, ownerId: unknown): Promise<{ id: string | null; name: string | null }> {
  if (ownerId === null || ownerId === undefined || ownerId === "") return { id: null, name: null };
  if (typeof ownerId !== "string") throw new CrmInputError("Responsável inválido.");
  const { rows } = await q.query<{ name: string; role: StaffRole; crm_role: string | null }>(
    `SELECT name, role, crm_role FROM internal_users WHERE id = $1 AND revoked_at IS NULL`,
    [ownerId]
  );
  const row = rows[0];
  if (!row || effectiveCrmAccess(row.crm_role, row.role) === "sem_acesso") throw new CrmInputError("Responsável inválido: escolha alguém ativo no CRM.");
  return { id: ownerId, name: row.name };
}

/**
 * Moves the given contacts (and, optionally, their open opportunities and
 * pending tasks) to `to`, writing one history entry per contact and per
 * opportunity whose owner actually changed. Returns what moved.
 */
async function moveContacts(
  client: Q,
  contactIds: string[],
  to: { id: string | null; name: string | null },
  opts: { deals: boolean; tasks: boolean },
  actor: CrmSession
): Promise<PortfolioCounts> {
  const by = [actor.userId, actor.userName];
  const contacts = await client.query(
    `WITH moved AS (
       SELECT c.id, c.owner_id FROM crm_contacts c WHERE c.id = ANY($1) AND c.owner_id IS DISTINCT FROM $2 FOR UPDATE
     ), upd AS (
       UPDATE crm_contacts c SET owner_id = $2, updated_at = now() FROM moved WHERE c.id = moved.id RETURNING c.id, moved.owner_id AS old
     )
     INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name)
     SELECT gen_random_uuid()::text, upd.id, 'owner', jsonb_build_object('from', ou.name, 'to', $3::text, 'via', 'carteira'), $4, $5
     FROM upd LEFT JOIN internal_users ou ON ou.id = upd.old`,
    [contactIds, to.id, to.name, ...by]
  );
  let deals = 0;
  if (opts.deals) {
    const r = await client.query(
      `WITH moved AS (
         SELECT d.id, d.contact_id, d.title, d.owner_id FROM crm_deals d
         WHERE d.contact_id = ANY($1) AND d.stage NOT IN ('ganho', 'perdido') AND d.owner_id IS DISTINCT FROM $2 FOR UPDATE
       ), upd AS (
         UPDATE crm_deals d SET owner_id = $2, updated_at = now() FROM moved WHERE d.id = moved.id
         RETURNING d.id, d.contact_id, moved.title, moved.owner_id AS old
       )
       INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name)
       SELECT gen_random_uuid()::text, upd.contact_id, 'owner',
              jsonb_build_object('from', ou.name, 'to', $3::text, 'dealId', upd.id, 'dealTitle', upd.title, 'via', 'carteira'), $4, $5
       FROM upd LEFT JOIN internal_users ou ON ou.id = upd.old`,
      [contactIds, to.id, to.name, ...by]
    );
    deals = r.rowCount ?? 0;
  }
  let tasks = 0;
  if (opts.tasks) {
    const r = await client.query(
      `UPDATE crm_tasks SET owner_id = $2, updated_at = now()
       WHERE contact_id = ANY($1) AND done_at IS NULL AND canceled_at IS NULL AND owner_id IS DISTINCT FROM $2`,
      [contactIds, to.id]
    );
    tasks = r.rowCount ?? 0;
  }
  return { contacts: contacts.rowCount ?? 0, deals, tasks, companies: 0 };
}

export type AssignInput = {
  /** Explicit contacts (the rows ticked on the list)… */
  ids?: unknown;
  /** …or every contact matching the list's filters (same keys as /api/crm/contacts). */
  filters?: unknown;
  ownerId?: unknown;
  moveDeals?: unknown;
  moveTasks?: unknown;
  /** true = only count, change nothing. */
  preview?: unknown;
};

async function targetContacts(q: Q, s: CrmSession, input: AssignInput): Promise<string[]> {
  const visible = visibleTo(s);
  if (Array.isArray(input.ids)) {
    const ids = input.ids.filter((x): x is string => typeof x === "string").slice(0, PORTFOLIO_MAX + 1);
    if (ids.length === 0) throw new CrmInputError("Selecione ao menos um contato.");
    const { rows } = await q.query<{ id: string }>(
      `SELECT id FROM crm_contacts WHERE id = ANY($1) AND ($2::text IS NULL OR owner_id = $2 OR owner_id IS NULL)`,
      [ids, visible]
    );
    return rows.map((r) => r.id);
  }
  if (input.filters && typeof input.filters === "object" && !Array.isArray(input.filters)) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(input.filters as Record<string, unknown>)) if (typeof v === "string" && v) params.set(k, v);
    const filters = { ...contactFiltersFromSearch(params, s.userId), visibleTo: visible };
    const { sql, values } = contactWhere(filters);
    const { rows } = await q.query<{ id: string }>(
      `SELECT c.id FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id ${sql} LIMIT ${PORTFOLIO_MAX + 1}`,
      values
    );
    return rows.map((r) => r.id);
  }
  throw new CrmInputError("Selecione os contatos.");
}

/**
 * Distribuir carteira: gives the selected (or filtered) contacts to one
 * person — or to no one — optionally with their open opportunities and
 * pending tasks. Needs "trocar o responsável de qualquer lead". With
 * `preview`, only counts what would change.
 */
export async function assignContacts(
  s: CrmSession,
  input: AssignInput
): Promise<PortfolioCounts & { toName: string | null; preview: boolean }> {
  requireCap(s, "assignAnyOwner");
  const opts = { deals: input.moveDeals !== false, tasks: input.moveTasks !== false };
  const db = await getDb();
  const to = await requireOwner(db, input.ownerId);
  const ids = await targetContacts(db, s, input);
  if (ids.length === 0) throw new CrmInputError("Nenhum contato para mover.");
  if (ids.length > PORTFOLIO_MAX) throw new CrmInputError(`São mais de ${PORTFOLIO_MAX.toLocaleString("pt-BR")} contatos: refine os filtros e faça em partes.`);
  if (input.preview === true) {
    const { rows } = await db.query<{ contacts: string; deals: string; tasks: string }>(
      `SELECT (SELECT count(*) FROM crm_contacts WHERE id = ANY($1) AND owner_id IS DISTINCT FROM $2) AS contacts,
              (SELECT count(*) FROM crm_deals WHERE contact_id = ANY($1) AND stage NOT IN ('ganho', 'perdido') AND owner_id IS DISTINCT FROM $2) AS deals,
              (SELECT count(*) FROM crm_tasks WHERE contact_id = ANY($1) AND done_at IS NULL AND canceled_at IS NULL AND owner_id IS DISTINCT FROM $2) AS tasks`,
      [ids, to.id]
    );
    const r = rows[0];
    return { contacts: Number(r.contacts), deals: opts.deals ? Number(r.deals) : 0, tasks: opts.tasks ? Number(r.tasks) : 0, companies: 0, toName: to.name, preview: true };
  }
  const moved = await withTransaction((client) => moveContacts(client, ids, to, opts, s));
  return { ...moved, toName: to.name, preview: false };
}

/** What a person owns today: contacts, open opportunities, pending tasks, company accounts. */
export async function portfolioCounts(userId: string): Promise<PortfolioCounts> {
  const db = await getDb();
  const { rows } = await db.query<{ contacts: string; deals: string; tasks: string; companies: string }>(
    `SELECT (SELECT count(*) FROM crm_contacts WHERE owner_id = $1) AS contacts,
            (SELECT count(*) FROM crm_deals WHERE owner_id = $1 AND stage NOT IN ('ganho', 'perdido')) AS deals,
            (SELECT count(*) FROM crm_tasks WHERE owner_id = $1 AND done_at IS NULL AND canceled_at IS NULL) AS tasks,
            (SELECT count(*) FROM crm_companies WHERE owner_id = $1) AS companies`,
    [userId]
  );
  const r = rows[0];
  return { contacts: Number(r.contacts), deals: Number(r.deals), tasks: Number(r.tasks), companies: Number(r.companies) };
}

/**
 * Transferir carteira (Administrador): everything a person owns — contacts,
 * open opportunities (also on other people's contacts), pending tasks and
 * company accounts — goes to another person (or to no one). Works for a
 * deactivated person too, which is the usual case.
 */
export async function transferPortfolio(
  s: CrmSession,
  fromId: string,
  toId: unknown,
  preview: boolean
): Promise<PortfolioCounts & { fromName: string; toName: string | null }> {
  requireCap(s, "manageTeam");
  const db = await getDb();
  const { rows } = await db.query<{ name: string }>(`SELECT name FROM internal_users WHERE id = $1`, [fromId]);
  if (!rows[0]) throw new CrmNotFoundError("Pessoa não encontrada.");
  if (toId === fromId) throw new CrmForbiddenError("Escolha outra pessoa para receber a carteira.");
  const to = await requireOwner(db, toId);
  if (preview) return { ...(await portfolioCounts(fromId)), fromName: rows[0].name, toName: to.name };
  const moved = await withTransaction(async (client) => {
    const contacts = await client.query<{ id: string }>(`SELECT id FROM crm_contacts WHERE owner_id = $1 FOR UPDATE`, [fromId]);
    const fromContacts = await moveContacts(client, contacts.rows.map((r) => r.id), to, { deals: false, tasks: false }, s);
    // Open opportunities and pending tasks this person owns anywhere (also on contacts that belong to someone else).
    const deals = await client.query(
      `WITH moved AS (
         SELECT d.id, d.contact_id, d.title FROM crm_deals d WHERE d.owner_id = $1 AND d.stage NOT IN ('ganho', 'perdido') FOR UPDATE
       ), upd AS (
         UPDATE crm_deals d SET owner_id = $2, updated_at = now() FROM moved WHERE d.id = moved.id RETURNING d.id, d.contact_id, moved.title
       )
       INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name)
       SELECT gen_random_uuid()::text, upd.contact_id, 'owner',
              jsonb_build_object('from', $3::text, 'to', $4::text, 'dealId', upd.id, 'dealTitle', upd.title, 'via', 'carteira'), $5, $6
       FROM upd`,
      [fromId, to.id, rows[0].name, to.name, s.userId, s.userName]
    );
    const tasks = await client.query(
      `UPDATE crm_tasks SET owner_id = $2, updated_at = now() WHERE owner_id = $1 AND done_at IS NULL AND canceled_at IS NULL`,
      [fromId, to.id]
    );
    const companies = await client.query(`UPDATE crm_companies SET owner_id = $2, updated_at = now() WHERE owner_id = $1`, [fromId, to.id]);
    return { contacts: fromContacts.contacts, deals: deals.rowCount ?? 0, tasks: tasks.rowCount ?? 0, companies: companies.rowCount ?? 0 };
  });
  return { ...moved, fromName: rows[0].name, toName: to.name };
}
