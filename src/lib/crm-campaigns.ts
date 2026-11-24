// Server-only. Campanhas (Fase 5): one approved WhatsApp template sent to a
// filtered audience, from the browser in small batches ("enviar agora"; no
// scheduling yet).
//
// Safety rules, all enforced here and not only on the screen:
// - only contacts that accepted contact, haven't unsubscribed, aren't
//   archived and have a phone receive it — checked when the audience is
//   frozen AND again right before each message;
// - one row per (campaign, contact): nobody receives the same campaign twice;
// - each recipient is claimed with FOR UPDATE SKIP LOCKED, so two batches
//   running at once (two tabs, a double click) never send the same message;
// - a recipient left "enviando" by a function that died mid-send is marked
//   as failed for a person to check, never resent blindly.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { CrmInputError, CrmNotFoundError, cleanText, iso, type CrmActor } from "./crm-core";
import { contactWhere, recordOutbound } from "./crm";
import {
  SKIP_REASONS,
  cleanAudience,
  fillTemplate,
  isParamSource,
  resolveParams,
  type AudiencePreview,
  type CampaignAudience,
  type CampaignCounts,
  type CampaignDetail,
  type CampaignParam,
  type CampaignRecipient,
  type CampaignStatus,
  type CampaignSummary,
  type SkipReason,
  CAMPAIGN_REPLY_WINDOW,
} from "./crm-campaign-rules";
import { WhatsAppConfigError, isRateLimited, sendTemplate, WhatsAppApiError } from "./whatsapp";

/** A claimed recipient older than this was abandoned by a function that died mid-send. */
const STALE_CLAIM = "2 minutes";
/** Results windows. */
const REPLY_WINDOW = CAMPAIGN_REPLY_WINDOW;
const DEAL_WINDOW = "30 days";

/** Why a contact can't receive a campaign right now (null = it can). Same rule everywhere. */
const SKIP_SQL = `CASE
  WHEN c.archived_at IS NOT NULL THEN 'arquivado'
  WHEN c.opted_out_at IS NOT NULL THEN 'descadastrado'
  WHEN c.consent_status <> 'sim' THEN 'sem_consentimento'
  WHEN c.phone IS NULL OR c.phone = '' THEN 'sem_telefone'
END`;

function audienceFilters(a: CampaignAudience) {
  return contactWhere({ stage: a.stage, owner: a.owner, source: a.source, segment: a.segment, city: a.city, companyId: a.companyId, tag: a.tag });
}

// ---------- drafts ----------

export type CampaignInput = {
  name?: unknown;
  templateName?: unknown;
  templateLanguage?: unknown;
  templateBody?: unknown;
  params?: unknown;
  audience?: unknown;
};

function cleanParams(raw: unknown): CampaignParam[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((p) => {
    const src = (p as { source?: unknown })?.source;
    const text = cleanText((p as { text?: unknown })?.text, 200) ?? "";
    return { source: isParamSource(src) ? src : "text", text };
  });
}

function cleanInput(input: CampaignInput) {
  const name = cleanText(input.name, 120);
  if (!name) throw new CrmInputError("Dê um nome para a campanha.");
  return {
    name,
    templateName: cleanText(input.templateName, 200),
    templateLanguage: cleanText(input.templateLanguage, 20),
    templateBody: cleanText(input.templateBody, 2000),
    params: cleanParams(input.params),
    audience: cleanAudience(input.audience),
  };
}

