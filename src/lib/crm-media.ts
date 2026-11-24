// Server-only. Indicadores de mídia do Legado Intelligence nos clientes
// ativos (Fase 7, entrega 1, especificação v1.0, módulo 17).
//
// The CRM and the Intelligence are the same app, database and login: an
// Intelligence client is a `client_access` row (a label plus the Meta ad
// accounts it covers). An active client is linked to one of them, and
// "Sincronizar" reads the month's numbers from the Meta Marketing API exactly
// the way the Intelligence does (getDashboardData + the same totals math),
// then stores them as a new crm_media_syncs row — never overwriting, so
// every update stays in the history with its period, source, campaigns,
// date and who asked. The Intelligence remains the official source.
//
// Nobody sees more than the Intelligence would show them: the person's
// Intelligence ad accounts must cover the client's accounts to link, sync
// or read the numbers; and money (investimento, CPC, CPM, custo por
// conversa) follows "ver valores".

import { randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import { writeAudit } from "./audit-log";
import { CrmConflictError, CrmForbiddenError, CrmInputError, CrmNotFoundError, iso } from "./crm-core";
import { requireCap, visibleTo, type CrmSession } from "./crm-access";
import { getDashboardData } from "./meta-ads";
import { costPerConversation, cpc, cpm, ctr, sumTotals } from "./metrics";
import { shiftDay } from "./crm-dashboard";
import { isMonth, type CrmClientMedia, type CrmIntelligenceClient, type CrmMediaCampaign, type CrmMediaSync, type CrmMediaTotals } from "./crm-types";

export const MEDIA_SOURCE = "meta_ads";
const SOURCE_LABEL: Record<string, string> = { meta_ads: "Meta Ads (Legado Intelligence)" };
/** A second sync of the same client and month within this window answers with the one just made (the Intelligence itself reuses Meta's answer for 15 min). */
const SYNC_COOLDOWN_SECONDS = 60;

const todayBr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Whether the person's Intelligence access covers every one of these ad accounts. */
function covers(s: Pick<CrmSession, "intelligenceAccountIds">, accountIds: string[]): boolean {
  const allowed = s.intelligenceAccountIds;
  if (allowed === null) return true;
  if (!allowed || accountIds.length === 0) return false;
  const set = new Set(allowed);
  return accountIds.every((a) => set.has(a));
}
const NOT_COVERED = "Seu acesso no Legado Intelligence não inclui as contas de anúncio deste cliente.";

type ClientRow = { id: string; owner_id: string | null; company_name: string; client_access_id: string | null; label: string | null; account_ids: string[] | null; revoked_at: Date | null };

async function loadClient(s: CrmSession, clientId: string): Promise<ClientRow> {
  requireCap(s, "viewClients");
  const db = await getDb();
  const { rows } = await db.query<ClientRow>(
    `SELECT cl.id, cl.owner_id, co.name AS company_name, cl.client_access_id, ca.label, ca.account_ids, ca.revoked_at
     FROM crm_clients cl JOIN crm_companies co ON co.id = cl.company_id
     LEFT JOIN client_access ca ON ca.id = cl.client_access_id
     WHERE cl.id = $1`,
    [clientId]
  );
  const r = rows[0];
  const visible = visibleTo(s);
  if (!r || !(visible === null || r.owner_id === null || r.owner_id === visible)) throw new CrmNotFoundError("Cliente não encontrado.");
  return r;
}

type SyncRow = {
  id: string;
  month: string;
  period_from: string;
  period_to: string;
  source: string;
  client_access_label: string;
  account_ids: string[];
  missing_accounts: string[];
  totals: CrmMediaTotals;
  campaigns: CrmMediaCampaign[];
  synced_at: Date;
  synced_by_name: string | null;
};
const SYNC_SELECT = `SELECT id, to_char(month, 'YYYY-MM') AS month, period_from::text AS period_from, period_to::text AS period_to, source, client_access_label,
  account_ids, missing_accounts, totals, campaigns, synced_at, synced_by_name FROM crm_media_syncs`;

/** Money only for who sees values. */
function mapSync(r: SyncRow, money: boolean): CrmMediaSync {
  const t = r.totals;
  return {
    id: r.id,
    month: r.month,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    source: SOURCE_LABEL[r.source] ?? r.source,
    intelligenceClient: r.client_access_label,
    accountIds: r.account_ids,
    missingAccounts: r.missing_accounts,
    totals: money ? t : { ...t, spend: null, cpc: null, cpm: null, costPerConversation: null },
    campaigns: (r.campaigns ?? []).map((c) => (money ? c : { ...c, spend: null })),
    syncedAt: iso(r.synced_at)!,
    syncedByName: r.synced_by_name,
  };
}

/** The client's link to the Intelligence and the month's numbers (latest sync + history). */
export async function getClientMedia(s: CrmSession, clientId: string, month: string): Promise<CrmClientMedia> {
  if (!isMonth(month)) throw new CrmInputError("Mês inválido.");
  const c = await loadClient(s, clientId);
  const db = await getDb();
  const { rows } = await db.query<SyncRow>(`${SYNC_SELECT} WHERE client_id = $1 AND month = $2 ORDER BY synced_at DESC LIMIT 50`, [clientId, `${month}-01`]);
  const linkAccounts = c.account_ids ?? [];
  const linked = c.client_access_id !== null && c.revoked_at === null;
  // The numbers already synced are shown to whoever the Intelligence would show them to.
  const readable = rows.filter((r) => covers(s, r.account_ids));
  const blocked = (linked && !covers(s, linkAccounts)) || readable.length < rows.length ? NOT_COVERED : null;
  const money = s.caps.seeContractValues;
  return {
    month,
    link: linked ? { clientAccessId: c.client_access_id!, label: c.label ?? "", accountCount: linkAccounts.length } : null,
    canLink: s.caps.linkIntelligence,
    canSync: s.caps.editClients && linked && covers(s, linkAccounts) && month <= todayBr().slice(0, 7),
    blocked,
    latest: readable[0] ? mapSync(readable[0], money) : null,
    history: readable.map((r) => ({
      id: r.id,
      syncedAt: iso(r.synced_at)!,
      syncedByName: r.synced_by_name,
      periodTo: r.period_to,
      partial: r.missing_accounts.length > 0,
    })),
  };
}

/** Intelligence clients this person may link (within their Intelligence access), and the active client each is already linked to. */
export async function listIntelligenceClients(s: CrmSession): Promise<CrmIntelligenceClient[]> {
  requireCap(s, "linkIntelligence");
  const db = await getDb();
  const { rows } = await db.query<{ id: string; label: string; account_ids: string[]; client_id: string | null; company_name: string | null }>(
    `SELECT ca.id, ca.label, ca.account_ids, cl.id AS client_id, co.name AS company_name
     FROM client_access ca
     LEFT JOIN crm_clients cl ON cl.client_access_id = ca.id
     LEFT JOIN crm_companies co ON co.id = cl.company_id
     WHERE ca.revoked_at IS NULL
     ORDER BY lower(ca.label)`
  );
  return rows
    .filter((r) => covers(s, r.account_ids))
    .map((r) => ({ id: r.id, label: r.label, accountCount: r.account_ids.length, linkedClientId: r.client_id, linkedClientName: r.company_name }));
}

/** Links the active client to an Intelligence client (null = undo the link). Administrador and Gestor; audited and in the client's history. */
export async function linkIntelligence(s: CrmSession, clientId: string, clientAccessId: unknown): Promise<CrmClientMedia> {
  requireCap(s, "linkIntelligence");
  const c = await loadClient(s, clientId);
  const target = clientAccessId === null || clientAccessId === "" ? null : clientAccessId;
  if (target !== null && typeof target !== "string") throw new CrmInputError("Cliente do Intelligence inválido.");
  const db = await getDb();
  let label: string | null = null;
  if (target) {
    const { rows } = await db.query<{ label: string; account_ids: string[]; revoked_at: Date | null; client_id: string | null; company_name: string | null }>(
      `SELECT ca.label, ca.account_ids, ca.revoked_at, cl.id AS client_id, co.name AS company_name
       FROM client_access ca LEFT JOIN crm_clients cl ON cl.client_access_id = ca.id LEFT JOIN crm_companies co ON co.id = cl.company_id
       WHERE ca.id = $1`,
      [target]
    );
    const ca = rows[0];
    if (!ca || ca.revoked_at) throw new CrmInputError("Cliente do Intelligence não encontrado.");
    if (!covers(s, ca.account_ids)) throw new CrmForbiddenError(NOT_COVERED);
    if (ca.client_id && ca.client_id !== clientId) throw new CrmConflictError(`Esse cliente do Intelligence já está ligado a ${ca.company_name ?? "outro cliente ativo"}.`);
    label = ca.label;
  }
  if ((c.client_access_id ?? null) === target) return getClientMedia(s, clientId, todayBr().slice(0, 7));
  const from = c.client_access_id ? c.label : null;
  await withTransaction(async (q) => {
    await q.query(`UPDATE crm_clients SET client_access_id = $2, updated_at = now() WHERE id = $1`, [clientId, target]);
    await q.query(`INSERT INTO crm_client_events (id, client_id, kind, payload, user_id, user_name) VALUES ($1, $2, 'intelligence', $3, $4, $5)`, [
      randomUUID(),
      clientId,
      JSON.stringify({ from, to: label }),
      s.userId,
      s.userName,
    ]);
  }).catch((err: { code?: string }) => {
    if (err?.code === "23505") throw new CrmConflictError("Esse cliente do Intelligence acabou de ser ligado a outro cliente ativo.");
    throw err;
  });
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.intelligence_link",
    targetType: "crm_client",
    targetId: clientId,
    targetLabel: c.company_name,
    metadata: { client: c.company_name, from, to: label },
  });
  return getClientMedia(s, clientId, todayBr().slice(0, 7));
}

