import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardData,
  getScopedReachWithComparison,
  MetaApiError,
} from "@/lib/meta-ads";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { isFullAdmin, type SessionScope } from "@/lib/session-scope";
import { listClientAccess } from "@/lib/client-access";
import { DbConfigError } from "@/lib/db";
import { CAMPAIGN_COLUMN_OPTIONS, EMPTY_PERMISSIONS, type CampaignColumnId, type ClientPermissions } from "@/lib/client-permissions";
import { sanitizeReportFilters, type ReportFilters } from "@/lib/report-templates-types";
import { OBJECTIVE_NONE_KEY, resolveIdFilter, filterCampaignsByIds } from "@/lib/campaign-filters";
import { computeNarrowedCampaignIdsByAccount } from "@/lib/reach-scope";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { formatShortDate } from "@/lib/format";
import { DATE_PRESETS } from "@/lib/meta-ads-types";
import { buildReportPdf, reportFileName, type AllowedColumns, type ReportPdfInput } from "@/lib/pdf-report-core";
import { loadReportAssetsServer } from "@/lib/pdf-report-server-assets";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Every metric/column-visibility decision below flows from ONE place: the
// requesting session's own SessionScope (self-generated) or, for a full
// admin explicitly naming a recipient, that recipient's own client_access
// row — the exact same ClientPermissions record the live dashboard already
// enforces (client-permissions.ts / session-scope.ts). This route never
// accepts a metric/column list, a user id, or a permission set from the
// request body — only filters (period, accounts, campaigns, ad sets,
// objective, status) and, for a full admin, which client to generate for.
// The response is the compiled PDF's bytes; the underlying JSON dataset
// never round-trips through the browser.
// ---------------------------------------------------------------------------

type RequestBody = {
  title?: unknown;
  filters?: unknown;
  recipientClientId?: unknown;
};

type Recipient = {
  isClientScoped: boolean;
  label: string | null;
  accountIds: string[] | null; // null = no account restriction (internal admin report)
  permissions: ClientPermissions | null; // null = no restriction (internal admin report)
};

async function resolveRecipient(scope: SessionScope, recipientClientId: string | null): Promise<Recipient | { error: string; status: number }> {
  if (scope.kind === "client") {
    // A client can only ever generate their own report — a recipientClientId
    // in the body is simply ignored for this session kind rather than honored
    // or rejected, since it changes nothing about what this session may see.
    return { isClientScoped: true, label: scope.label, accountIds: scope.accountIds, permissions: scope.permissions };
  }

  // Internal (admin/analyst) session, no explicit recipient: this is the
  // administrator's own internal export — never labeled or restricted as if
  // it were already scoped to a specific client.
  if (!recipientClientId) {
    return { isClientScoped: false, label: null, accountIds: null, permissions: null };
  }

  // Only a full admin may generate a report on behalf of a named client —
  // mirrors the same isFullAdmin gate every other admin-only route uses.
  if (!isFullAdmin(scope)) {
    return { error: "Apenas administradores podem gerar relatórios para um cliente específico.", status: 403 };
  }

  let clients;
  try {
    clients = await listClientAccess();
  } catch (err) {
    if (err instanceof DbConfigError) {
      return { error: "Banco de dados não configurado — não é possível resolver destinatários de cliente.", status: 503 };
    }
    throw err;
  }

  // listClientAccess() already excludes revoked clients, so a revoked or
  // unknown id fails closed here rather than silently falling back to an
  // unrestricted export.
  const client = clients.find((c) => c.id === recipientClientId);
  if (!client) {
    return { error: "Cliente destinatário não encontrado ou revogado.", status: 404 };
  }

  return { isClientScoped: true, label: client.label, accountIds: client.accountIds, permissions: client.permissions };
}

function buildAllowedColumns(permissions: ClientPermissions | null): AllowedColumns {
  const hidden = new Set<CampaignColumnId>((permissions ?? EMPTY_PERMISSIONS).hiddenColumns);
  return new Set<CampaignColumnId>(CAMPAIGN_COLUMN_OPTIONS.map((o) => o.id).filter((id) => !hidden.has(id)));
}

/** A client-scoped recipient can only ever generate a report using the filter dimensions their own permissions leave visible — a hidden filter is forced back to "no restriction" server-side regardless of what the request body asked for, so a crafted request can't route around the dashboard's own filter-visibility rule. */
function applyHiddenFilters(filters: ReportFilters, permissions: ClientPermissions | null): ReportFilters {
  if (!permissions) return filters;
  const hidden = new Set(permissions.hiddenFilters);
  return {
    ...filters,
    compare: hidden.has("compare") ? false : filters.compare,
    campaignIds: hidden.has("campaign") ? null : filters.campaignIds,
    adSetIds: hidden.has("adSet") ? null : filters.adSetIds,
    objectiveIds: hidden.has("objective") ? null : filters.objectiveIds,
    statusIds: hidden.has("status") ? null : filters.statusIds,
  };
}

