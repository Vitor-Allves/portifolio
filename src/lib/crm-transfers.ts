// Server-only. Solicitação de transferência (evolução v1.0, item 6): a
// Comercial sees every lead but works only on their own (and the unowned,
// which they may take). To work on someone else's lead — or to hand one of
// their own to a colleague — they ask, with the reason; a Gestor or an
// Administrador ("trocar o responsável de qualquer lead") approves or
// refuses. Approving moves the lead with its open opportunities and pending
// tasks, like a carteira transfer. Everything is kept: the request, who
// asked, who decided, when and why, in the lead's history and in the audit.

import { afterTransferRequested } from "./crm-automation-hooks";
import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { writeAudit } from "./audit-log";
import { CrmForbiddenError, CrmInputError, CrmNotFoundError, addEvent, cleanText, iso } from "./crm-core";
import { crmSessionFor, requireCap, requireContact, type CrmSession } from "./crm-access";
import { moveContacts } from "./crm-portfolio";
import type { StaffRole } from "./session-scope";
import type { CrmTransferInfo } from "./crm-types";

export type CrmTransferStatus = "pendente" | "aprovada" | "recusada" | "cancelada";

export type CrmTransferRequest = CrmTransferInfo;

type Row = {
  id: string;
  contact_id: string;
  contact_name: string;
  company: string | null;
  from_owner_id: string | null;
  from_owner_name: string | null;
  to_owner_id: string | null;
  to_owner_name: string;
  reason: string;
  status: CrmTransferStatus;
  requested_by: string | null;
  requested_by_name: string;
  requested_at: Date;
  decided_by_name: string | null;
  decided_at: Date | null;
  decision_note: string | null;
};

const SELECT = `SELECT r.*, c.name AS contact_name, COALESCE(co.name, c.company) AS company
  FROM crm_transfer_requests r JOIN crm_contacts c ON c.id = r.contact_id LEFT JOIN crm_companies co ON co.id = c.company_id`;

function map(r: Row): CrmTransferRequest {
  return {
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    company: r.company,
    fromOwnerId: r.from_owner_id,
    fromOwnerName: r.from_owner_name,
    toOwnerId: r.to_owner_id,
    toOwnerName: r.to_owner_name,
    reason: r.reason,
    status: r.status,
    requestedById: r.requested_by,
    requestedByName: r.requested_by_name,
    requestedAt: iso(r.requested_at)!,
    decidedByName: r.decided_by_name,
    decidedAt: iso(r.decided_at),
    decisionNote: r.decision_note,
  };
}

/** Active people who approve transfers (may give any lead to anyone). */
export async function approvers(q: Pick<PoolClient, "query">): Promise<{ id: string; name: string }[]> {
  const { rows } = await q.query<{ id: string; name: string; role: StaffRole }>(`SELECT id, name, role FROM internal_users WHERE revoked_at IS NULL`);
  const out: { id: string; name: string }[] = [];
  for (const r of rows) {
    const s = await crmSessionFor(r.id, r.name, r.role);
    if (s?.caps.assignAnyOwner) out.push({ id: r.id, name: r.name });
  }
  return out;
}

async function notify(q: Pick<PoolClient, "query">, userIds: Iterable<string>, title: string, body: string, contactId: string) {
  for (const userId of new Set(userIds)) {
    await q.query(`INSERT INTO crm_notifications (id, user_id, kind, title, body, contact_id) VALUES ($1, $2, 'transferencia', $3, $4, $5)`, [
      randomUUID(),
      userId,
      title,
      body,
      contactId,
    ]);
  }
}

export type TransferInput = { contactId?: unknown; toOwnerId?: unknown; reason?: unknown };

/**
 * Asks for a lead: for oneself (someone else's lead), or to hand one's own
 * lead to a colleague. Who may already change the owner directly doesn't ask;
 * an unowned lead is simply taken.
 */