/**
 * Reads the month's numbers from Meta for the linked Intelligence client and
 * stores them as a new sync. Who may edit the client and whose Intelligence
 * access covers its accounts; only a month that has started (the current one
 * up to today).
 */
export async function syncClientMedia(s: CrmSession, clientId: string, month: unknown): Promise<CrmClientMedia> {
  requireCap(s, "editClients");
  if (!isMonth(month)) throw new CrmInputError("Mês inválido.");
  const today = todayBr();
  if (month > today.slice(0, 7)) throw new CrmInputError("Esse mês ainda não começou.");
  const c = await loadClient(s, clientId);
  if (!c.client_access_id || c.revoked_at) throw new CrmInputError("Ligue o cliente a um cliente do Legado Intelligence antes de sincronizar.");
  const accountIds = c.account_ids ?? [];
  if (accountIds.length === 0) throw new CrmInputError("Esse cliente do Intelligence não tem contas de anúncio.");
  if (!covers(s, accountIds)) throw new CrmForbiddenError(NOT_COVERED);
  const db = await getDb();
  const recent = await db.query(
    `SELECT 1 FROM crm_media_syncs WHERE client_id = $1 AND month = $2 AND synced_at > now() - make_interval(secs => ${SYNC_COOLDOWN_SECONDS})`,
    [clientId, `${month}-01`]
  );
  if (recent.rows.length > 0) return getClientMedia(s, clientId, month);

  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = shiftDay(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
  const to = last < today ? last : today;
  const data = await getDashboardData({ kind: "custom", range: { since: from, until: to } }, accountIds);
  const read = new Set(data.accounts.map((a) => a.id));
  const failed = new Set(data.partialAccounts.map((a) => a.id));
  const missing = accountIds.filter((a) => !read.has(a) || failed.has(a));
  if (missing.length === accountIds.length) {
    throw new CrmInputError("Nenhuma conta de anúncio deste cliente pôde ser lida no Meta agora. Confira o acesso no Intelligence e tente de novo.");
  }
  const scope = new Set(accountIds);
  const campaigns = data.campaigns.filter((x) => scope.has(x.accountId));
  const sum = sumTotals(campaigns);
  const reach = data.accountReach.filter((r) => scope.has(r.accountId)).reduce((acc, r) => acc + r.reach, 0);
  const totals: CrmMediaTotals = {
    spend: sum.spend,
    impressions: sum.impressions,
    reach,
    clicks: sum.clicks,
    linkClicks: sum.linkClicks,
    conversations: sum.conversations,
    ctr: ctr(sum),
    cpc: cpc(sum),
    cpm: cpm(sum),
    costPerConversation: costPerConversation(sum),
  };
  const rows: CrmMediaCampaign[] = campaigns
    .map((x) => ({
      id: x.campaignId,
      name: x.campaignName,
      accountName: x.accountName,
      objective: x.objective,
      status: x.status,
      spend: x.spend,
      impressions: x.impressions,
      clicks: x.clicks,
      conversations: x.conversations,
    }))
    .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0));
  await db.query(
    `INSERT INTO crm_media_syncs (id, client_id, client_access_id, client_access_label, month, period_from, period_to, source, account_ids, missing_accounts, totals, campaigns, synced_by, synced_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [randomUUID(), clientId, c.client_access_id, c.label ?? "", from, from, to, MEDIA_SOURCE, accountIds, missing, JSON.stringify(totals), JSON.stringify(rows), s.userId, s.userName]
  );
  return getClientMedia(s, clientId, month);
}
