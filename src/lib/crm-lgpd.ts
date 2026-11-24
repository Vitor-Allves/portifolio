// Server-only. LGPD (evolução v1.0, item 13): the rights of the titular of a
// lead / contact over their personal data, handled by an Administrador:
// - access: everything the CRM keeps about the contact, in one file;
// - anonymization at their request: the personal data goes away for good
//   (name, phone, e-mail, texts of messages, notes, documents, diagnoses,
//   scheduled messages, notices), the contact is archived and opted out, and
//   what is not personal stays so the numbers keep adding up (dates, stages,
//   values, who on the team did what). The evidence of a proposal's approval
//   (name, e-mail, document, IP) is kept: it records a contract's acceptance
//   (legal basis: execução de contrato / exercício regular de direitos).
// Both are audited; the audit never stores the personal data itself.

import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { writeAudit } from "./audit-log";
import { CrmConflictError, CrmInputError, CrmNotFoundError, addEvent, cleanText } from "./crm-core";
import { requireCap, type CrmSession } from "./crm-access";

const ANON_NAME = "Titular anonimizado";

/** Free-text keys of the history that may carry personal data. */
const EVENT_TEXT_KEYS = [
  "text",
  "note",
  "reason",
  "lostNote",
  "wonNote",
  "reopenReason",
  "need",
  "changes",
  "fileName",
  "name",
  "error",
  "comment",
  "email",
  "document",
];

async function rowsAsJson(q: Pick<PoolClient, "query">, sql: string, contactId: string): Promise<unknown[]> {
  const { rows } = await q.query<{ j: unknown[] | null }>(`SELECT COALESCE(jsonb_agg(x.j ORDER BY x.at), '[]'::jsonb) AS j FROM (${sql}) x`, [contactId]);
  return rows[0]?.j ?? [];
}

/** Everything the CRM keeps about a contact (files without their content), for the titular. */
export async function exportTitular(s: CrmSession, contactId: string): Promise<{ name: string; data: Record<string, unknown> }> {
  requireCap(s, "manageTeam");
  const db = await getDb();
  const { rows } = await db.query<{ c: Record<string, unknown> }>(
    `SELECT to_jsonb(c) - 'import_id' - 'attendant_id' || jsonb_build_object('company_name', co.name) AS c
     FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id WHERE c.id = $1`,
    [contactId],
  );
  if (!rows[0]) throw new CrmNotFoundError("Contato não encontrado.");
  const contact = rows[0].c;
  const [messages, history, deals, tasks, proposals, approvals, diagnoses, files, scheduled, campaigns, transfers] = await Promise.all([
    rowsAsJson(
      db,
      `SELECT jsonb_build_object('direction', direction, 'type', type, 'body', body, 'template', template_name, 'status', status, 'at', created_at) AS j, created_at AS at FROM crm_messages WHERE contact_id = $1`,
      contactId,
    ),
    rowsAsJson(
      db,
      `SELECT jsonb_build_object('kind', kind, 'payload', payload, 'by', user_name, 'at', created_at) AS j, created_at AS at FROM crm_events WHERE contact_id = $1`,
      contactId,
    ),
    rowsAsJson(db, `SELECT to_jsonb(d) - 'import_id' AS j, d.created_at AS at FROM crm_deals d WHERE d.contact_id = $1`, contactId),
    rowsAsJson(db, `SELECT to_jsonb(t) AS j, t.created_at AS at FROM crm_tasks t WHERE t.contact_id = $1`, contactId),
    rowsAsJson(
      db,
      `SELECT jsonb_build_object('number', p.number, 'title', p.title, 'status', p.status, 'totalCents', p.total_cents, 'sentAt', p.sent_at, 'decidedAt', p.decided_at) AS j, p.created_at AS at
       FROM crm_proposals p WHERE p.contact_id = $1`,
      contactId,
    ),
    rowsAsJson(
      db,
      `SELECT jsonb_build_object('proposal', p.number, 'decision', a.decision, 'name', a.name, 'email', a.email, 'document', a.document, 'comment', a.comment,
                                 'ip', a.ip, 'userAgent', a.user_agent, 'at', a.created_at) AS j, a.created_at AS at
       FROM crm_proposal_approvals a JOIN crm_proposals p ON p.id = a.proposal_id WHERE p.contact_id = $1`,
      contactId,
    ),
    rowsAsJson(
      db,
      `SELECT jsonb_build_object('version', version, 'data', data, 'by', created_by_name, 'at', created_at) AS j, created_at AS at FROM crm_diagnostics WHERE contact_id = $1`,
      contactId,
    ),
    rowsAsJson(db, `SELECT to_jsonb(f) - 'content' AS j, f.created_at AS at FROM crm_files f WHERE f.contact_id = $1`, contactId),
    rowsAsJson(
      db,
      `SELECT jsonb_build_object('kind', kind, 'body', body, 'template', template_name, 'sendAt', send_at, 'status', status) AS j, created_at AS at FROM crm_scheduled_messages WHERE contact_id = $1`,
      contactId,
    ),
    rowsAsJson(
      db,
      `SELECT jsonb_build_object('campaign', k.name, 'status', r.status, 'sentAt', r.sent_at) AS j, COALESCE(r.sent_at, k.created_at) AS at
       FROM crm_campaign_recipients r JOIN crm_campaigns k ON k.id = r.campaign_id WHERE r.contact_id = $1`,
      contactId,
    ),
    rowsAsJson(db, `SELECT to_jsonb(t) AS j, t.requested_at AS at FROM crm_transfer_requests t WHERE t.contact_id = $1`, contactId),
  ]);
  const name = String(contact.name ?? "contato");
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.lgpd_export",
    targetType: "crm_contact",
    targetId: contactId,
    targetLabel: contact.anonymized_at ? ANON_NAME : name,
    metadata: { messages: messages.length, history: history.length, files: files.length },
  });
  return {
    name,
    data: {
      geradoEm: new Date().toISOString(),
      observacao:
        "Dados pessoais mantidos pelo CRM da Legado Enterprise sobre este titular. Arquivos listados sem o conteúdo (podem ser enviados à parte). Mensagens de mídia ficam no WhatsApp; aqui, só o registro.",
      contato: contact,
      mensagens: messages,
      historico: history,
      oportunidades: deals,
      tarefas: tasks,
      propostas: proposals,
      aceitesDePropostas: approvals,
      diagnosticos: diagnoses,
      documentos: files,
      mensagensAgendadas: scheduled,
      campanhas: campaigns,
      transferencias: transfers,
    },
  };
}

