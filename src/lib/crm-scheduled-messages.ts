// Server-only. Mensagens agendadas (evolução v1.0, item 11): someone who may
// talk to a lead on WhatsApp writes a message (free text or an approved
// model) to go out at a set time. It is a send by that person, only later:
// at the time, every rule of a send is checked again — they're still active
// with "enviar WhatsApp", the lead is still theirs to work on, the contact
// hasn't opted out, a free text still has the 24h window open, nobody else
// took over the conversation. Anything off and the message is not sent: it
// is marked "não enviada" with the reason, and the person gets a notice.
//
// Who sends them: the scheduler of the server (GET /api/cron/scheduled-messages
// and the daily check) and, between its runs, the CRM itself — every poll of
// the bell (once a minute per open CRM) runs a due check after answering.
// Each message is claimed (pendente → enviando) by one dispatcher before it
// is sent, so two runs never send it twice; one stuck "enviando" (the
// process died mid-send) becomes "não enviada" — never re-sent on its own,
// since it may have gone out.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { CrmConflictError, CrmForbiddenError, CrmInputError, CrmNotFoundError, addEvent, iso } from "./crm-core";
import { canAct, canSeeConversation, crmSessionFor, requireCap, requireContact, type CrmSession } from "./crm-access";
import { claimForSending } from "./crm-conversations";
import { recordOutbound } from "./crm";
import { serviceWindowRemainingMs } from "./crm-types";
import { SCHEDULE_MAX_DAYS, type CrmScheduledMessage, type CrmScheduledStatus } from "./crm-scheduled-types";
import { WhatsAppApiError, WhatsAppConfigError, sendTemplate, sendText } from "./whatsapp";
import type { StaffRole } from "./session-scope";

type Q = Pick<PoolClient, "query">;

type Row = {
  id: string;
  contact_id: string;
  kind: "text" | "template";
  body: string | null;
  template_name: string | null;
  template_language: string | null;
  template_params: unknown;
  send_at: Date;
  status: CrmScheduledStatus;
  error: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
  sent_at: Date | null;
  canceled_by_name: string | null;
};

const params = (v: unknown): string[] => (Array.isArray(v) ? v.map((p) => String(p ?? "")) : []);

function toMessage(r: Row): CrmScheduledMessage {
  return {
    id: r.id,
    contactId: r.contact_id,
    kind: r.kind,
    body: r.body,
    templateName: r.template_name,
    templateLanguage: r.template_language,
    templateParams: params(r.template_params),
    sendAt: iso(r.send_at)!,
    status: r.status,
    error: r.error,
    createdById: r.created_by,
    createdByName: r.created_by_name,
    createdAt: iso(r.created_at)!,
    sentAt: iso(r.sent_at),
    canceledByName: r.canceled_by_name,
  };
}

/** The contact's scheduled messages: those still to go first (soonest first), then the latest others. */
export async function listScheduled(s: CrmSession, contactId: string): Promise<CrmScheduledMessage[]> {
  const { ownerId } = await requireContact(s, contactId, "view");
  if (!canSeeConversation(s, ownerId)) throw new CrmForbiddenError("Seu perfil não vê as conversas de leads de outras pessoas.");
  const db = await getDb();
  const { rows } = await db.query<Row>(
    `(SELECT * FROM crm_scheduled_messages WHERE contact_id = $1 AND status IN ('pendente', 'enviando') ORDER BY send_at)
     UNION ALL
     (SELECT * FROM crm_scheduled_messages WHERE contact_id = $1 AND status NOT IN ('pendente', 'enviando') ORDER BY COALESCE(sent_at, updated_at) DESC LIMIT 10)`,
    [contactId],
  );
  return rows.map(toMessage);
}

export type ScheduleInput = { kind?: unknown; body?: unknown; name?: unknown; language?: unknown; params?: unknown; sendAt?: unknown };

