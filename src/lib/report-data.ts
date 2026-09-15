// Server-only. Shared recipient-resolution and filtered-data-assembly logic
// for every export that leaves the dashboard (PDF today, CSV as of this
// change) — kept in exactly one place so a future export format reuses the
// same permission enforcement instead of re-deriving (and potentially
// diverging from) it. See /api/analise/reports/pdf/route.ts for the
// original design notes on why this resolution happens server-side only.

import {
  getDashboardData,
  getScopedReachWithComparison,
  type DashboardData,
} from "./meta-ads";
import { isFullAdmin, type SessionScope } from "./session-scope";
import { listClientAccess } from "./client-access";
import { DbConfigError } from "./db";
import { CAMPAIGN_COLUMN_OPTIONS, EMPTY_PERMISSIONS, type CampaignColumnId, type ClientPermissions } from "./client-permissions";
import type { ReportFilters } from "./report-templates-types";
import { OBJECTIVE_NONE_KEY, resolveIdFilter, filterCampaignsByIds } from "./campaign-filters";
import { computeNarrowedCampaignIdsByAccount } from "./reach-scope";
import { objectiveLabel, statusLabel } from "./campaign-labels";
import { formatShortDate } from "./format";
import { DATE_PRESETS } from "./meta-ads-types";
import type { AllowedColumns } from "./pdf-report-core";

export type Recipient = {
  isClientScoped: boolean;
  label: string | null;
  accountIds: string[] | null; // null = no account restriction (internal admin export)
  permissions: ClientPermissions | null; // null = no restriction (internal admin export)
};

export type RecipientError = { error: string; status: number };