/** Removes the contact's personal data for good, at the titular's request. Returns what was done. */
export async function anonymizeTitular(s: CrmSession, contactId: string, reasonRaw: unknown): Promise<Record<string, number>> {
  requireCap(s, "manageTeam");
  const reason = cleanText(reasonRaw, 500);
  if (!reason || reason.length < 5) throw new CrmInputError("Diga por que (ex.: pedido do titular por e-mail em 24/11).");
  const done = await withTransaction(async (client) => {
    const { rows } = await client.query<{ anonymized_at: Date | null }>(`SELECT anonymized_at FROM crm_contacts WHERE id = $1 FOR UPDATE`, [contactId]);
    if (!rows[0]) throw new CrmNotFoundError("Contato não encontrado.");
    if (rows[0].anonymized_at) throw new CrmConflictError("Este contato já foi anonimizado.");
    const count = async (sql: string, params: unknown[] = [contactId]) => (await client.query(sql, params)).rowCount ?? 0;
    await client.query(
      `UPDATE crm_contacts SET name = $2, phone = NULL, alt_phone = NULL, email = NULL, job_title = NULL, company = NULL, city = NULL, segment = NULL,
              referred_by = NULL, consent_source = NULL, next_action = NULL, next_action_at = NULL, ad_referral = NULL, last_message_preview = NULL,
              need = NULL, return_at = NULL, attendant_id = NULL, attendant_since = NULL, unread_count = 0,
              opted_out_at = COALESCE(opted_out_at, now()), archived_at = COALESCE(archived_at, now()), anonymized_at = now(), updated_at = now()
       WHERE id = $1`,
      [contactId, ANON_NAME],
    );
    const result = {
      messages: await count(`UPDATE crm_messages SET body = NULL, media_id = NULL, error = NULL WHERE contact_id = $1`),
      history: await count(`UPDATE crm_events SET payload = payload - $2::text[] WHERE contact_id = $1`, [contactId, EVENT_TEXT_KEYS]),
      opportunities: await count(`UPDATE crm_deals SET title = 'Oportunidade (dados removidos)', lost_note = NULL, won_note = NULL WHERE contact_id = $1`),
      tasks: await count(`UPDATE crm_tasks SET title = 'Tarefa (dados removidos)', description = NULL, result = NULL WHERE contact_id = $1`),
      documents: await count(`DELETE FROM crm_files WHERE contact_id = $1`),
      diagnoses: await count(`DELETE FROM crm_diagnostics WHERE contact_id = $1`),
      scheduledMessages: await count(`DELETE FROM crm_scheduled_messages WHERE contact_id = $1`),
      notices: await count(`DELETE FROM crm_notifications WHERE contact_id = $1`),
      transfers: await count(`UPDATE crm_transfer_requests SET reason = '(removido)', decision_note = NULL WHERE contact_id = $1`),
    };
    await addEvent(client, contactId, "lgpd", { action: "anonymized" }, s);
    return result;
  });
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.lgpd_anonymize",
    targetType: "crm_contact",
    targetId: contactId,
    targetLabel: ANON_NAME,
    metadata: { reason, ...done },
  });
  return done;
}