function parseSendAt(v: unknown, now = Date.now()): Date {
  const t = typeof v === "string" && v ? Date.parse(v) : NaN;
  if (!Number.isFinite(t)) throw new CrmInputError("Escolha a data e a hora do envio.");
  if (t <= now) throw new CrmInputError("Escolha um horário no futuro.");
  if (t > now + SCHEDULE_MAX_DAYS * 86_400_000) throw new CrmInputError(`Agende para no máximo ${SCHEDULE_MAX_DAYS} dias à frente.`);
  return new Date(t);
}

/** Schedules a message, by this person, to this contact. */
export async function scheduleMessage(s: CrmSession, contactId: string, input: ScheduleInput): Promise<CrmScheduledMessage> {
  await requireContact(s, contactId);
  requireCap(s, "sendWhatsApp");
  const sendAt = parseSendAt(input.sendAt);
  let body: string | null = null;
  let name: string | null = null;
  let language: string | null = null;
  let values: string[] = [];
  if (input.kind === "text") {
    body = typeof input.body === "string" ? input.body.trim() : "";
    if (!body) throw new CrmInputError("A mensagem está vazia.");
    if (body.length > 4096) throw new CrmInputError("Mensagem longa demais (máximo de 4.096 caracteres).");
  } else if (input.kind === "template") {
    name = typeof input.name === "string" ? input.name.trim() : "";
    language = typeof input.language === "string" ? input.language.trim() : "";
    if (!name || !language) throw new CrmInputError("Escolha um modelo.");
    values = Array.isArray(input.params) ? input.params.map((p) => String(p ?? "").trim()) : [];
    if (values.some((v) => !v)) throw new CrmInputError("Preencha todos os campos do modelo.");
    if (values.some((v) => v.length > 1024)) throw new CrmInputError("Um campo do modelo está longo demais.");
  } else {
    throw new CrmInputError("Tipo de mensagem inválido.");
  }

  return withTransaction(async (client) => {
    const { rows: c } = await client.query<{ phone: string | null; opted_out_at: Date | null }>(
      `SELECT phone, opted_out_at FROM crm_contacts WHERE id = $1 FOR UPDATE`,
      [contactId],
    );
    if (!c[0]) throw new CrmNotFoundError("Contato não encontrado.");
    if (!c[0].phone) throw new CrmInputError("Este contato não tem WhatsApp cadastrado.");
    if (c[0].opted_out_at) throw new CrmInputError("Este contato se descadastrou: não recebe mensagens agendadas.");
    const { rows: pending } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM crm_scheduled_messages WHERE contact_id = $1 AND status = 'pendente'`,
      [contactId],
    );
    if (pending[0].n >= 10) throw new CrmInputError("Este contato já tem 10 mensagens agendadas. Cancele alguma antes de agendar outra.");
    const id = randomUUID();
    const { rows } = await client.query<Row>(
      `INSERT INTO crm_scheduled_messages (id, contact_id, kind, body, template_name, template_language, template_params, send_at, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, contactId, input.kind, body, name, language, JSON.stringify(values), sendAt, s.userId, s.userName],
    );
    await addEvent(client, contactId, "scheduled_message", { action: "scheduled", id, sendAt: sendAt.toISOString(), kind: input.kind, templateName: name }, s);
    return toMessage(rows[0]);
  });
}

/** Cancels a message still waiting to go out. */
export async function cancelScheduled(s: CrmSession, contactId: string, id: string): Promise<CrmScheduledMessage> {
  await requireContact(s, contactId);
  requireCap(s, "sendWhatsApp");
  return withTransaction(async (client) => {
    const { rows } = await client.query<Row>(
      `UPDATE crm_scheduled_messages SET status = 'cancelada', canceled_by_name = $3, updated_at = now()
       WHERE id = $1 AND contact_id = $2 AND status = 'pendente' RETURNING *`,
      [id, contactId, s.userName],
    );
    if (!rows[0]) {
      const { rows: cur } = await client.query<{ status: CrmScheduledStatus }>(`SELECT status FROM crm_scheduled_messages WHERE id = $1 AND contact_id = $2`, [
        id,
        contactId,
      ]);
      if (!cur[0]) throw new CrmNotFoundError("Mensagem agendada não encontrada.");
      throw new CrmConflictError(
        cur[0].status === "cancelada"
          ? "Esta mensagem já foi cancelada."
          : cur[0].status === "falhou"
            ? "Esta mensagem não foi enviada (veja o motivo)."
            : "Esta mensagem já foi enviada.",
      );
    }
    await addEvent(client, contactId, "scheduled_message", { action: "canceled", id, sendAt: iso(rows[0].send_at) }, s);
    return toMessage(rows[0]);
  });
}

