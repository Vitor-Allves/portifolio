// Server-only. Who is acting in the CRM and what they may touch (Fase 3).
// Profiles and capabilities are defined in crm-permissions.ts; this module
// reads them from the database and checks individual records, so every
// /api/crm route enforces the same rules the screens show.

import { randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import { CrmForbiddenError, CrmInputError, CrmNotFoundError, cleanText, type CrmActor } from "./crm-core";
import {
  CRM_ACCESS_OPTIONS,
  canAssignOwner,
  effectiveCapabilities,
  effectiveCrmAccess,
  isCrmAccess,
  sanitizeOverrides,
  type CrmAccess,
  type CrmCapabilities,
  type CrmPermissionOverrides,
  type CrmRole,
  type CrmTeamRow,
} from "./crm-permissions";
import type { StaffRole } from "./session-scope";
import { requireOptionId } from "./crm-options";
import { TASK_RECORD_OWNER } from "./crm-tasks";
import { generatePassword, hashPassword } from "./password";
import { claimUsernameTx } from "./username-registry";
import { EMPTY_PERMISSIONS } from "./client-permissions";
import { resetInternalUserPassword, revokeInternalUser } from "./internal-users";

export type CrmSession = NonNullable<CrmActor> & { role: CrmRole; caps: CrmCapabilities };

/**
 * The CRM profile of a staff member, with their individual exceptions
 * applied, or null when they have no access to the CRM. Read fresh on every
 * request, so a change takes effect at the person's next action.
 */
export async function crmSessionFor(userId: string, userName: string, staffRole: StaffRole): Promise<CrmSession | null> {
  const db = await getDb();
  const { rows } = await db.query<{ crm_role: string | null; crm_permissions: unknown }>(
    `SELECT crm_role, crm_permissions FROM internal_users WHERE id = $1`,
    [userId]
  );
  const access = effectiveCrmAccess(rows[0]?.crm_role ?? null, staffRole);
  if (access === "sem_acesso") return null;
  // The general administrator is always a full Administrador: no exceptions apply.
  const overrides = staffRole === "administrador_geral" ? {} : rows[0]?.crm_permissions;
  return { userId, userName, role: access, caps: effectiveCapabilities(access, overrides) };
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
  archiveContacts: "Seu perfil não pode arquivar contatos.",
  importContacts: "Seu perfil não pode importar planilhas.",
  exportContacts: "Seu perfil não pode exportar contatos.",
  manageTeam: "Só o Administrador gerencia a equipe do CRM.",
  editCampaigns: "Seu perfil não acessa as campanhas.",
  sendCampaigns: "Só Administrador e Gestor disparam campanhas.",
  customize: "Só o Administrador altera a Personalização do CRM.",
  manageAutomations: "Só o Administrador mexe nas automações.",
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

/** The opportunity's contact and owner, after checking this session can see its contact. */
export async function requireDeal(s: CrmSession, id: string): Promise<{ contactId: string; ownerId: string | null }> {
  const db = await getDb();
  const { rows } = await db.query<{ contact_id: string; owner_id: string | null; contact_owner: string | null }>(
    `SELECT x.contact_id, x.owner_id, c.owner_id AS contact_owner FROM crm_deals x JOIN crm_contacts c ON c.id = x.contact_id WHERE x.id = $1`,
    [id]
  );
  if (!rows[0] || !canSee(s, rows[0].contact_owner)) throw new CrmNotFoundError("Oportunidade não encontrada.");
  return { contactId: rows[0].contact_id, ownerId: rows[0].owner_id };
}

/** The task's contact (if any) and owner, after checking this session can see the record it is on (see TASK_RECORD_OWNER). */
export async function requireTask(s: CrmSession, id: string): Promise<{ contactId: string | null; ownerId: string | null }> {
  const db = await getDb();
  const { rows } = await db.query<{ contact_id: string | null; owner_id: string | null; record_owner: string | null }>(
    `SELECT t.contact_id, t.owner_id, ${TASK_RECORD_OWNER} AS record_owner
     FROM crm_tasks t LEFT JOIN crm_contacts c ON c.id = t.contact_id LEFT JOIN crm_companies co ON co.id = t.company_id
     WHERE t.id = $1`,
    [id]
  );
  if (!rows[0] || !canSee(s, rows[0].record_owner)) throw new CrmNotFoundError("Tarefa não encontrada.");
  return { contactId: rows[0].contact_id, ownerId: rows[0].owner_id };
}

/**
 * A company a task can be put on: every profile sees every company, but a
 * task on one that is in someone else's carteira would be invisible to a
 * Comercial who created it — so it is refused, as with contacts.
 */
export async function requireCompanyForTask(s: CrmSession, companyId: string): Promise<{ ownerId: string | null }> {
  const db = await getDb();
  const { rows } = await db.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_companies WHERE id = $1`, [companyId]);
  if (!rows[0]) throw new CrmNotFoundError("Empresa não encontrada.");
  if (!canSee(s, rows[0].owner_id)) throw new CrmForbiddenError("Essa empresa está na carteira de outra pessoa.");
  return { ownerId: rows[0].owner_id };
}

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

export type { CrmTeamRow } from "./crm-permissions";

type TeamDbRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: StaffRole;
  crm_role: string | null;
  crm_permissions: unknown;
  crm_job_title: string | null;
  crm_department: string | null;
  account_count: number;
  revoked_at: Date | null;
  totp_enabled: boolean;
};

const TEAM_SELECT = `SELECT id, name, username, email, role, crm_role, crm_permissions, crm_job_title, crm_department,
  cardinality(account_ids) AS account_count, revoked_at, totp_enabled FROM internal_users`;

function mapTeam(r: TeamDbRow): CrmTeamRow {
  const access = effectiveCrmAccess(r.crm_role, r.role);
  const locked = r.role === "administrador_geral";
  const overrides = access === "sem_acesso" || locked ? {} : sanitizeOverrides(r.crm_permissions, access);
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    email: r.email,
    staffRole: r.role,
    access,
    locked,
    jobTitle: r.crm_job_title,
    department: r.crm_department,
    overrides,
    caps: access === "sem_acesso" ? null : effectiveCapabilities(access, overrides),
    crmOnly: r.role === "analista" && Number(r.account_count) === 0,
    active: r.revoked_at === null,
    totpEnabled: r.totp_enabled,
  };
}

export async function listCrmTeam(includeInactive = false): Promise<CrmTeamRow[]> {
  const db = await getDb();
  const { rows } = await db.query<TeamDbRow>(
    `${TEAM_SELECT} ${includeInactive ? "" : "WHERE revoked_at IS NULL"} ORDER BY revoked_at IS NOT NULL, lower(name)`
  );
  return rows.map(mapTeam);
}

async function teamMember(id: string): Promise<CrmTeamRow> {
  const db = await getDb();
  const { rows } = await db.query<TeamDbRow>(`${TEAM_SELECT} WHERE id = $1`, [id]);
  if (!rows[0]) throw new CrmNotFoundError("Pessoa não encontrada.");
  return mapTeam(rows[0]);
}

export type TeamPatch = { access?: unknown; permissions?: unknown; jobTitle?: unknown; department?: unknown };

export type TeamChange = {
  name: string;
  access?: { from: CrmAccess; to: CrmAccess };
  permissions?: { from: CrmPermissionOverrides; to: CrmPermissionOverrides };
  details?: { jobTitle: string | null; department: string | null };
  /** Their open sessions were ended (promoted to Administrador without 2FA). */
  endedSessions?: boolean;
};

/**
 * Changes someone's CRM profile, exceptions, cargo and departamento
 * (Administrador). Nobody changes their own profile or permissions; the
 * general administrator is always a full Administrador. Returns what
 * changed, for the audit trail.
 */
export async function updateTeamMember(s: CrmSession, userId: string, patch: TeamPatch): Promise<TeamChange> {
  requireCap(s, "manageTeam");
  const current = await teamMember(userId);
  if (!current.active) throw new CrmForbiddenError("Essa pessoa foi desativada.");
  const change: TeamChange = { name: current.name };
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  let access = current.access;
  if (patch.access !== undefined && patch.access !== current.access) {
    if (!isCrmAccess(patch.access)) throw new CrmInputError(`Perfil inválido. Use: ${CRM_ACCESS_OPTIONS.map((o) => o.label).join(", ")}.`);
    if (userId === s.userId) throw new CrmForbiddenError("Você não pode mudar o seu próprio perfil.");
    if (current.locked) throw new CrmForbiddenError("O Administrador geral é sempre Administrador do CRM.");
    access = patch.access;
    set("crm_role", access);
    change.access = { from: current.access, to: access };
    // Administradores log in with 2FA: someone promoted without it is signed
    // out everywhere, so the next login walks them through enrolling.
    if (access === "administrador" && !current.totpEnabled) {
      sets.push("session_version = session_version + 1");
      change.endedSessions = true;
    }
  }
  if (patch.permissions !== undefined || change.access) {
    if (patch.permissions !== undefined) {
      if (userId === s.userId) throw new CrmForbiddenError("Você não pode mudar as suas próprias permissões.");
      if (current.locked) throw new CrmForbiddenError("O Administrador geral tem todas as permissões.");
    }
    // Exceptions are kept relative to the profile in force; without CRM access there are none.
    const raw = patch.permissions !== undefined ? patch.permissions : current.overrides;
    const next = access === "sem_acesso" ? {} : sanitizeOverrides(raw, access);
    if (JSON.stringify(next) !== JSON.stringify(current.overrides)) {
      set("crm_permissions", JSON.stringify(next));
      change.permissions = { from: current.overrides, to: next };
    }
  }
  if (patch.jobTitle !== undefined || patch.department !== undefined) {
    const jobTitle = patch.jobTitle !== undefined ? cleanText(patch.jobTitle, 80) : current.jobTitle;
    let department = current.department;
    if (patch.department !== undefined) {
      const db = await getDb();
      department = patch.department ? await requireOptionId(db, "department", patch.department, current.department) : null;
    }
    if (jobTitle !== current.jobTitle || department !== current.department) {
      set("crm_job_title", jobTitle);
      set("crm_department", department);
      change.details = { jobTitle, department };
    }
  }
  if (sets.length > 0) {
    const db = await getDb();
    values.push(userId);
    await db.query(`UPDATE internal_users SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
  }
  return change;
}

/** Kept for the profile-only route used before Fase 2. */
export async function setCrmAccess(s: CrmSession, userId: string, access: unknown): Promise<{ name: string; from: CrmAccess; to: CrmAccess }> {
  const before = await teamMember(userId).catch(() => null);
  const change = await updateTeamMember(s, userId, { access });
  const to = change.access?.to ?? before?.access ?? "sem_acesso";
  return { name: change.name, from: change.access?.from ?? to, to };
}

export type NewCrmUserInput = { name?: unknown; username?: unknown; email?: unknown; access?: unknown; jobTitle?: unknown; department?: unknown };

/**
 * A login for someone who only uses the CRM (Administrador): Intelligence
 * profile "Analista" with no companies, so the Intelligence shows them
 * nothing. Starts with a generated temporary password (returned once, never
 * stored in the clear) that must be changed on the first login.
 */
export async function createCrmUser(s: CrmSession, input: NewCrmUserInput): Promise<{ id: string; username: string; password: string }> {
  requireCap(s, "manageTeam");
  const name = cleanText(input.name, 120);
  if (!name) throw new CrmInputError("Informe o nome.");
  const email = cleanText(input.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CrmInputError("E-mail inválido.");
  if (!isCrmAccess(input.access) || input.access === "sem_acesso") throw new CrmInputError("Escolha o perfil no CRM.");
  const access: CrmRole = input.access;
  const jobTitle = cleanText(input.jobTitle, 80);
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  return withTransaction(async (client) => {
    const department = input.department ? await requireOptionId(client, "department", input.department) : null;
    const username = await claimUsernameTx(client, typeof input.username === "string" ? input.username : "", "internal_users", id);
    await client.query(
      `INSERT INTO internal_users (id, name, username, email, password_hash, role, account_ids, permissions, must_change_password,
                                   crm_role, crm_job_title, crm_department)
       VALUES ($1, $2, $3, $4, $5, 'analista', '{}', $6, true, $7, $8, $9)`,
      [id, name, username, email, passwordHash, JSON.stringify(EMPTY_PERMISSIONS), access, jobTitle, department]
    );
    return { id, username, password };
  });
}

/** Only CRM-only logins are managed here; anyone with Intelligence access is managed there (administrador geral). */
async function crmOnlyTarget(s: CrmSession, userId: string): Promise<CrmTeamRow> {
  requireCap(s, "manageTeam");
  if (userId === s.userId) throw new CrmForbiddenError("Você não pode fazer isso com a sua própria conta.");
  const target = await teamMember(userId);
  if (!target.active) throw new CrmForbiddenError("Essa pessoa já foi desativada.");
  if (!target.crmOnly) {
    throw new CrmForbiddenError("Essa pessoa também usa o Intelligence: senha e desativação ficam com o administrador geral, no Intelligence.");
  }
  return target;
}

/**
 * Deactivates a CRM-only login: ends every open session and blocks new
 * logins. Nothing they did is removed (leads, history, tasks keep their name).
 */
export async function deactivateCrmUser(s: CrmSession, userId: string): Promise<CrmTeamRow> {
  const target = await crmOnlyTarget(s, userId);
  await revokeInternalUser(userId);
  return target;
}

/** New temporary password for a CRM-only login (returned once); ends their open sessions and forces a change on the next login. */
export async function resetCrmUserPassword(s: CrmSession, userId: string): Promise<{ target: CrmTeamRow; password: string }> {
  const target = await crmOnlyTarget(s, userId);
  const password = generatePassword();
  await resetInternalUserPassword(userId, password);
  return { target, password };
}

/**
 * Encerrar sessões (Administrador): signs someone out on every device right
 * away (their next request needs a new login). Not for oneself, and not for
 * the general administrator.
 */
export async function endSessions(s: CrmSession, userId: string): Promise<CrmTeamRow> {
  requireCap(s, "manageTeam");
  if (userId === s.userId) throw new CrmForbiddenError("Para sair dos seus próprios dispositivos, use Sair.");
  const target = await teamMember(userId);
  if (!target.active) throw new CrmForbiddenError("Essa pessoa já foi desativada.");
  if (target.locked) throw new CrmForbiddenError("As sessões do Administrador geral são gerenciadas no Intelligence.");
  const db = await getDb();
  await db.query(`UPDATE internal_users SET session_version = session_version + 1 WHERE id = $1`, [userId]);
  return target;
}

/** An Administrador whose session predates the 2FA requirement: the CRM asks them to sign in again to set it up. */
export async function needsTotpSetup(s: CrmSession): Promise<boolean> {
  if (s.role !== "administrador") return false;
  const db = await getDb();
  const { rows } = await db.query<{ totp_enabled: boolean }>(`SELECT totp_enabled FROM internal_users WHERE id = $1`, [s.userId]);
  return rows[0] ? !rows[0].totp_enabled : false;
}
