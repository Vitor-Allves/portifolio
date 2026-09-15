import { NextRequest, NextResponse } from "next/server";
import { MetaApiError } from "@/lib/meta-ads";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { sanitizeReportFilters } from "@/lib/report-templates-types";
import { resolveRecipient, isRecipientError, buildAllowedColumns, applyHiddenFilters, fetchFilteredReportData } from "@/lib/report-data";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation, sumTotals, type Totals } from "@/lib/metrics";
import { rowsToCsv } from "@/lib/csv";
import type { CampaignInsight } from "@/lib/meta-ads-types";
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
};
// Row-level campaign export includes reach per-row (each campaign's own,
// individually-scoped number). The account-summary export deliberately
// omits reach entirely — see buildAccountSummaryCsv for why.
const CAMPAIGN_METRIC_IDS: CampaignColumnId[] = ["spend", "impressions", "clicks", "linkClicks", "conversations", "costPerConversation", "ctr", "cpc", "cpm", "reach"];
const ACCOUNT_SUMMARY_METRIC_IDS: CampaignColumnId[] = ["spend", "impressions", "clicks", "linkClicks", "conversations", "costPerConversation", "ctr", "cpc", "cpm"];

function buildCampaignsCsv(campaigns: CampaignInsight[], allowed: AllowedColumns): string {
  const header = ["Campanha"];
  if (isAllowed(allowed, "account")) header.push("Conta");
  if (isAllowed(allowed, "objective")) header.push("Objetivo");
  if (isAllowed(allowed, "status")) header.push("Status");
  const metricIds = CAMPAIGN_METRIC_IDS.filter((id) => isAllowed(allowed, id));
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
  const metricIds = ACCOUNT_SUMMARY_METRIC_IDS.filter((id) => isAllowed(allowed, id));
  for (const id of metricIds) header.push(METRIC_COLUMN_LABELS[id] ?? id);

  const rows = [...byAccount.values()].map((entry) => {
    const totals = sumTotals(entry.campaigns);
    const row = [entry.name, String(entry.campaigns.length)];
    for (const id of metricIds) row.push(metricCell(id, totals) ?? "—");
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

  const kind = body.kind === "account-summary" ? "account-summary" : body.kind === "campaigns" ? "campaigns" : null;
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
    const { filteredCampaigns } = await fetchFilteredReportData(effectiveFilters, recipient);
    const csv = kind === "campaigns" ? buildCampaignsCsv(filteredCampaigns, allowedColumns) : buildAccountSummaryCsv(filteredCampaigns, allowedColumns);

    const recipientSlug = slugify(recipient.label ?? "consolidado");
    const fileName = `${kind === "campaigns" ? "campanhas" : "resumo-por-conta"}_${recipientSlug}_${effectiveFilters.period.kind === "custom" ? `${effectiveFilters.period.range.since}_a_${effectiveFilters.period.range.until}` : effectiveFilters.period.preset}.csv`;

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