export async function createCampaign(input: CampaignInput, actor: NonNullable<CrmActor>): Promise<string> {
  const c = cleanInput(input);
  const id = randomUUID();
  const db = await getDb();
  await db.query(
    `INSERT INTO crm_campaigns (id, name, template_name, template_language, template_body, params, audience, created_by, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, c.name, c.templateName, c.templateLanguage, c.templateBody, JSON.stringify(c.params), JSON.stringify(c.audience), actor.userId, actor.userName]
  );
  return id;
}

/** Only a draft can be edited: once sending starts, what was sent stays as it was. */
export async function updateCampaign(id: string, input: CampaignInput): Promise<void> {
  const c = cleanInput(input);
  const db = await getDb();
  const res = await db.query(
    `UPDATE crm_campaigns SET name = $2, template_name = $3, template_language = $4, template_body = $5, params = $6, audience = $7, updated_at = now()
     WHERE id = $1 AND status = 'rascunho'`,
    [id, c.name, c.templateName, c.templateLanguage, c.templateBody, JSON.stringify(c.params), JSON.stringify(c.audience)]
  );
  if (res.rowCount === 0) await assertDraft(id);
}

export async function deleteDraft(id: string): Promise<string> {
  const db = await getDb();
  const { rows } = await db.query<{ name: string }>(`DELETE FROM crm_campaigns WHERE id = $1 AND status = 'rascunho' RETURNING name`, [id]);
  if (!rows[0]) {
    await assertDraft(id);
  }
  return rows[0]?.name ?? "";
}

async function assertDraft(id: string): Promise<never> {
  const db = await getDb();
  const { rows } = await db.query<{ status: string }>(`SELECT status FROM crm_campaigns WHERE id = $1`, [id]);
  if (!rows[0]) throw new CrmNotFoundError("Campanha não encontrada.");
  throw new CrmInputError("Esta campanha já começou a ser enviada e não pode mais ser alterada.");
}

// ---------- audience ----------

/** How many the filters match, how many would receive it, why the others wouldn't, and a few filled-in samples. */
export async function previewAudience(audienceRaw: unknown, paramsRaw: unknown, templateBody: unknown): Promise<AudiencePreview> {
  const audience = cleanAudience(audienceRaw);
  const params = cleanParams(paramsRaw);
  const body = typeof templateBody === "string" ? templateBody : null;
  const { sql, values } = audienceFilters(audience);
  const db = await getDb();
  const [counts, sample] = await Promise.all([
    db.query<{ reason: string | null; n: string }>(
      `SELECT ${SKIP_SQL} AS reason, count(*) AS n FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id ${sql} GROUP BY 1`,
      values
    ),
    db.query<{ name: string; company: string | null; owner_name: string | null }>(
      `SELECT c.name, COALESCE(co.name, c.company) AS company, u.name AS owner_name
       FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id LEFT JOIN internal_users u ON u.id = c.owner_id
       ${sql} AND (${SKIP_SQL}) IS NULL ORDER BY lower(c.name), c.id LIMIT 3`,
      values
    ),
  ]);
  let matched = 0;
  let eligible = 0;
  const excluded: AudiencePreview["excluded"] = [];
  for (const r of counts.rows) {
    const n = Number(r.n);
    matched += n;
    if (!r.reason) eligible += n;
    else excluded.push({ reason: r.reason as SkipReason, label: SKIP_REASONS[r.reason as SkipReason] ?? r.reason, count: n });
  }
  excluded.sort((a, b) => b.count - a.count);
  return {
    matched,
    eligible,
    excluded,
    sample: sample.rows.map((s) => ({
      name: s.name,
      message: body ? fillTemplate(body, resolveParams(params, { name: s.name, company: s.company, ownerName: s.owner_name })) : null,
    })),
  };
}

// ---------- sending ----------

/**
 * Freezes the audience and starts sending. `approved` is Meta's current list
 * of approved templates (empty when the business account id isn't set — then
 * Meta itself rejects an unknown template on the first send).
 */
export async function startCampaign(
  id: string,
  actor: NonNullable<CrmActor>,
  approved: { name: string; language: string; bodyText: string | null; bodyParamCount: number }[]
): Promise<{ name: string; recipients: number; skipped: number }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      name: string;
      status: string;
      template_name: string | null;
      template_language: string | null;
      template_body: string | null;
      params: CampaignParam[];
      audience: CampaignAudience;
    }>(`SELECT name, status, template_name, template_language, template_body, params, audience FROM crm_campaigns WHERE id = $1 FOR UPDATE`, [id]);
    const k = rows[0];
    if (!k) throw new CrmNotFoundError("Campanha não encontrada.");
    if (k.status !== "rascunho") throw new CrmInputError("Esta campanha já foi disparada.");
    if (!k.template_name || !k.template_language) throw new CrmInputError("Escolha o modelo de mensagem antes de enviar.");

    let body = k.template_body;
    let paramCount = (body?.match(/\{\{\d+\}\}/g) ?? []).length;
    if (approved.length > 0) {
      const t = approved.find((a) => a.name === k.template_name && a.language === k.template_language);
      if (!t) throw new CrmInputError("Esse modelo não está mais aprovado pela Meta. Escolha outro.");
      body = t.bodyText;
      paramCount = t.bodyParamCount;
    }
    const params = k.params ?? [];
    if (params.length < paramCount) throw new CrmInputError("Preencha todos os campos do modelo.");
    // A name is never empty; a fixed text, a company or an owner needs its text (the fallback when the field is empty).
    const needsText = (p: CampaignParam) => p.source !== "first_name" && p.source !== "name";
    if (params.slice(0, paramCount).some((p) => needsText(p) && !p.text.trim())) {
      throw new CrmInputError("Preencha os textos dos campos do modelo (inclusive o texto para quando o dado faltar).");
    }

    const { sql, values } = audienceFilters(cleanAudience(k.audience));
    const n = values.length;
    const inserted = await client.query<{ status: string; n: string }>(
      `WITH ins AS (
         INSERT INTO crm_campaign_recipients (campaign_id, contact_id, status, skip_reason)
         SELECT $${n + 1}, c.id, CASE WHEN (${SKIP_SQL}) IS NULL THEN 'pendente' ELSE 'pulada' END, ${SKIP_SQL}
         FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id ${sql}
         ON CONFLICT DO NOTHING
         RETURNING status
       ) SELECT status, count(*) AS n FROM ins GROUP BY status`,
      [...values, id]
    );
    const count = (s: string) => Number(inserted.rows.find((r) => r.status === s)?.n ?? 0);
    const recipients = count("pendente");
    if (recipients === 0) throw new CrmInputError("Ninguém deste público pode receber a campanha (veja quem ficou de fora).");

    await client.query(
      `UPDATE crm_campaigns SET status = 'enviando', template_body = $2, params = $3, started_at = now(), started_by_name = $4, pause_reason = NULL, updated_at = now()
       WHERE id = $1`,
      [id, body, JSON.stringify(params.slice(0, paramCount)), actor.userName]
    );
    return { name: k.name, recipients, skipped: count("pulada") };
  });
}

async function setStatus(id: string, from: CampaignStatus[], to: CampaignStatus, extra = ""): Promise<string> {
  const db = await getDb();
  const { rows } = await db.query<{ name: string }>(
    `UPDATE crm_campaigns SET status = $3, updated_at = now()${extra} WHERE id = $1 AND status = ANY($2) RETURNING name`,
    [id, from, to]
  );
  if (!rows[0]) {
    const exists = await db.query(`SELECT 1 FROM crm_campaigns WHERE id = $1`, [id]);
    if (!exists.rows[0]) throw new CrmNotFoundError("Campanha não encontrada.");
    throw new CrmInputError("A campanha mudou de situação. Atualize a página.");
  }
  return rows[0].name;
}

export const pauseCampaign = (id: string) => setStatus(id, ["enviando"], "pausada");
export const resumeCampaign = (id: string) => setStatus(id, ["pausada"], "enviando", ", pause_reason = NULL");

/** Stops for good: who hadn't received it yet never will. */
export async function cancelCampaign(id: string): Promise<string> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ name: string }>(
      `UPDATE crm_campaigns SET status = 'cancelada', finished_at = now(), updated_at = now() WHERE id = $1 AND status IN ('enviando', 'pausada') RETURNING name`,
      [id]
    );
    if (!rows[0]) throw new CrmInputError("Só dá para cancelar uma campanha em envio ou pausada.");
    await client.query(`UPDATE crm_campaign_recipients SET status = 'pulada', skip_reason = 'cancelada' WHERE campaign_id = $1 AND status = 'pendente'`, [id]);
    return rows[0].name;
  });
}

type Claimed = { contact_id: string; name: string; phone: string | null; company: string | null; owner_name: string | null; reason: string | null };

async function claimOne(client: PoolClient, id: string): Promise<Claimed | null> {
  const { rows } = await client.query<{ contact_id: string }>(
    `UPDATE crm_campaign_recipients r SET status = 'enviando', claimed_at = now()
     FROM (
       SELECT contact_id FROM crm_campaign_recipients
       WHERE campaign_id = $1 AND status = 'pendente'
         AND EXISTS (SELECT 1 FROM crm_campaigns WHERE id = $1 AND status = 'enviando')
       ORDER BY contact_id LIMIT 1 FOR UPDATE SKIP LOCKED
     ) x
     WHERE r.campaign_id = $1 AND r.contact_id = x.contact_id
     RETURNING r.contact_id`,
    [id]
  );
  if (!rows[0]) return null;
  const c = await client.query<Claimed>(
    `SELECT c.id AS contact_id, c.name, c.phone, COALESCE(co.name, c.company) AS company, u.name AS owner_name, ${SKIP_SQL} AS reason
     FROM crm_contacts c LEFT JOIN crm_companies co ON co.id = c.company_id LEFT JOIN internal_users u ON u.id = c.owner_id
     WHERE c.id = $1`,
    [rows[0].contact_id]
  );
  return c.rows[0] ?? { contact_id: rows[0].contact_id, name: "", phone: null, company: null, owner_name: null, reason: "arquivado" };
}

export type BatchResult = { status: CampaignStatus; pauseReason: string | null; counts: CampaignCounts; sentNow: number };

/**
 * Sends to as many pending recipients as fit in `budgetMs`, one at a time,
 * so each request ends well before the function's time limit. The browser calls this again
 * until the campaign is done, paused or cancelled.
 */
export async function sendBatch(id: string, actor: NonNullable<CrmActor>, budgetMs = 5000): Promise<BatchResult> {
  const startedAt = Date.now();
  const db = await getDb();
  const { rows } = await db.query<{ status: string; template_name: string; template_language: string; template_body: string | null; params: CampaignParam[] }>(
    `SELECT status, template_name, template_language, template_body, params FROM crm_campaigns WHERE id = $1`,
    [id]
  );
  const k = rows[0];
  if (!k) throw new CrmNotFoundError("Campanha não encontrada.");

  // Abandoned mid-send: maybe it went out, maybe not — a person checks; never resent.
  await db.query(
    `UPDATE crm_campaign_recipients SET status = 'falhou', error = 'Envio interrompido. Confira na conversa se a mensagem chegou.'
     WHERE campaign_id = $1 AND status = 'enviando' AND claimed_at < now() - interval '${STALE_CLAIM}'`,
    [id]
  );

  let sentNow = 0;
  while (k.status === "enviando" && Date.now() - startedAt < budgetMs) {
    const target = await withTransaction((client) => claimOne(client, id));
    if (!target) break;

    // Re-checked at send time: whoever unsubscribed after the start is skipped.
    if (target.reason || !target.phone) {
      await db.query(`UPDATE crm_campaign_recipients SET status = 'pulada', skip_reason = $3 WHERE campaign_id = $1 AND contact_id = $2`, [
        id,
        target.contact_id,
        target.reason ?? "sem_telefone",
      ]);
      continue;
    }

    const values = resolveParams(k.params ?? [], { name: target.name, company: target.company, ownerName: target.owner_name });
    try {
      const waMessageId = await sendTemplate(target.phone, k.template_name, k.template_language, values);
      await db.query(
        `UPDATE crm_campaign_recipients SET status = 'enviada', wa_message_id = $3, sent_at = now(), error = NULL WHERE campaign_id = $1 AND contact_id = $2`,
        [id, target.contact_id, waMessageId]
      );
      await recordOutbound(
        target.contact_id,
        { waMessageId, type: "template", body: k.template_body ? fillTemplate(k.template_body, values) : values.join(" · ") || null, templateName: k.template_name, campaignId: id },
        actor
      );
      sentNow += 1;
    } catch (err) {
      if (err instanceof WhatsAppConfigError || isRateLimited(err)) {
        // Nothing went out for this one: put it back and stop here.
        await db.query(`UPDATE crm_campaign_recipients SET status = 'pendente', claimed_at = NULL WHERE campaign_id = $1 AND contact_id = $2`, [id, target.contact_id]);
        if (err instanceof WhatsAppConfigError) throw err;
        await db.query(`UPDATE crm_campaigns SET status = 'pausada', pause_reason = $2, updated_at = now() WHERE id = $1 AND status = 'enviando'`, [
          id,
          "A Meta limitou os envios deste número por enquanto. Espere algumas horas e clique em Continuar.",
        ]);
        break;
      }
      // "WhatsApp 400: Número sem WhatsApp" → "Número sem WhatsApp".
      const message = err instanceof WhatsAppApiError ? err.message.replace(/^WhatsApp \d+: /, "") : "Erro inesperado ao enviar.";
      if (!(err instanceof WhatsAppApiError)) console.error("[crm-campaigns] send", err);
      await db.query(`UPDATE crm_campaign_recipients SET status = 'falhou', error = $3 WHERE campaign_id = $1 AND contact_id = $2`, [id, target.contact_id, message.slice(0, 500)]);
    }
    const now = await db.query<{ status: string }>(`SELECT status FROM crm_campaigns WHERE id = $1`, [id]);
    k.status = now.rows[0]?.status ?? "cancelada";
  }

  // Done when nobody is pending or mid-send.
  await db.query(
    `UPDATE crm_campaigns SET status = 'concluida', finished_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'enviando'
       AND NOT EXISTS (SELECT 1 FROM crm_campaign_recipients WHERE campaign_id = $1 AND status IN ('pendente', 'enviando'))`,
    [id]
  );
  const summary = (await listCampaigns(id))[0];
  return { status: summary.status, pauseReason: summary.pauseReason, counts: summary.counts, sentNow };
}

// ---------- results ----------

type SummaryRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  template_name: string | null;
  template_language: string | null;
  template_body: string | null;
  params: CampaignParam[];
  audience: CampaignAudience;
  created_by_name: string | null;
  started_by_name: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  pause_reason: string | null;
  audience_n: string;
  skipped: string;
  pending: string;
  sent: string;
  failed: string;
  delivered: string;
  read: string;
  replied: string;
  opted_out: string;
  new_deals: string;
};

// One pass over the recipients; replies, unsubscribes and new opportunities
// count only what happened after that person received the campaign. WhatsApp
// timestamps are whole seconds, hence the date_trunc on replies.
const SUMMARY_SQL = `
  SELECT k.id, k.name, k.status, k.template_name, k.template_language, k.template_body, k.params, k.audience,
         k.created_by_name, k.started_by_name, k.created_at, k.started_at, k.finished_at, k.pause_reason,
         count(r.contact_id) AS audience_n,
         count(*) FILTER (WHERE r.status = 'pulada') AS skipped,
         count(*) FILTER (WHERE r.status IN ('pendente', 'enviando')) AS pending,
         count(*) FILTER (WHERE r.status = 'enviada' AND COALESCE(m.status, 'sent') <> 'failed') AS sent,
         count(*) FILTER (WHERE r.status = 'falhou' OR m.status = 'failed') AS failed,
         count(*) FILTER (WHERE m.status IN ('delivered', 'read')) AS delivered,
         count(*) FILTER (WHERE m.status = 'read') AS read,
         count(*) FILTER (WHERE r.sent_at IS NOT NULL AND EXISTS (
           SELECT 1 FROM crm_messages i WHERE i.contact_id = r.contact_id AND i.direction = 'in'
             AND i.created_at >= date_trunc('second', r.sent_at) AND i.created_at <= r.sent_at + interval '${REPLY_WINDOW}')) AS replied,
         count(*) FILTER (WHERE r.sent_at IS NOT NULL AND c.opted_out_at >= r.sent_at) AS opted_out,
         count(*) FILTER (WHERE r.sent_at IS NOT NULL AND EXISTS (
           SELECT 1 FROM crm_deals d WHERE d.contact_id = r.contact_id
             AND d.created_at > r.sent_at AND d.created_at <= r.sent_at + interval '${DEAL_WINDOW}')) AS new_deals
  FROM crm_campaigns k
  LEFT JOIN crm_campaign_recipients r ON r.campaign_id = k.id
  LEFT JOIN crm_contacts c ON c.id = r.contact_id
  LEFT JOIN crm_messages m ON m.wa_message_id = r.wa_message_id`;

function mapSummary(r: SummaryRow): CampaignSummary {
  const n = (v: string) => Number(v);
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    templateName: r.template_name,
    createdByName: r.created_by_name,
    startedByName: r.started_by_name,
    createdAt: iso(r.created_at)!,
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
    pauseReason: r.pause_reason,
    counts: {
      audience: n(r.audience_n),
      skipped: n(r.skipped),
      pending: n(r.pending),
      sent: n(r.sent),
      failed: n(r.failed),
      delivered: n(r.delivered),
      read: n(r.read),
      replied: n(r.replied),
      optedOut: n(r.opted_out),
      newDeals: n(r.new_deals),
    },
  };
}

export async function listCampaigns(onlyId?: string): Promise<CampaignSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<SummaryRow>(
    `${SUMMARY_SQL} ${onlyId ? "WHERE k.id = $1" : ""} GROUP BY k.id ORDER BY COALESCE(k.started_at, k.created_at) DESC LIMIT 200`,
    onlyId ? [onlyId] : []
  );
  return rows.map(mapSummary);
}

export async function getCampaign(id: string): Promise<CampaignDetail> {
  const db = await getDb();
  const [summary, recipients] = await Promise.all([
    db.query<SummaryRow>(`${SUMMARY_SQL} WHERE k.id = $1 GROUP BY k.id`, [id]),
    db.query<{
      contact_id: string;
      name: string;
      phone: string | null;
      status: CampaignRecipient["status"];
      skip_reason: string | null;
      error: string | null;
      message_status: string | null;
      message_error: string | null;
      sent_at: Date | null;
      replied: boolean;
    }>(
      `SELECT r.contact_id, c.name, c.phone, r.status, r.skip_reason, r.error, m.status AS message_status, m.error AS message_error, r.sent_at,
              (r.sent_at IS NOT NULL AND EXISTS (
                SELECT 1 FROM crm_messages i WHERE i.contact_id = r.contact_id AND i.direction = 'in'
                  AND i.created_at >= date_trunc('second', r.sent_at) AND i.created_at <= r.sent_at + interval '${REPLY_WINDOW}')) AS replied
       FROM crm_campaign_recipients r JOIN crm_contacts c ON c.id = r.contact_id
       LEFT JOIN crm_messages m ON m.wa_message_id = r.wa_message_id
       WHERE r.campaign_id = $1
       ORDER BY CASE r.status WHEN 'falhou' THEN 0 WHEN 'enviando' THEN 1 WHEN 'pendente' THEN 2 WHEN 'enviada' THEN 3 ELSE 4 END, lower(c.name)
       LIMIT 1000`,
      [id]
    ),
  ]);
  const row = summary.rows[0];
  if (!row) throw new CrmNotFoundError("Campanha não encontrada.");
  return {
    ...mapSummary(row),
    templateLanguage: row.template_language,
    templateBody: row.template_body,
    params: row.params ?? [],
    audience: cleanAudience(row.audience),
    recipients: recipients.rows.map((r) => ({
      contactId: r.contact_id,
      name: r.name,
      phone: r.phone,
      status: r.message_status === "failed" ? "falhou" : r.status,
      messageStatus: r.message_status,
      detail:
        r.status === "pulada"
          ? SKIP_REASONS[r.skip_reason as SkipReason] ?? r.skip_reason
          : r.error ?? r.message_error ?? null,
      sentAt: iso(r.sent_at),
      replied: r.replied,
    })),
  };
}
