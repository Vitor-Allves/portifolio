import { NextRequest, NextResponse } from "next/server";
import { MetaApiError } from "@/lib/meta-ads";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { sanitizeReportFilters } from "@/lib/report-templates-types";
import { resolveRecipient, isRecipientError, buildAllowedColumns, applyHiddenFilters, fetchFilteredReportData } from "@/lib/report-data";
import { objectiveLabel, statusLabel, ctaLabel, qualityRankingLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation, roas, sumTotals, type Totals } from "@/lib/metrics";
import { rowsToCsv } from "@/lib/csv";
import type { AdInsight, AdSetInsight, CampaignInsight } from "@/lib/meta-ads-types";
import type { AllowedColumns } from "@/lib/pdf-report-core";
import { isActionAllowed, type CampaignColumnId } from "@/lib/client-permissions";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Same permission model as /api/analise/reports/pdf: the dataset is fetched
// and filtered server-side, and every column below is included or skipped
// based on allowedColumns (resolved from the SAME session/recipient
// permissions the PDF route uses, via report-data.ts) — never a client-
// supplied column list. The response is the finished CSV text; the
// underlying JSON dataset never round-trips through the browser.
// ---------------------------------------------------------------------------

type RequestBody = {
  kind?: unknown;
  filters?: unknown;
  recipientClientId?: unknown;
};

function isAllowed(allowed: AllowedColumns, id: CampaignColumnId): boolean {
  return allowed.has(id);
}

function metricCell(id: CampaignColumnId, totals: Totals): string | null {
  switch (id) {
    case "spend":
      return formatCurrencyBRL(totals.spend);
    case "impressions":
      return formatInteger(totals.impressions);
    case "clicks":
      return formatInteger(totals.clicks);
    case "linkClicks":
      return formatInteger(totals.linkClicks);
    case "conversations":
      return totals.conversations === null ? "Não disponível" : formatInteger(totals.conversations);
    case "costPerConversation": {
      const v = costPerConversation(totals);
      return v === null ? "—" : formatCurrencyBRL(v);
    }
    case "ctr": {
      const v = ctr(totals);
      return v === null ? "—" : formatPercent(v);
    }
    case "cpc": {
      const v = cpc(totals);
      return v === null ? "—" : formatCurrencyBRL(v);
    }
    case "cpm": {
      const v = cpm(totals);
      return v === null ? "—" : formatCurrencyBRL(v);
    }
    case "reach":
      return formatInteger(totals.reach);
    case "purchases":
      return totals.purchases === null ? "Não disponível" : formatInteger(totals.purchases);
    case "purchaseValue":
      return totals.purchaseValue === null ? "Não disponível" : formatCurrencyBRL(totals.purchaseValue);
    case "roas": {
      const v = roas(totals);
      return v === null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
    }
    case "leads":
      return totals.leads === null ? "Não disponível" : formatInteger(totals.leads);
    case "addToCart":
      return totals.addToCart === null ? "Não disponível" : formatInteger(totals.addToCart);
    case "completeRegistrations":
      return totals.completeRegistrations === null ? "Não disponível" : formatInteger(totals.completeRegistrations);
    case "postEngagement":
      return totals.postEngagement === null ? "Não disponível" : formatInteger(totals.postEngagement);
    case "videoViews":
      return totals.videoViews === null ? "Não disponível" : formatInteger(totals.videoViews);
    case "videoCompletions":
      return totals.videoCompletions === null ? "Não disponível" : formatInteger(totals.videoCompletions);
    case "outboundClicks":
      return totals.outboundClicks === null ? "Não disponível" : formatInteger(totals.outboundClicks);
    case "uniqueClicks":
      return totals.uniqueClicks === null ? "Não disponível" : formatInteger(totals.uniqueClicks);
    case "estimatedAdRecallers":
      return totals.estimatedAdRecallers === null ? "Não disponível" : formatInteger(totals.estimatedAdRecallers);
    default:
      return null;
  }
}

