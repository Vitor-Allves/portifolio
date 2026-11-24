// Server-only. Atendimento das conversas (especificação v1.0, módulo 11):
// who is answering a WhatsApp conversation right now — not the same as the
// lead's owner (carteira). Answering a free conversation takes it; answering
// one someone else is attending needs an explicit "assumir" (so two people
// never answer at the same time without knowing it); every change goes to
// the contact's history. Also: response times.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { CrmConflictError, CrmForbiddenError, CrmInputError, CrmNotFoundError, addEvent } from "./crm-core";
import { crmSessionFor, type CrmSession } from "./crm-access";
import type { CrmResponseStats } from "./crm-types";
import type { StaffRole } from "./session-scope";

type Current = { attendant_id: string | null; attendant_name: string | null; attendant_active: boolean; owner_id: string | null; name: string };

/** The conversation's current attendant (a deactivated one counts as nobody), locked for this transaction. */
async function lockCurrent(client: PoolClient, contactId: string): Promise<Current> {
  // Lock first, then look the attendant up: after waiting for a concurrent
  // claim, a locking query re-reads the contact row but not a joined one, so
  // a join here would see the new attendant_id with the old (empty) person.
  const { rows } = await client.query<{ attendant_id: string | null; owner_id: string | null; name: string }>(
    `SELECT attendant_id, owner_id, name FROM crm_contacts WHERE id = $1 FOR UPDATE`,
    [contactId]
  );
  if (!rows[0]) throw new CrmNotFoundError("Contato não encontrado.");
  const r = rows[0];
  if (!r.attendant_id) return { ...r, attendant_name: null, attendant_active: false };
  const u = await client.query<{ name: string }>(`SELECT name FROM internal_users WHERE id = $1 AND revoked_at IS NULL`, [r.attendant_id]);
  return u.rows[0]
    ? { ...r, attendant_name: u.rows[0].name, attendant_active: true }
    : { ...r, attendant_id: null, attendant_name: null, attendant_active: false };
}

async function setAttendant(client: PoolClient, contactId: string, userId: string | null): Promise<void> {
  await client.query(`UPDATE crm_contacts SET attendant_id = $2, attendant_since = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1`, [contactId, userId]);
}

/**
 * Before a message goes out: a free conversation becomes this person's; one
 * they already attend stays theirs; someone else's is refused (409) unless
 * `takeover` — then it changes hands, in the history. Atomic, so two people
 * answering a free conversation at the same moment can't both take it.
 */
export async function claimForSending(s: CrmSession, contactId: string, takeover: boolean): Promise<void> {
  await withTransaction(async (client) => {
    const cur = await lockCurrent(client, contactId);
    if (cur.attendant_id === s.userId) return;
    if (cur.attendant_id && !takeover) {
      throw new CrmConflictError(`${cur.attendant_name} está atendendo esta conversa. Para responder, assuma o atendimento.`);
    }
    await setAttendant(client, contactId, s.userId);
    await addEvent(
      client,
      contactId,
      "attendance",
      cur.attendant_id ? { action: "takeover", from: cur.attendant_name, to: s.userName } : { action: "assumed", to: s.userName, via: "resposta" },
      s
    );
  });
}

/** "Assumir": the conversation becomes this person's (taking it over from whoever had it). */
export async function assumeConversation(s: CrmSession, contactId: string): Promise<void> {
  await withTransaction(async (client) => {
    const cur = await lockCurrent(client, contactId);
    if (cur.attendant_id === s.userId) return;
    await setAttendant(client, contactId, s.userId);
    await addEvent(client, contactId, "attendance", cur.attendant_id ? { action: "takeover", from: cur.attendant_name, to: s.userName } : { action: "assumed", to: s.userName }, s);
  });
}

/**
 * "Transferir": hands the conversation to someone who can answer it — they
 * must send WhatsApp messages and see this lead. They get a notice in the
 * bell. The person attending, or anyone who may reassign leads, transfers.
 */