export async function requestTransfer(s: CrmSession, input: TransferInput): Promise<CrmTransferRequest> {
  requireCap(s, "editPipeline");
  const contactId = typeof input.contactId === "string" ? input.contactId : "";
  const { ownerId } = await requireContact(s, contactId, "view");
  if (s.caps.assignAnyOwner) throw new CrmInputError("Seu perfil troca o responsável direto, sem pedir transferência.");
  const reason = cleanText(input.reason, 500);
  if (!reason || reason.length < 5) throw new CrmInputError("Explique o motivo da transferência.");
  const to = typeof input.toOwnerId === "string" && input.toOwnerId ? input.toOwnerId : s.userId;
  if (ownerId === null && to === s.userId) throw new CrmInputError("Este lead está sem responsável: você pode assumi-lo direto.");
  if (to === ownerId) throw new CrmInputError("Esse já é o responsável pelo lead.");
  if (to !== s.userId && ownerId !== s.userId) throw new CrmForbiddenError("Você pode pedir um lead para você ou passar um lead seu para outra pessoa.");

  const db = await getDb();
  const people = await db.query<{ id: string; name: string; role: StaffRole }>(`SELECT id, name, role FROM internal_users WHERE id = ANY($1) AND revoked_at IS NULL`, [
    [to, ownerId].filter(Boolean),
  ]);
  const target = people.rows.find((p) => p.id === to);
  const targetSession = target ? await crmSessionFor(target.id, target.name, target.role) : null;
  if (!target || !targetSession?.caps.editPipeline) throw new CrmInputError("Escolha alguém ativo no CRM que trabalhe no funil.");
  const fromName = ownerId ? (people.rows.find((p) => p.id === ownerId)?.name ?? (await nameOf(ownerId))) : null;

  const id = randomUUID();
  const contactName = await withTransaction(async (client) => {
    const c = await client.query<{ name: string }>(`SELECT name FROM crm_contacts WHERE id = $1 FOR UPDATE`, [contactId]);
    const pending = await client.query(`SELECT 1 FROM crm_transfer_requests WHERE contact_id = $1 AND status = 'pendente'`, [contactId]);
    if (pending.rows.length) throw new CrmInputError("Já existe um pedido de transferência pendente para este lead.");
    await client.query(
      `INSERT INTO crm_transfer_requests (id, contact_id, from_owner_id, from_owner_name, to_owner_id, to_owner_name, reason, requested_by, requested_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, contactId, ownerId, fromName, to, target.name, reason, s.userId, s.userName]
    );
    await addEvent(client, contactId, "transfer", { action: "requested", requestId: id, from: fromName, to: target.name, reason, requestedBy: s.userName }, s);
    const name = c.rows[0]?.name ?? "lead";
    // Who approves (and the lead's owner) are told by the automation "Transferência solicitada" (on by default).
    await afterTransferRequested(client, id);
    return name;
  });
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.transfer_request",
    targetType: "crm_contact",
    targetId: contactId,
    targetLabel: contactName,
    metadata: { requestId: id, contact: contactName, from: fromName, to: target.name, reason },
  });
  return (await getTransfer(id))!;
}

async function nameOf(userId: string): Promise<string | null> {
  const db = await getDb();
  const { rows } = await db.query<{ name: string }>(`SELECT name FROM internal_users WHERE id = $1`, [userId]);
  return rows[0]?.name ?? null;
}

export async function getTransfer(id: string): Promise<CrmTransferRequest | null> {
  const db = await getDb();
  const { rows } = await db.query<Row>(`${SELECT} WHERE r.id = $1`, [id]);
  return rows[0] ? map(rows[0]) : null;
}

/** The open request on a lead, if any (shown on its panel). */
export async function pendingTransferFor(contactId: string): Promise<CrmTransferRequest | null> {
  const db = await getDb();
  const { rows } = await db.query<Row>(`${SELECT} WHERE r.contact_id = $1 AND r.status = 'pendente'`, [contactId]);
  return rows[0] ? map(rows[0]) : null;
}

/**
 * Approves or refuses a pending request (Gestor / Administrador). Approving
 * moves the lead, its open opportunities and pending tasks to who it was
 * asked for — only if the lead is still with the same person as when it was
 * asked.
 */
export async function decideTransfer(s: CrmSession, id: string, input: { decision?: unknown; note?: unknown }): Promise<CrmTransferRequest> {
  if (!s.caps.assignAnyOwner) throw new CrmForbiddenError("Só Gestor ou Administrador aprovam transferências.");
  const decision = input.decision === "aprovar" ? "aprovada" : input.decision === "recusar" ? "recusada" : null;
  if (!decision) throw new CrmInputError("Escolha aprovar ou recusar.");
  const note = cleanText(input.note, 500);
  if (decision === "recusada" && !note) throw new CrmInputError("Diga o motivo da recusa.");
  const r = await withTransaction(async (client) => {
    const { rows } = await client.query<Row>(`${SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [id]);
    const req = rows[0];
    if (!req) throw new CrmNotFoundError("Pedido de transferência não encontrado.");
    if (req.status !== "pendente") throw new CrmInputError("Esse pedido já foi decidido.");
    if (decision === "aprovada") {
      const cur = await client.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_contacts WHERE id = $1 FOR UPDATE`, [req.contact_id]);
      if ((cur.rows[0]?.owner_id ?? null) !== req.from_owner_id) {
        throw new CrmInputError("O responsável deste lead mudou desde o pedido. Recuse e peça de novo, se ainda fizer sentido.");
      }
      if (!req.to_owner_id) throw new CrmInputError("Quem pediu não está mais no CRM. Recuse o pedido.");
      const active = await client.query(`SELECT 1 FROM internal_users WHERE id = $1 AND revoked_at IS NULL`, [req.to_owner_id]);
      if (!active.rows.length) throw new CrmInputError(`${req.to_owner_name} não está mais ativo no CRM. Recuse o pedido.`);
      await moveContacts(client, [req.contact_id], { id: req.to_owner_id, name: req.to_owner_name }, { deals: true, tasks: true }, s, "transferencia");
    }
    await client.query(`UPDATE crm_transfer_requests SET status = $2, decided_by = $3, decided_by_name = $4, decided_at = now(), decision_note = $5 WHERE id = $1`, [
      id,
      decision,
      s.userId,
      s.userName,
      note,
    ]);
    await addEvent(
      client,
      req.contact_id,
      "transfer",
      { action: decision, requestId: id, from: req.from_owner_name, to: req.to_owner_name, note, requestedBy: req.requested_by_name },
      s
    );
    const verb = decision === "aprovada" ? "aprovada" : "recusada";
    const who = [req.requested_by, req.to_owner_id, req.from_owner_id].filter((x): x is string => Boolean(x) && x !== s.userId);
    await notify(
      client,
      who,
      `Transferência ${verb}: ${req.contact_name}`,
      `${s.userName} ${verb === "aprovada" ? "aprovou" : "recusou"} a transferência (${req.from_owner_name ?? "sem responsável"} → ${req.to_owner_name})${note ? `: ${note}` : "."}`,
      req.contact_id
    );
    return req;
  });
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.transfer_decision",
    targetType: "crm_contact",
    targetId: r.contact_id,
    targetLabel: r.contact_name,
    metadata: { requestId: id, contact: r.contact_name, status: decision, from: r.from_owner_name, to: r.to_owner_name, requestedBy: r.requested_by_name, note },
  });
  return (await getTransfer(id))!;
}

/** Whoever asked may withdraw a pending request. */
export async function cancelTransfer(s: CrmSession, id: string): Promise<CrmTransferRequest> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<Row>(`${SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [id]);
    const req = rows[0];
    if (!req || (req.requested_by !== s.userId && !s.caps.assignAnyOwner)) throw new CrmNotFoundError("Pedido de transferência não encontrado.");
    if (req.status !== "pendente") throw new CrmInputError("Esse pedido já foi decidido.");
    await client.query(`UPDATE crm_transfer_requests SET status = 'cancelada', decided_by = $2, decided_by_name = $3, decided_at = now() WHERE id = $1`, [id, s.userId, s.userName]);
    await addEvent(client, req.contact_id, "transfer", { action: "cancelada", requestId: id, from: req.from_owner_name, to: req.to_owner_name, requestedBy: req.requested_by_name }, s);
  });
  return (await getTransfer(id))!;
}

/**
 * The requests this person may see: a Gestor / Administrador, all of them;
 * anyone else, the ones they asked for, the ones about their leads and the
 * ones that would give them a lead. Pending first, then the latest.
 */
export async function listTransfers(s: CrmSession, status: CrmTransferStatus | "todas" = "todas"): Promise<CrmTransferRequest[]> {
  const db = await getDb();
  const values: unknown[] = [];
  const where: string[] = [];
  if (status !== "todas") {
    values.push(status);
    where.push(`r.status = $${values.length}`);
  }
  if (!s.caps.assignAnyOwner) {
    values.push(s.userId);
    where.push(`(r.requested_by = $${values.length} OR r.from_owner_id = $${values.length} OR r.to_owner_id = $${values.length})`);
  }
  const { rows } = await db.query<Row>(
    `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY (r.status = 'pendente') DESC, r.requested_at DESC LIMIT 300`,
    values
  );
  return rows.map(map);
}