const METRIC_COLUMN_LABELS: Partial<Record<CampaignColumnId, string>> = {
  spend: "Investimento",
  impressions: "Impressões",
  clicks: "Cliques (todos)",
  linkClicks: "Cliques no link",
  conversations: "Conversa iniciada",
  costPerConversation: "Custo por conversa iniciada",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  purchases: "Compras (Pixel/CAPI)",
  purchaseValue: "Valor de compra (Pixel/CAPI)",
  roas: "ROAS (Pixel/CAPI)",
  leads: "Leads (Pixel/CAPI)",
  addToCart: "Adicionar ao carrinho (Pixel/CAPI)",
  completeRegistrations: "Cadastro completo (Pixel/CAPI)",
  postEngagement: "Engajamento com a publicação",
  videoViews: "Visualizações de vídeo",
  videoCompletions: "Vídeo assistido até o fim",
  outboundClicks: "Cliques para fora da plataforma",
  uniqueClicks: "Cliques únicos",
  estimatedAdRecallers: "Pessoas que lembrarão do anúncio",
};
// Row-level campaign export includes reach per-row (each campaign's own,
// individually-scoped number). The account-summary export deliberately
// omits reach entirely — see buildAccountSummaryCsv for why.
const EXTRA_CONVERSION_IDS: CampaignColumnId[] = ["purchases", "purchaseValue", "roas", "leads", "addToCart", "completeRegistrations"];
// videoAvgWatchTimeSeconds and estimatedAdRecallRate are deliberately
// excluded here — see Totals in metrics.ts: both are an average/percentage,
// never safe to sum into a "resumo por conta" total, and this CSV
// architecture has no per-row-only column path that bypasses Totals.
const EXTRA_ENGAGEMENT_IDS: CampaignColumnId[] = ["postEngagement", "videoViews", "videoCompletions", "outboundClicks", "uniqueClicks", "estimatedAdRecallers"];
const CAMPAIGN_METRIC_IDS: CampaignColumnId[] = ["spend", "impressions", "clicks", "linkClicks", "conversations", "costPerConversation", "ctr", "cpc", "cpm", "reach", ...EXTRA_CONVERSION_IDS, ...EXTRA_ENGAGEMENT_IDS];
const ACCOUNT_SUMMARY_METRIC_IDS: CampaignColumnId[] = ["spend", "impressions", "clicks", "linkClicks", "conversations", "costPerConversation", "ctr", "cpc", "cpm", ...EXTRA_CONVERSION_IDS, ...EXTRA_ENGAGEMENT_IDS];

// Ids whose Totals field is null purely when the account/objective never
// reports that feature at all (Pixel/CAPI not configured, non-messaging
// objective, ...) — as opposed to costPerConversation/ctr/cpc/cpm/roas,
// which can just as legitimately be null from a real zero denominator for
// this specific filter/period. Only these are eligible to have their whole
// column dropped when every row is empty; a derived ratio always keeps its
// column, showing "—" per row like everywhere else in the app.
const STRUCTURAL_NULLABLE_IDS: CampaignColumnId[] = [
  "conversations",
  "purchases",
  "purchaseValue",
  "leads",
  "addToCart",
  "completeRegistrations",
  "postEngagement",
  "videoViews",
  "videoCompletions",
  "outboundClicks",
  "uniqueClicks",
  "estimatedAdRecallers",
];

function structuralRawValue(id: CampaignColumnId, totals: Totals): number | null | undefined {
  switch (id) {
    case "conversations":
      return totals.conversations;
    case "purchases":
      return totals.purchases;
    case "purchaseValue":
      return totals.purchaseValue;
    case "leads":
      return totals.leads;
    case "addToCart":
      return totals.addToCart;
    case "completeRegistrations":
      return totals.completeRegistrations;
    case "postEngagement":
      return totals.postEngagement;
    case "videoViews":
      return totals.videoViews;
    case "videoCompletions":
      return totals.videoCompletions;
    case "outboundClicks":
      return totals.outboundClicks;
    case "uniqueClicks":
      return totals.uniqueClicks;
    case "estimatedAdRecallers":
      return totals.estimatedAdRecallers;
    default:
      return undefined;
  }
}