function periodSummaryLabel(filters: ReportFilters, since: string, until: string): string {
  const rangeLabel = `${formatShortDate(since)} – ${formatShortDate(until)}`;
  const period = filters.period;
  if (period.kind === "preset") {
    const presetLabel = DATE_PRESETS.find((p) => p.value === period.preset)?.label ?? period.preset;
    return `${presetLabel} (${rangeLabel})`;
  }
  return rangeLabel;
}

export async function POST(req: NextRequest) {
  const scope = verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
  if (!scope) {
    return NextResponse.json({ error: "Sessão inválida ou expirada. Faça login novamente." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Relatório de campanhas";
  const filters = sanitizeReportFilters(body.filters);
  if (!filters) {
    return NextResponse.json({ error: "Filtros de relatório inválidos." }, { status: 400 });
  }
  const recipientClientId = typeof body.recipientClientId === "string" && body.recipientClientId.trim() ? body.recipientClientId.trim() : null;

  const recipient = await resolveRecipient(scope, recipientClientId);
  if ("error" in recipient) {
    return NextResponse.json({ error: recipient.error }, { status: recipient.status });
  }

  const effectiveFilters = applyHiddenFilters(filters, recipient.permissions);
  const allowedColumns = buildAllowedColumns(recipient.permissions);

  try {
    const freshData = await getDashboardData(effectiveFilters.period, recipient.accountIds ?? undefined, { compare: effectiveFilters.compare });

    const resolvedAccountIds = resolveIdFilter(effectiveFilters.accountIds, freshData.accounts.map((a) => a.id));
    const resolvedCampaignIds = resolveIdFilter(effectiveFilters.campaignIds, freshData.campaigns.map((c) => c.campaignId));
    const resolvedAdSetIds = resolveIdFilter(effectiveFilters.adSetIds, freshData.adSets.map((a) => a.adSetId));
    const resolvedObjectiveIds = resolveIdFilter(effectiveFilters.objectiveIds, freshData.campaigns.map((c) => c.objective ?? OBJECTIVE_NONE_KEY));
    const resolvedStatusIds = resolveIdFilter(effectiveFilters.statusIds, freshData.campaigns.map((c) => c.status));

    const filteredCampaigns = filterCampaignsByIds(freshData.campaigns, freshData.adSets, {
      accountIds: resolvedAccountIds,
      campaignIds: resolvedCampaignIds,
      adSetIds: resolvedAdSetIds,
      objectiveIds: resolvedObjectiveIds,
      statusIds: resolvedStatusIds,
    });

    const filteredCampaignIds = new Set(filteredCampaigns.map((c) => c.campaignId));
    const scopedAdSets = freshData.adSets.filter((a) => filteredCampaignIds.has(a.campaignId));
    const allAdSetIds = new Set(freshData.adSets.map((a) => a.adSetId));
    const adSetFilterActive = allAdSetIds.size > 0 && resolvedAdSetIds.size !== allAdSetIds.size;
    const selectedAdSetIds = adSetFilterActive ? resolvedAdSetIds : null;

    const narrowedCampaignIdsByAccount = computeNarrowedCampaignIdsByAccount(freshData.campaigns, filteredCampaigns, resolvedAccountIds);
    let reach: number | null;
    let comparisonReach: number | null = null;
    if (Object.keys(narrowedCampaignIdsByAccount).length === 0) {
      reach = freshData.accountReach.filter((r) => resolvedAccountIds.has(r.accountId)).reduce((s, r) => s + r.reach, 0);
      comparisonReach =
        effectiveFilters.compare && freshData.comparison
          ? freshData.comparison.accountReach.filter((r) => resolvedAccountIds.has(r.accountId)).reduce((s, r) => s + r.reach, 0)
          : null;
    } else {
      const scoped = await getScopedReachWithComparison(
        effectiveFilters.period,
        effectiveFilters.compare,
        narrowedCampaignIdsByAccount,
        recipient.accountIds ?? undefined
      );
      const failedAccountIds = new Set(
        Object.keys(narrowedCampaignIdsByAccount).filter((id) => !scoped.currentReach.some((r) => r.accountId === id))
      );
      const anyFailed = Object.keys(narrowedCampaignIdsByAccount).some((id) => failedAccountIds.has(id));
      if (anyFailed) {
        reach = null;
        comparisonReach = null;
      } else {
        const scopedMap = new Map(scoped.currentReach.map((r) => [r.accountId, r.reach]));
        reach = 0;
        for (const accountId of resolvedAccountIds) {
          reach +=
            narrowedCampaignIdsByAccount[accountId] !== undefined
              ? (scopedMap.get(accountId) ?? 0)
              : (freshData.accountReach.find((r) => r.accountId === accountId)?.reach ?? 0);
        }
        if (effectiveFilters.compare && scoped.previousReach) {
          const scopedPrevMap = new Map(scoped.previousReach.map((r) => [r.accountId, r.reach]));
          comparisonReach = 0;
          for (const accountId of resolvedAccountIds) {
            comparisonReach +=
              narrowedCampaignIdsByAccount[accountId] !== undefined
                ? (scopedPrevMap.get(accountId) ?? 0)
                : (freshData.comparison?.accountReach.find((r) => r.accountId === accountId)?.reach ?? 0);
          }
        }
      }
    }

    const accountOptions = freshData.accounts.map((a) => ({ id: a.id, label: a.name }));
    const campaignOptions = freshData.campaigns.map((c) => ({ id: c.campaignId, label: c.campaignName }));
    const adSetOptions = freshData.adSets.map((a) => ({ id: a.adSetId, label: a.adSetName }));
    const objectiveOptions = [...new Set(freshData.campaigns.map((c) => c.objective ?? OBJECTIVE_NONE_KEY))].map((id) => ({
      id,
      label: objectiveLabel(id === OBJECTIVE_NONE_KEY ? null : id),
    }));
    const statusOptions = [...new Set(freshData.campaigns.map((c) => c.status))].map((id) => ({ id, label: statusLabel(id) }));

    const activeFilters: { label: string; value: string }[] = [];
    const idsSummary = (ids: Set<string>, opts: { id: string; label: string }[]): string => {
      const byId = new Map(opts.map((o) => [o.id, o.label]));
      const labels = [...ids].map((id) => byId.get(id)).filter((l): l is string => Boolean(l));
      if (labels.length === 0) return `${ids.size} selecionado${ids.size === 1 ? "" : "s"}`;
      if (labels.length <= 2) return labels.join(", ");
      return `${labels.length} selecionados`;
    };
    const maybeAdd = (label: string, ids: Set<string>, opts: { id: string; label: string }[]) => {
      if (opts.length > 0 && ids.size < opts.length) activeFilters.push({ label, value: idsSummary(ids, opts) });
    };
    maybeAdd("Contas", resolvedAccountIds, accountOptions);
    maybeAdd("Campanha", resolvedCampaignIds, campaignOptions);
    maybeAdd("Conjunto", resolvedAdSetIds, adSetOptions);
    maybeAdd("Objetivo", resolvedObjectiveIds, objectiveOptions);
    maybeAdd("Status", resolvedStatusIds, statusOptions);
    activeFilters.push({ label: "Comparação", value: effectiveFilters.compare ? "Ativada" : "Desativada" });

    const input: ReportPdfInput = {
      title,
      clientLabel: recipient.label,
      isClientScoped: recipient.isClientScoped,
      allowedColumns,
      accounts: freshData.accounts.filter((a) => resolvedAccountIds.has(a.id)),
      periodLabel: periodSummaryLabel(effectiveFilters, freshData.resolvedRange.since, freshData.resolvedRange.until),
      resolvedRange: freshData.resolvedRange,
      compare: effectiveFilters.compare,
      comparisonRange: freshData.comparison?.period ?? null,
      filters: activeFilters,
      generatedAt: new Date(),
      dataGeneratedAt: freshData.generatedAt,
      campaigns: filteredCampaigns,
      comparisonCampaigns: freshData.comparison ? freshData.comparison.campaigns.filter((c) => resolvedAccountIds.has(c.accountId)) : null,
      adSets: scopedAdSets,
      selectedAdSetIds,
      daily: freshData.daily.filter((d) => resolvedAccountIds.has(d.accountId)),
      comparisonDaily: freshData.comparison ? freshData.comparison.daily.filter((d) => resolvedAccountIds.has(d.accountId)) : null,
      reach,
      comparisonReach,
      audience: freshData.audience.filter((a) => resolvedAccountIds.has(a.accountId)),
      regions: freshData.regions.filter((r) => resolvedAccountIds.has(r.accountId)),
      partialAccountNames: freshData.partialAccounts.map((a) => a.name),
    };

    const assets = await loadReportAssetsServer();
    const doc = buildReportPdf(input, assets);
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const fileName = reportFileName(input);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdfBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/analise/reports/pdf]", err);
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json({ error: "Não foi possível gerar o relatório PDF agora." }, { status });
  }
}