// ---------- sending ----------

/** A message "enviando" for longer than this was interrupted mid-send. */
const STUCK_MINUTES = 10;

class NotSent extends Error {}

async function finish(id: string, contactId: string, createdBy: string | null, ok: { waMessageId: string } | { error: string }, sendAt: Date): Promise<void> {
  await withTransaction(async (client) => {
    if ("waMessageId" in ok) {
      await client.query(
        `UPDATE crm_scheduled_messages SET status = 'enviada', wa_message_id = $2, sent_at = now(), error = NULL, updated_at = now() WHERE id = $1`,
        [id, ok.waMessageId],
      );
      await addEvent(client, contactId, "scheduled_message", { action: "sent", id, sendAt: sendAt.toISOString() }, null);
      return;
    }
    await client.query(`UPDATE crm_scheduled_messages SET status = 'falhou', error = $2, updated_at = now() WHERE id = $1`, [id, ok.error]);
    await addEvent(client, contactId, "scheduled_message", { action: "failed", id, sendAt: sendAt.toISOString(), error: ok.error }, null);
    if (createdBy) await notifyCreator(client, createdBy, contactId, ok.error);
  });
}

async function notifyCreator(q: Q, userId: string, contactId: string, error: string): Promise<void> {
  const { rows } = await q.query<{ name: string }>(`SELECT name FROM crm_contacts WHERE id = $1`, [contactId]);
  await q.query(
    `INSERT INTO crm_notifications (id, user_id, kind, title, body, contact_id)
     SELECT $1, id, 'mensagem', $2, $3, $4 FROM internal_users WHERE id = $5 AND revoked_at IS NULL`,
    [randomUUID(), `Mensagem agendada não enviada: ${rows[0]?.name ?? "contato"}`, error, contactId, userId],
  );
}

/** Every rule of a send, checked again at the time of sending; throws NotSent with the reason. */
async function sendOne(r: Row): Promise<string> {
  const db = await getDb();
  const { rows: u } = await db.query<{ name: string; role: StaffRole }>(`SELECT name, role FROM internal_users WHERE id = $1 AND revoked_at IS NULL`, [
    r.created_by,
  ]);
  const s = u[0] ? await crmSessionFor(r.created_by!, u[0].name, u[0].role) : null;
  if (!s) throw new NotSent(`${r.created_by_name ?? "Quem agendou"} não está mais ativo no CRM.`);
  if (!s.caps.sendWhatsApp) throw new NotSent(`${s.userName} não envia mais mensagens pelo WhatsApp.`);
  const { rows: c } = await db.query<{ owner_id: string | null; phone: string | null; opted_out_at: Date | null; last_inbound_at: Date | null }>(
    `SELECT owner_id, phone, opted_out_at, last_inbound_at FROM crm_contacts WHERE id = $1`,
    [r.contact_id],
  );
  const contact = c[0];
  if (!contact) throw new NotSent("O contato não existe mais.");
  if (!canAct(s, contact.owner_id)) throw new NotSent(`O lead passou para outra pessoa: ${s.userName} não pode mais falar com ele.`);
  if (!contact.phone) throw new NotSent("O contato não tem mais WhatsApp cadastrado.");
  if (contact.opted_out_at) throw new NotSent("O contato se descadastrou.");
  if (r.kind === "text" && serviceWindowRemainingMs(iso(contact.last_inbound_at)) === 0) {
    throw new NotSent("A janela de 24h estava fechada no horário: mensagem livre só pode ir com a janela aberta (agende um modelo aprovado).");
  }
  try {
    await claimForSending(s, r.contact_id, false);
  } catch (err) {
    if (err instanceof CrmConflictError) throw new NotSent(err.message.replace(" Para responder, assuma o atendimento.", ""));
    throw err;
  }
  const waMessageId =
    r.kind === "text"
      ? await sendText(contact.phone, r.body ?? "")
      : await sendTemplate(contact.phone, r.template_name ?? "", r.template_language ?? "", params(r.template_params));
  const values = params(r.template_params);
  // It went out: a failure to record it in the conversation must not mark it "não enviada".
  await recordOutbound(
    r.contact_id,
    r.kind === "text"
      ? { waMessageId, type: "text", body: r.body, templateName: null }
      : { waMessageId, type: "template", body: values.length ? values.join(" · ") : null, templateName: r.template_name },
    s,
  ).catch((err) => console.error("[crm-scheduled-messages] sent, but not recorded", err));
  return waMessageId;
}