/** A structurally-nullable column is dropped from the export entirely when every row has nothing to report for it — never left in as a column of "Não disponível" cells. Every other column (core metrics, derived ratios) is always kept. */
function isColumnPopulated(id: CampaignColumnId, rows: Totals[]): boolean {
  if (!STRUCTURAL_NULLABLE_IDS.includes(id)) return true;
  return rows.some((r) => structuralRawValue(id, r) !== null);
}

function buildCampaignsCsv(campaigns: CampaignInsight[], allowed: AllowedColumns): string {
  const header = ["Campanha"];
  if (isAllowed(allowed, "account")) header.push("Conta");
  if (isAllowed(allowed, "objective")) header.push("Objetivo");
  if (isAllowed(allowed, "status")) header.push("Status");
  const metricIds = CAMPAIGN_METRIC_IDS.filter((id) => isAllowed(allowed, id) && isColumnPopulated(id, campaigns));
  for (const id of metricIds) header.push(id === "reach" ? "Alcance (campanha, não some entre linhas)" : (METRIC_COLUMN_LABELS[id] ?? id));

  const rows = campaigns.map((c) => {
    const row = [c.campaignName];
    if (isAllowed(allowed, "account")) row.push(c.accountName);
    if (isAllowed(allowed, "objective")) row.push(objectiveLabel(c.objective));
    if (isAllowed(allowed, "status")) row.push(statusLabel(c.status));
    for (const id of metricIds) row.push(metricCell(id, c) ?? "—");
    return row;
  });

  return rowsToCsv([header, ...rows]);
}

function buildAccountSummaryCsv(campaigns: CampaignInsight[], allowed: AllowedColumns): string {
  const byAccount = new Map<string, { name: string; campaigns: CampaignInsight[] }>();
  for (const c of campaigns) {
    const entry = byAccount.get(c.accountId) ?? { name: c.accountName, campaigns: [] };
    entry.campaigns.push(c);
    byAccount.set(c.accountId, entry);
  }

  const header = ["Conta", "Campanhas"];
  const metricIds = ACCOUNT_SUMMARY_METRIC_IDS.filter((id) => isAllowed(allowed, id) && isColumnPopulated(id, campaigns));
  for (const id of metricIds) header.push(METRIC_COLUMN_LABELS[id] ?? id);

  const rows = [...byAccount.values()].map((entry) => {
    const totals = sumTotals(entry.campaigns);
    const row = [entry.name, String(entry.campaigns.length)];
    for (const id of metricIds) row.push(metricCell(id, totals) ?? "—");
    return row;
  });

  return rowsToCsv([header, ...rows]);
}

// Ad-level quality/engagement/conversion rankings and creative fields
// (thumbnail, title, body, CTA) aren't part of CampaignColumnId at all —
// same as the live dashboard's own ad cards, they're visible to anyone who
// can reach the campaigns data, with no separate granular toggle. Only the
// underlying performance metrics (spend/impressions/clicks/reach/
// conversations) go through the usual allowedColumns gate.
const AD_METRIC_IDS: CampaignColumnId[] = ["spend", "impressions", "clicks", "linkClicks", "reach", "conversations"];

function buildAdsCsv(ads: AdInsight[], campaigns: CampaignInsight[], adSets: AdSetInsight[], allowed: AllowedColumns): string {
  const campaignNameById = new Map(campaigns.map((c) => [c.campaignId, c.campaignName]));
  const adSetNameById = new Map(adSets.map((a) => [a.adSetId, a.adSetName]));

  const header = ["Campanha", "Conjunto", "Anúncio"];
  if (isAllowed(allowed, "status")) header.push("Status");
  const metricIds = AD_METRIC_IDS.filter((id) => isAllowed(allowed, id));
  for (const id of metricIds) header.push(METRIC_COLUMN_LABELS[id] ?? id);
  header.push(
    "Ranking de qualidade",
    "Ranking de engajamento",
    "Ranking de conversão",
    "Título do criativo",
    "Corpo do criativo",
    "Chamada para ação (CTA)",
    "URL da miniatura"
  );

  const rows = ads.map((ad) => {
    const row = [campaignNameById.get(ad.campaignId) ?? "—", adSetNameById.get(ad.adSetId) ?? "—", ad.adName];
    if (isAllowed(allowed, "status")) row.push(statusLabel(ad.status));
    for (const id of metricIds) row.push(metricCell(id, ad) ?? "—");
    row.push(
      ad.qualityRanking ? qualityRankingLabel(ad.qualityRanking) : "—",
      ad.engagementRateRanking ? qualityRankingLabel(ad.engagementRateRanking) : "—",
      ad.conversionRateRanking ? qualityRankingLabel(ad.conversionRateRanking) : "—",
      ad.creativeTitle ?? "—",
      ad.creativeBody ?? "—",
      ad.callToAction ? ctaLabel(ad.callToAction) : "—",
      ad.thumbnailUrl ?? "—"
    );
    return row;
  });

  return rowsToCsv([header, ...rows]);
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "relatorio"
  );
}

