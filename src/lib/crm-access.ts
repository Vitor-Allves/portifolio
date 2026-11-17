// Server-only. Who is acting in the CRM and what they may touch (Fase 3).
// Profiles and capabilities are defined in crm-permissions.ts; this module
// reads them from the database and checks individual records, so every
// /api/crm route enforces the same rules the screens show.

import { getDb } from "./db";
import { CrmForbiddenError, CrmNotFoundError, type CrmActor } from "./crm-core";
import {
  CRM_ACCESS_OPTIONS,
  canAssignOwner,
  crmCapabilities,
  effectiveCrmAccess,
  isCrmAccess,
  type CrmAccess,
  type CrmCapabilities,
  type CrmRole,
} from "./crm-permissions";
import type { StaffRole } from "./session-scope";

export type CrmSession = NonNullable<CrmActor> & { role: CrmRole; caps: CrmCapabilities };

/** The CRM profile of a staff member, or null when they have no access to the CRM. */
export async function crmSessionFor(userId: string, userName: string, staffRole: StaffRole): Promise<CrmSession | null> {
  const db = await getDb();
  const { rows } = await db.query<{ crm_role: string | null }>(`SELECT crm_role FROM internal_users WHERE id = $1`, [userId]);
  const access = effectiveCrmAccess(rows[0]?.crm_role ?? null, staffRole);
  if (access === "sem_acesso") return null;
  return { userId, userName, role: access, caps: crmCapabilities(access) };
}

/** For list queries: the user whose leads (plus unowned ones) a Comercial sees; null = everything. */
export function visibleTo(s: CrmSession): string | null {
  return s.caps.seeAllLeads ? null : s.userId;
}

const DENIED: Record<keyof CrmCapabilities, string> = {
  seeAllLeads: "Seu perfil vê apenas os seus leads.",
  editPipeline: "Seu perfil não pode alterar o funil nem as tarefas.",
  sendWhatsApp: "Seu perfil não envia mensagens pelo CRM.",
  assignAnyOwner: "Seu perfil não pode trocar o responsável.",
  editContacts: "Seu perfil não pode editar contatos.",
  importContacts: "Seu perfil não pode importar planilhas.",
  exportContacts: "Seu perfil não pode exportar contatos.",
  manageTeam: "Só o Administrador gerencia a equipe do CRM.",
};

export function requireCap(s: CrmSession, cap: keyof CrmCapabilities): void {
  if (!s.caps[cap]) throw new CrmForbiddenError(DENIED[cap]);
}

function canSee(s: CrmSession, ownerId: string | null): boolean {
  return s.caps.seeAllLeads || ownerId === null || ownerId === s.userId;
}

/** The contact's owner, after checking this session can see it (an invisible lead reads as not found). */
export async function requireContact(s: CrmSession, contactId: string): Promise<{ ownerId: string | null }> {
  const db = await getDb();
  const { rows } = await db.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_contacts WHERE id = $1`, [contactId]);
  if (!rows[0] || !canSee(s, rows[0].owner_id)) throw new CrmNotFoundError("Contato não encontrado.");
  return { ownerId: rows[0].owner_id };
}

async function requireChild(s: CrmSession, table: "crm_deals" | "crm_tasks", id: string, label: string) {
  const db = await getDb();
  const { rows } = await db.query<{ contact_id: string; owner_id: string | null; contact_owner: string | null }>(
    `SELECT x.contact_id, x.owner_id, c.owner_id AS contact_owner FROM ${table} x JOIN crm_contacts c ON c.id = x.contact_id WHERE x.id = $1`,
    [id]
  );
  if (!rows[0] || !canSee(s, rows[0].contact_owner)) throw new CrmNotFoundError(`${label} não encontrada.`);
  return { contactId: rows[0].contact_id, ownerId: rows[0].owner_id };
}

export const requireDeal = (s: CrmSession, id: string) => requireChild(s, "crm_deals", id, "Oportunidade");
export const requireTask = (s: CrmSession, id: string) => requireChild(s, "crm_tasks", id, "Tarefa");

/** WhatsApp media is only served to someone who can see the conversation it belongs to. */
export async function requireMedia(s: CrmSession, mediaId: string): Promise<void> {
  const db = await getDb();
  const { rows } = await db.query<{ owner_id: string | null }>(
    `SELECT c.owner_id FROM crm_messages m JOIN crm_contacts c ON c.id = m.contact_id WHERE m.media_id = $1 LIMIT 1`,
    [mediaId]
  );
  if (!rows[0] || !canSee(s, rows[0].owner_id)) throw new CrmNotFoundError("Mídia não encontrada.");
}

/** Throws unless this session may set the owner `next` on a record currently owned by `current`. `undefined` = not changing it. */
export function requireOwnerChange(s: CrmSession, next: unknown, current: string | null): void {
  if (next === undefined) return;
  const ownerId = typeof next === "string" && next ? next : null;
  if (!canAssignOwner(s.caps, s.userId, ownerId, current)) {
    throw new CrmForbiddenError("Seu perfil só pode assumir leads sem responsável ou deixar os seus.");
  }
}

export type CrmTeamRow = {
  id: string;
  name: string;
  username: string;
  staffRole: StaffRole;
  access: CrmAccess;
  /** A general administrator is always a CRM administrator. */
  locked: boolean;
};

export async function listCrmTeam(): Promise<CrmTeamRow[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string; username: string; role: StaffRole; crm_role: string | null }>(
    `SELECT id, name, username, role, crm_role FROM internal_users WHERE revoked_at IS NULL ORDER BY lower(name)`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    staffRole: r.role,
    access: effectiveCrmAccess(r.crm_role, r.role),
    locked: r.role === "administrador_geral",
  }));
}

/** Sets someone's CRM profile. Returns the previous and new profile, for the audit trail. */
export async function setCrmAccess(s: CrmSession, userId: string, access: unknown): Promise<{ name: string; from: CrmAccess; to: CrmAccess }> {
  requireCap(s, "manageTeam");
  if (!isCrmAccess(access)) throw new CrmForbiddenError(`Perfil inválido. Use: ${CRM_ACCESS_OPTIONS.map((o) => o.label).join(", ")}.`);
  if (userId === s.userId) throw new CrmForbiddenError("Você não pode mudar o seu próprio perfil.");
  const db = await getDb();
  const { rows } = await db.query<{ name: string; role: StaffRole; crm_role: string | null }>(
    `SELECT name, role, crm_role FROM internal_users WHERE id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  const row = rows[0];
  if (!row) throw new CrmNotFoundError("Pessoa não encontrada.");
  if (row.role === "administrador_geral") throw new CrmForbiddenError("O Administrador geral é sempre Administrador do CRM.");
  const from = effectiveCrmAccess(row.crm_role, row.role);
  await db.query(`UPDATE internal_users SET crm_role = $2 WHERE id = $1`, [userId, access]);
  return { name: row.name, from, to: access };
}