/** Resolves who this export is FOR and, from that, the ONE permission record that governs it — the requesting session's own scope (self-export) or, for a full admin explicitly naming a client, that client's own client_access row. Never accepts a permission set from the caller; the recipientClientId is only ever an id to look up. */
export async function resolveRecipient(scope: SessionScope, recipientClientId: string | null): Promise<Recipient | RecipientError> {
  if (!isFullAdmin(scope)) {
    // Both a client and a staff member below administrador_geral can only
    // ever export their own scoped data — a recipientClientId in the
    // request is simply ignored for these session kinds rather than
    // honored or rejected, since it changes nothing about what this
    // session may see.
    return {
      isClientScoped: scope.kind === "client",
      label: scope.kind === "client" ? scope.label : null,
      accountIds: scope.accountIds,
      permissions: scope.permissions,
    };
  }

  // Full admin, no explicit recipient: this is the administrator's own
  // internal export — never labeled or restricted as if it were already
  // scoped to a specific client.
  if (!recipientClientId) {
    return { isClientScoped: false, label: null, accountIds: null, permissions: null };
  }

  // Only a full admin may export on behalf of a named client — mirrors the
  // same isFullAdmin gate every other admin-only route uses.
  if (!isFullAdmin(scope)) {
    return { error: "Apenas administradores podem gerar exportações para um cliente específico.", status: 403 };
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

export function isRecipientError(r: Recipient | RecipientError): r is RecipientError {
  return "error" in r;
}

export function buildAllowedColumns(permissions: ClientPermissions | null): AllowedColumns {
  const hidden = new Set<CampaignColumnId>((permissions ?? EMPTY_PERMISSIONS).hiddenColumns);
  return new Set<CampaignColumnId>(CAMPAIGN_COLUMN_OPTIONS.map((o) => o.id).filter((id) => !hidden.has(id)));
}

/** A client-scoped recipient can only ever export using the filter dimensions their own permissions leave visible — a hidden filter is forced back to "no restriction" server-side regardless of what the request asked for, so a crafted request can't route around the dashboard's own filter-visibility rule. */
export function applyHiddenFilters(filters: ReportFilters, permissions: ClientPermissions | null): ReportFilters {
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

export function periodSummaryLabel(filters: ReportFilters, since: string, until: string): string {
  const rangeLabel = `${formatShortDate(since)} – ${formatShortDate(until)}`;
  const period = filters.period;
  if (period.kind === "preset") {
    const presetLabel = DATE_PRESETS.find((p) => p.value === period.preset)?.label ?? period.preset;
    return `${presetLabel} (${rangeLabel})`;
  }
  return rangeLabel;
}

export type FilterOptionRow = { id: string; label: string };

export type FilteredReportData = {
  freshData: DashboardData;
  resolvedAccountIds: Set<string>;
  resolvedCampaignIds: Set<string>;
  resolvedAdSetIds: Set<string>;
  resolvedObjectiveIds: Set<string>;
  resolvedStatusIds: Set<string>;
  filteredCampaigns: DashboardData["campaigns"];
  scopedAdSets: DashboardData["adSets"];
  selectedAdSetIds: Set<string> | null;
  activeFilters: { label: string; value: string }[];
  accountOptions: FilterOptionRow[];
  campaignOptions: FilterOptionRow[];
  adSetOptions: FilterOptionRow[];
  objectiveOptions: FilterOptionRow[];
  statusOptions: FilterOptionRow[];
};

/** Fetches the dashboard dataset already scoped to `recipient.accountIds` (never more than the caller is allowed to see) and narrows it by every other filter dimension — the exact same resolution the PDF builder and the live dashboard both use, so an export can never show a campaign/ad set that filter combination wouldn't show on screen. */
export async function fetchFilteredReportData(effectiveFilters: ReportFilters, recipient: Recipient): Promise<FilteredReportData> {
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

  const accountOptions = freshData.accounts.map((a) => ({ id: a.id, label: a.name }));
  const campaignOptions = freshData.campaigns.map((c) => ({ id: c.campaignId, label: c.campaignName }));
  const adSetOptions = freshData.adSets.map((a) => ({ id: a.adSetId, label: a.adSetName }));
  const objectiveOptions = [...new Set(freshData.campaigns.map((c) => c.objective ?? OBJECTIVE_NONE_KEY))].map((id) => ({
    id,
    label: objectiveLabel(id === OBJECTIVE_NONE_KEY ? null : id),
  }));
  const statusOptions = [...new Set(freshData.campaigns.map((c) => c.status))].map((id) => ({ id, label: statusLabel(id) }));

  const activeFilters: { label: string; value: string }[] = [];
  const idsSummary = (ids: Set<string>, opts: FilterOptionRow[]): string => {
    const byId = new Map(opts.map((o) => [o.id, o.label]));
    const labels = [...ids].map((id) => byId.get(id)).filter((l): l is string => Boolean(l));
    if (labels.length === 0) return `${ids.size} selecionado${ids.size === 1 ? "" : "s"}`;
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.length} selecionados`;
  };
  const maybeAdd = (label: string, ids: Set<string>, opts: FilterOptionRow[]) => {
    if (opts.length > 0 && ids.size < opts.length) activeFilters.push({ label, value: idsSummary(ids, opts) });
  };
  maybeAdd("Contas", resolvedAccountIds, accountOptions);
  maybeAdd("Campanha", resolvedCampaignIds, campaignOptions);
  maybeAdd("Conjunto", resolvedAdSetIds, adSetOptions);
  maybeAdd("Objetivo", resolvedObjectiveIds, objectiveOptions);
  maybeAdd("Status", resolvedStatusIds, statusOptions);
  activeFilters.push({ label: "Comparação", value: effectiveFilters.compare ? "Ativada" : "Desativada" });

  return {
    freshData,
    resolvedAccountIds,
    resolvedCampaignIds,
    resolvedAdSetIds,
    resolvedObjectiveIds,
    resolvedStatusIds,
    filteredCampaigns,
    scopedAdSets,
    selectedAdSetIds,
    activeFilters,
    accountOptions,
    campaignOptions,
    adSetOptions,
    objectiveOptions,
    statusOptions,
  };
}

/** Meta's own deduplicated reach for exactly `filteredCampaigns`'s scope — null means it couldn't be apurado com confiança for this filter combination (never a silent fallback to an unfiltered/consolidated number). Mirrors Dashboard.tsx's own totalReachOutcome/comparisonReachOutcome logic. */
export async function computeReach(
  effectiveFilters: ReportFilters,
  recipient: Recipient,
  data: Pick<FilteredReportData, "freshData" | "filteredCampaigns" | "resolvedAccountIds">
): Promise<{ reach: number | null; comparisonReach: number | null }> {
  const { freshData, filteredCampaigns, resolvedAccountIds } = data;
  const narrowedCampaignIdsByAccount = computeNarrowedCampaignIdsByAccount(freshData.campaigns, filteredCampaigns, resolvedAccountIds);

  if (Object.keys(narrowedCampaignIdsByAccount).length === 0) {
    const reach = freshData.accountReach.filter((r) => resolvedAccountIds.has(r.accountId)).reduce((s, r) => s + r.reach, 0);
    const comparisonReach =
      effectiveFilters.compare && freshData.comparison
        ? freshData.comparison.accountReach.filter((r) => resolvedAccountIds.has(r.accountId)).reduce((s, r) => s + r.reach, 0)
        : null;
    return { reach, comparisonReach };
  }

  const scoped = await getScopedReachWithComparison(
    effectiveFilters.period,
    effectiveFilters.compare,
    narrowedCampaignIdsByAccount,
    recipient.accountIds ?? undefined
  );
  const anyFailed = Object.keys(narrowedCampaignIdsByAccount).some((id) => !scoped.currentReach.some((r) => r.accountId === id));
  if (anyFailed) return { reach: null, comparisonReach: null };

  const scopedMap = new Map(scoped.currentReach.map((r) => [r.accountId, r.reach]));
  let reach = 0;
  for (const accountId of resolvedAccountIds) {
    reach +=
      narrowedCampaignIdsByAccount[accountId] !== undefined
        ? (scopedMap.get(accountId) ?? 0)
        : (freshData.accountReach.find((r) => r.accountId === accountId)?.reach ?? 0);
  }
  let comparisonReach: number | null = null;
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
  return { reach, comparisonReach };
}