export async function transferConversation(s: CrmSession, contactId: string, toUserId: unknown): Promise<{ toName: string }> {
  if (typeof toUserId !== "string" || !toUserId) throw new CrmInputError("Escolha para quem transferir.");
  const db = await getDb();
  const { rows } = await db.query<{ name: string; role: StaffRole }>(`SELECT name, role FROM internal_users WHERE id = $1 AND revoked_at IS NULL`, [toUserId]);
  const target = rows[0] ? await crmSessionFor(toUserId, rows[0].name, rows[0].role) : null;
  if (!target) throw new CrmInputError("Escolha alguém ativo no CRM.");
  if (!target.caps.sendWhatsApp) throw new CrmInputError(`${target.userName} não envia mensagens pelo WhatsApp.`);
  await withTransaction(async (client) => {
    const cur = await lockCurrent(client, contactId);
    if (cur.attendant_id && cur.attendant_id !== s.userId && !s.caps.assignAnyOwner) {
      throw new CrmForbiddenError(`${cur.attendant_name} está atendendo: só essa pessoa (ou um Gestor) transfere a conversa.`);
    }
    if (!target.caps.actOnAllLeads && cur.owner_id && cur.owner_id !== target.userId) {
      throw new CrmInputError(`${target.userName} não trabalha neste lead (está na carteira de outra pessoa). Troque o responsável do lead antes.`);
    }
    if (cur.attendant_id === target.userId) return;
    await setAttendant(client, contactId, target.userId);
    await addEvent(client, contactId, "attendance", { action: "transferred", from: cur.attendant_name, to: target.userName }, s);
    if (target.userId !== s.userId) {
      await client.query(`INSERT INTO crm_notifications (id, user_id, kind, title, body, contact_id) VALUES ($1, $2, 'atendimento', $3, $4, $5)`, [
        randomUUID(),
        target.userId,
        `Conversa transferida para você: ${cur.name}`.slice(0, 200),
        `Por ${s.userName}.`,
        contactId,
      ]);
    }
  });
  return { toName: target.userName };
}

/** "Encerrar": nobody attends the conversation any more. The person attending, or anyone who may reassign leads. */
export async function endConversation(s: CrmSession, contactId: string): Promise<void> {
  await withTransaction(async (client) => {
    const cur = await lockCurrent(client, contactId);
    if (!cur.attendant_id) return;
    if (cur.attendant_id !== s.userId && !s.caps.assignAnyOwner) {
      throw new CrmForbiddenError(`${cur.attendant_name} está atendendo: só essa pessoa (ou um Gestor) encerra o atendimento.`);
    }
    await setAttendant(client, contactId, null);
    await addEvent(client, contactId, "attendance", { action: "ended", from: cur.attendant_name }, s);
  });
}

/**
 * Tempo de resposta in the last `days`: from a contact's first message after
 * our silence (or after our last message) to our first answer that isn't a
 * campaign. Clock time, not business hours. `visible` limits it to the leads
 * a Comercial sees.
 */
export async function responseStats(days: number, visible: string | null): Promise<CrmResponseStats> {
  const d = days === 30 ? 30 : 7;
  const from = new Date(Date.now() - d * 86_400_000);
  const db = await getDb();
  const [stats, waiting] = await Promise.all([
    db.query<{ sent_by: string | null; name: string | null; n: string; avg_min: string }>(
      `WITH m AS (
         SELECT m.contact_id, m.direction, m.created_at,
                lag(m.direction) OVER (PARTITION BY m.contact_id ORDER BY m.created_at, m.seq) AS prev_dir
         FROM crm_messages m JOIN crm_contacts c ON c.id = m.contact_id
         WHERE m.created_at >= $1::timestamptz - interval '30 days' AND ($2::text IS NULL OR c.owner_id = $2 OR c.owner_id IS NULL)
       ), waits AS (
         SELECT contact_id, created_at AS asked FROM m WHERE direction = 'in' AND (prev_dir IS NULL OR prev_dir = 'out') AND created_at >= $1
       )
       SELECT r.sent_by, u.name, count(*) AS n, avg(EXTRACT(EPOCH FROM (r.created_at - w.asked)) / 60) AS avg_min
       FROM waits w
       JOIN LATERAL (
         SELECT o.created_at, o.sent_by FROM crm_messages o
         WHERE o.contact_id = w.contact_id AND o.direction = 'out' AND o.campaign_id IS NULL AND o.created_at > w.asked
         ORDER BY o.created_at LIMIT 1
       ) r ON true
       LEFT JOIN internal_users u ON u.id = r.sent_by
       GROUP BY r.sent_by, u.name`,
      [from, visible]
    ),
    db.query<{ n: string }>(
      `SELECT count(*) AS n FROM crm_contacts c
       WHERE c.archived_at IS NULL AND c.last_inbound_at IS NOT NULL AND c.last_inbound_at >= c.last_message_at
         AND ($1::text IS NULL OR c.owner_id = $1 OR c.owner_id IS NULL)`,
      [visible]
    ),
  ]);
  const answered = stats.rows.reduce((sum, r) => sum + Number(r.n), 0);
  const minutes = stats.rows.reduce((sum, r) => sum + Number(r.n) * Number(r.avg_min), 0);
  return {
    days: d,
    team: { answered, avgMinutes: answered ? Math.round(minutes / answered) : null },
    people: stats.rows
      .filter((r) => r.sent_by)
      .map((r) => ({ userId: r.sent_by!, name: r.name ?? "Pessoa removida", answered: Number(r.n), avgMinutes: Math.round(Number(r.avg_min)) }))
      .sort((a, b) => a.avgMinutes - b.avgMinutes),
    waitingNow: Number(waiting.rows[0].n),
  };
}