function reason(err: unknown): string {
  if (err instanceof NotSent) return err.message;
  if (err instanceof WhatsAppConfigError) return "O WhatsApp não estava conectado ao CRM no horário.";
  if (err instanceof WhatsAppApiError) return `O WhatsApp recusou o envio: ${err.message}`;
  console.error("[crm-scheduled-messages] send failed", err);
  return "Erro inesperado ao enviar.";
}

export type DispatchResult = { sent: number; failed: number; interrupted: number };

/** Sends every message that is due (up to `limit` per run). Safe to run from many places at once. */
export async function dispatchDueMessages(limit = 25): Promise<DispatchResult> {
  const db = await getDb();
  // Interrupted mid-send: may have gone out, so never re-sent on its own.
  const { rows: stuck } = await db.query<Row>(
    `UPDATE crm_scheduled_messages SET status = 'falhou', error = $1, updated_at = now()
     WHERE status = 'enviando' AND claimed_at < now() - make_interval(mins => $2) RETURNING *`,
    ["O envio foi interrompido. Confira a conversa antes de agendar de novo.", STUCK_MINUTES],
  );
  for (const r of stuck) {
    await withTransaction(async (client) => {
      await addEvent(client, r.contact_id, "scheduled_message", { action: "failed", id: r.id, sendAt: iso(r.send_at), error: r.error }, null);
      if (r.created_by) await notifyCreator(client, r.created_by, r.contact_id, r.error ?? "");
    });
  }
  const { rows: due } = await db.query<Row>(
    `UPDATE crm_scheduled_messages SET status = 'enviando', claimed_at = now(), updated_at = now()
     WHERE id IN (SELECT id FROM crm_scheduled_messages WHERE status = 'pendente' AND send_at <= now() ORDER BY send_at LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`,
    [limit],
  );
  const result: DispatchResult = { sent: 0, failed: 0, interrupted: stuck.length };
  for (const r of due.sort((a, b) => a.send_at.getTime() - b.send_at.getTime())) {
    let outcome: { waMessageId: string } | { error: string };
    try {
      outcome = { waMessageId: await sendOne(r) };
    } catch (err) {
      outcome = { error: reason(err) };
    }
    await finish(r.id, r.contact_id, r.created_by, outcome, r.send_at);
    if ("waMessageId" in outcome) result.sent++;
    else result.failed++;
  }
  return result;
}

let lastOpportunisticRun = 0;
/**
 * Whether this server instance should run a due check now (from a route
 * people poll): at most once every 20 seconds per instance, so the bell of
 * every open CRM doesn't hit the database for it.
 */
export function dueCheckWanted(now = Date.now()): boolean {
  if (now - lastOpportunisticRun < 20_000) return false;
  lastOpportunisticRun = now;
  return true;
}