export async function POST(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) {
    return NextResponse.json({ error: "Sessão inválida ou expirada. Faça login novamente." }, { status: 401 });
  }
  if (!isFullAdmin(scope) && !isActionAllowed(scope.permissions, "export_reports")) {
    return NextResponse.json({ error: "Sem permissão para gerar relatórios." }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const kind =
    body.kind === "account-summary" ? "account-summary" : body.kind === "campaigns" ? "campaigns" : body.kind === "ads" ? "ads" : null;
  if (!kind) {
    return NextResponse.json({ error: "Tipo de exportação inválido." }, { status: 400 });
  }
  const filters = sanitizeReportFilters(body.filters);
  if (!filters) {
    return NextResponse.json({ error: "Filtros de relatório inválidos." }, { status: 400 });
  }
  const recipientClientId = typeof body.recipientClientId === "string" && body.recipientClientId.trim() ? body.recipientClientId.trim() : null;

  const recipient = await resolveRecipient(scope, recipientClientId);
  if (isRecipientError(recipient)) {
    return NextResponse.json({ error: recipient.error }, { status: recipient.status });
  }

  const effectiveFilters = applyHiddenFilters(filters, recipient.permissions);
  const allowedColumns = buildAllowedColumns(recipient.permissions);

  try {
    const { freshData, filteredCampaigns, scopedAdSets, selectedAdSetIds } = await fetchFilteredReportData(effectiveFilters, recipient);
    let csv: string;
    let kindSlug: string;
    if (kind === "campaigns") {
      csv = buildCampaignsCsv(filteredCampaigns, allowedColumns);
      kindSlug = "campanhas";
    } else if (kind === "account-summary") {
      csv = buildAccountSummaryCsv(filteredCampaigns, allowedColumns);
      kindSlug = "resumo-por-conta";
    } else {
      const filteredCampaignIds = new Set(filteredCampaigns.map((c) => c.campaignId));
      const scopedAds = freshData.ads.filter(
        (a) => filteredCampaignIds.has(a.campaignId) && (selectedAdSetIds === null || selectedAdSetIds.has(a.adSetId))
      );
      csv = buildAdsCsv(scopedAds, filteredCampaigns, scopedAdSets, allowedColumns);
      kindSlug = "criativos-e-qualidade";
    }

    const recipientSlug = slugify(recipient.label ?? "consolidado");
    const fileName = `${kindSlug}_${recipientSlug}_${effectiveFilters.period.kind === "custom" ? `${effectiveFilters.period.range.since}_a_${effectiveFilters.period.range.until}` : effectiveFilters.period.preset}.csv`;

    await writeAudit({
      actorUserId: scope.userId,
      actorLabel: scope.userName,
      actorKind: scope.kind === "staff" ? "admin" : "client",
      action: "report.generate",
      targetType: "report",
      targetLabel: recipient.label ?? "Interno",
      metadata: { format: "csv", kind, recipientClientId },
    });

    // Leading BOM so Excel opens the accented pt-BR text as UTF-8 instead of guessing Latin-1 (matches the client-side downloadCsv helper's own format).
    const body = `﻿${csv}`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/analise/reports/csv]", err);
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json({ error: "Não foi possível gerar a exportação agora." }, { status });
  }
}
