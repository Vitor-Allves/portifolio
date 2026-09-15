"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { m, type Variants } from "framer-motion";
import type { AdSetInsight, CampaignInsight, DashboardData, Period } from "@/lib/meta-ads-types";
import type { ClientPermissions } from "@/lib/client-permissions";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { sumTotals, ctr, cpc, cpm, costPerConversation, pctChange, aggregateDailyByDate } from "@/lib/metrics";
import { computeStrategicInsights } from "@/lib/strategic-insights";
import { OBJECTIVE_NONE_KEY, filterCampaignsByIds } from "@/lib/campaign-filters";
import { fetchDashboardData, fetchScopedReach, DashboardFetchError, type ScopedReachResult } from "@/lib/dashboard-fetch";
import { computeNarrowedCampaignIdsByAccount } from "@/lib/reach-scope";
import { primaryKpiIds, type KpiId } from "@/lib/kpi-hierarchy";
import type { DeltaPolarity } from "./KpiCard";
import IntelligenceSidebar, { SECTIONS, type SectionId } from "./IntelligenceSidebar";
import IntelligenceTopBar from "./IntelligenceTopBar";
import FilterBar from "./FilterBar";
import KpiCard from "./KpiCard";
import TrendChart, { type TrendMetric } from "./TrendChart";
import SpendDistributionChart from "./SpendDistributionChart";
import RankingChart from "./RankingChart";
import BreakdownAnalysis, { AGE_ORDER, GENDER_ORDER, GENDER_LABEL, unknownAsNaoInformado } from "./BreakdownAnalysis";
import CampaignsTable from "./CampaignsTable";
import RankedEntityTable, { type RankedRow } from "./RankedEntityTable";
import StrategicInsightsPanel from "./StrategicInsightsPanel";
import StrategicInsightsCompact from "./StrategicInsightsCompact";
import ExecutiveSummary from "./ExecutiveSummary";
import ReportsPanel from "./ReportsPanel";
import IntegrationsPanel from "./IntegrationsPanel";

type DashboardProps = {
  initialData: DashboardData;
  isAdmin: boolean;
  /** Internal Legado viewer (admin or analyst) — distinct from isAdmin, which gates admin-only actions. Controls how much infra/technical detail is shown, never data access. */
  isInternal: boolean;
  clientLabel: string | null;
  clientPermissions: ClientPermissions | null;
  dbConfigured: boolean;
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

const NONE_KEY = OBJECTIVE_NONE_KEY;

function allIds<T extends { id: string }>(items: T[]): Set<string> {
  return new Set(items.map((i) => i.id));
}

function uniqueOptions(campaigns: CampaignInsight[], key: (c: CampaignInsight) => string, label: (c: CampaignInsight) => string) {
  const seen = new Map<string, string>();
  for (const c of campaigns) {
    const id = key(c);
    if (!seen.has(id)) seen.set(id, label(c));
  }
  return [...seen.entries()].map(([id, l]) => ({ id, label: l }));
}

function uniqueAdSetOptions(adSets: AdSetInsight[]) {
  const seen = new Map<string, string>();
  for (const a of adSets) {
    if (!seen.has(a.adSetId)) seen.set(a.adSetId, a.adSetName);
  }
  return [...seen.entries()].map(([id, l]) => ({ id, label: l }));
}

type DailyAgg = { spend: number; impressions: number; clicks: number; linkClicks: number; conversations: number | null; reach: number };

function sparklineFor(
  daily: DailyAgg[],
  metric: "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "linkClicks" | "conversations" | "costPerConversation" | "reach"
) {
  return daily.map((d) => {
    switch (metric) {
      case "spend":
        return d.spend;
      case "impressions":
        return d.impressions;
      case "clicks":
        return d.clicks;
      case "ctr":
        return d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0;
      case "cpc":
        return d.clicks > 0 ? d.spend / d.clicks : 0;
      case "cpm":
        return d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0;
      case "linkClicks":
        return d.linkClicks;
      case "conversations":
        return d.conversations ?? 0;
      case "costPerConversation":
        return d.conversations !== null && d.conversations > 0 ? d.spend / d.conversations : 0;
      case "reach":
        return d.reach;
    }
  });
}

export default function Dashboard({ initialData, isAdmin, isInternal, clientLabel, clientPermissions, dbConfigured }: DashboardProps) {
  const hiddenFilterIds = useMemo(() => new Set<string>(clientPermissions?.hiddenFilters ?? []), [clientPermissions]);
  const hiddenColumnIds = useMemo(() => new Set<string>(clientPermissions?.hiddenColumns ?? []), [clientPermissions]);
  const hiddenSectionIds = useMemo(() => new Set<string>(clientPermissions?.hiddenSections ?? []), [clientPermissions]);

  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState<Period>(initialData.period);
  const [compare, setCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [section, setSection] = useState<SectionId>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("spend");

  const [accountIds, setAccountIds] = useState(() => allIds(initialData.accounts.map((a) => ({ id: a.id }))));
  const [campaignIds, setCampaignIds] = useState(() => new Set(initialData.campaigns.map((c) => c.campaignId)));
  const [adSetIds, setAdSetIds] = useState(() => new Set(initialData.adSets.map((a) => a.adSetId)));
  const [objectiveIds, setObjectiveIds] = useState(
    () => new Set(initialData.campaigns.map((c) => c.objective ?? NONE_KEY))
  );
  const [statusIds, setStatusIds] = useState<Set<string>>(() => new Set(initialData.campaigns.map((c) => c.status)));

  const defaultPeriod: Period = initialData.period;

  function resetFilters(nextData: DashboardData) {
    setAccountIds(allIds(nextData.accounts.map((a) => ({ id: a.id }))));
    setCampaignIds(new Set(nextData.campaigns.map((c) => c.campaignId)));
    setAdSetIds(new Set(nextData.adSets.map((a) => a.adSetId)));
    setObjectiveIds(new Set(nextData.campaigns.map((c) => c.objective ?? NONE_KEY)));
    setStatusIds(new Set(nextData.campaigns.map((c) => c.status)));
  }

  function refetch(nextPeriod: Period, nextCompare: boolean) {
    setPeriod(nextPeriod);
    setCompare(nextCompare);
    setError(null);
    startTransition(async () => {
      try {
        const nextData = await fetchDashboardData(nextPeriod, nextCompare);
        setData(nextData);
        resetFilters(nextData);
      } catch (err) {
        setError(err instanceof DashboardFetchError ? err.message : "Falha de conexão ao buscar os dados.");
      }
    });
  }

  const accountOptions = useMemo(() => data.accounts.map((a) => ({ id: a.id, label: a.name })), [data.accounts]);
  const campaignOptions = useMemo(
    () => uniqueOptions(data.campaigns, (c) => c.campaignId, (c) => c.campaignName),
    [data.campaigns]
  );
  const adSetOptions = useMemo(() => uniqueAdSetOptions(data.adSets), [data.adSets]);
  const objectiveOptions = useMemo(
    () => uniqueOptions(data.campaigns, (c) => c.objective ?? NONE_KEY, (c) => objectiveLabel(c.objective)),
    [data.campaigns]
  );
  const statusOptions = useMemo(
    () => uniqueOptions(data.campaigns, (c) => c.status, (c) => statusLabel(c.status)),
    [data.campaigns]
  );

  // Shared with the report-template generation flow (ReportsPanel.tsx) via
  // campaign-filters.ts, so a generated report's campaign selection always
  // matches what the same filters would show on screen — including the
  // Conjunto filter's "only narrows once actually narrowed" nuance.
  const filteredCampaigns = useMemo(
    () => filterCampaignsByIds(data.campaigns, data.adSets, { accountIds, campaignIds, adSetIds, objectiveIds, statusIds }),
    [data.campaigns, data.adSets, accountIds, campaignIds, adSetIds, objectiveIds, statusIds]
  );

  const filteredAdSets = useMemo(() => {
    const visibleCampaignIds = new Set(filteredCampaigns.map((c) => c.campaignId));
    return data.adSets.filter((a) => adSetIds.has(a.adSetId) && visibleCampaignIds.has(a.campaignId));
  }, [data.adSets, adSetIds, filteredCampaigns]);

  // Same membership rule as filteredAdSets: an ad only shows if its own ad
  // set is selected AND its campaign is still visible after every other
  // filter — so an ad never appears "orphaned" under a campaign the rest of
  // the filters have already hidden.
  const filteredAds = useMemo(() => {
    const visibleCampaignIds = new Set(filteredCampaigns.map((c) => c.campaignId));
    return data.ads.filter((ad) => adSetIds.has(ad.adSetId) && visibleCampaignIds.has(ad.campaignId));
  }, [data.ads, adSetIds, filteredCampaigns]);

  // Audience demographics are account-level only (Meta doesn't break them
  // down by campaign) — scoped by the account/client filter alone, same as
  // the Alcance KPI.
  const filteredAudience = useMemo(
    () => data.audience.filter((a) => accountIds.has(a.accountId)),
    [data.audience, accountIds]
  );

  // Region is also account-level only, same scoping as the audience segments above.
  const filteredRegions = useMemo(
    () => data.regions.filter((r) => accountIds.has(r.accountId)),
    [data.regions, accountIds]
  );

  // Flat, cross-campaign views for the Campanhas page's "Conjuntos" and
  // "Melhores anúncios" sections — campaign/account names aren't on
  // AdSetInsight/AdInsight themselves, so they're joined in here once
  // rather than repeated per row inside RankedEntityTable.
  const campaignNameById = useMemo(() => new Map(data.campaigns.map((c) => [c.campaignId, c.campaignName])), [data.campaigns]);
  const accountNameById = useMemo(() => new Map(data.accounts.map((a) => [a.id, a.name])), [data.accounts]);

  const adSetRows: RankedRow[] = useMemo(
    () =>
      filteredAdSets.map((a) => ({
        id: a.adSetId,
        name: a.adSetName,
        campaignName: campaignNameById.get(a.campaignId) ?? "—",
        accountName: accountNameById.get(a.accountId) ?? "—",
        status: a.status,
        spend: a.spend,
        impressions: a.impressions,
        clicks: a.clicks,
        linkClicks: a.linkClicks,
        conversations: a.conversations,
        reach: a.reach,
      })),
    [filteredAdSets, campaignNameById, accountNameById]
  );

  const adRows: RankedRow[] = useMemo(
    () =>
      filteredAds.map((ad) => ({
        id: ad.adId,
        name: ad.adName,
        campaignName: campaignNameById.get(ad.campaignId) ?? "—",
        accountName: accountNameById.get(ad.accountId) ?? "—",
        status: ad.status,
        spend: ad.spend,
        impressions: ad.impressions,
        clicks: ad.clicks,
        linkClicks: ad.linkClicks,
        conversations: ad.conversations,
        reach: ad.reach,
      })),
    [filteredAds, campaignNameById, accountNameById]
  );

  // Comparison is scoped only by the client (account) filter — never by the
  // campaign/objective/status filters, whose option lists are built from the
  // *current* period's campaign roster. A campaign that only ran in the
  // previous period wouldn't be selectable there, and filtering the
  // comparison set the same way would silently drop it from the "vs.
  // previous period" totals instead of correctly counting it.
  const comparisonCampaigns = useMemo(
    () => (data.comparison ? data.comparison.campaigns.filter((c) => accountIds.has(c.accountId)) : null),
    [data.comparison, accountIds]
  );
  const comparisonByCampaignId = useMemo(
    () => (comparisonCampaigns ? new Map(comparisonCampaigns.map((c) => [c.campaignId, c])) : null),
    [comparisonCampaigns]
  );

  const dailyFiltered = useMemo(() => aggregateDailyByDate(data.daily, accountIds), [data.daily, accountIds]);
  const comparisonDailyFiltered = useMemo(
    () => (data.comparison ? aggregateDailyByDate(data.comparison.daily, accountIds) : null),
    [data.comparison, accountIds]
  );

  const totals = useMemo(() => sumTotals(filteredCampaigns), [filteredCampaigns]);
  const comparisonTotals = useMemo(
    () => (comparisonCampaigns ? sumTotals(comparisonCampaigns) : null),
    [comparisonCampaigns]
  );

  // Reach is only ever summed per account, never per campaign or per day —
  // Meta already deduplicates it within one account-level call for the whole
  // period, and re-summing a finer breakdown would count the same person
  // again for every campaign or day that reached them. This is the correct
  // number ONLY when every campaign in each selected account is still in
  // view — the moment the campaign/ad set/objective/status filters narrow
  // an account's own campaign set, this whole-account figure stops being a
  // valid answer for "reach of what's currently shown" and the scoped fetch
  // below takes over instead.
  const wholeAccountTotalReach = useMemo(
    () => data.accountReach.filter((r) => accountIds.has(r.accountId)).reduce((sum, r) => sum + r.reach, 0),
    [data.accountReach, accountIds]
  );
  const wholeAccountComparisonReach = useMemo(
    () =>
      data.comparison
        ? data.comparison.accountReach.filter((r) => accountIds.has(r.accountId)).reduce((sum, r) => sum + r.reach, 0)
        : null,
    [data.comparison, accountIds]
  );

  const scopedAccountReach = useMemo(
    () => data.accountReach.filter((r) => accountIds.has(r.accountId)),
    [data.accountReach, accountIds]
  );
  const scopedComparisonAccountReach = useMemo(
    () => (data.comparison ? data.comparison.accountReach.filter((r) => accountIds.has(r.accountId)) : null),
    [data.comparison, accountIds]
  );

  // ---- Campaign-narrowed reach (see comment on wholeAccountTotalReach) ----
  // An account is "narrowed" the moment its filtered campaign subset is
  // smaller than its full roster — shared with ReportsPanel.tsx's
  // template-based generation flow so both agree on exactly when the
  // whole-account reach number stops being valid.
  const narrowedCampaignIdsByAccount = useMemo(
    () => computeNarrowedCampaignIdsByAccount(data.campaigns, filteredCampaigns, accountIds),
    [data.campaigns, filteredCampaigns, accountIds]
  );

  const isReachNarrowed = Object.keys(narrowedCampaignIdsByAccount).length > 0;

  const [scopedReachStatus, setScopedReachStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [scopedReachResult, setScopedReachResult] = useState<ScopedReachResult | null>(null);
  const scopedReachRequestId = useRef(0);

  useEffect(() => {
    // Nothing to fetch once un-narrowed — and nothing to reset either, since
    // every consumer below (totalReachOutcome, comparisonReachOutcome,
    // reachPending) checks isReachNarrowed before ever looking at this
    // status/result pair, so a stale "loading"/"error" left over from a
    // previous narrowed filter is simply never read.
    if (!isReachNarrowed) return;
    const requestId = ++scopedReachRequestId.current;
    (async () => {
      setScopedReachStatus("loading");
      try {
        const result = await fetchScopedReach(period, compare, narrowedCampaignIdsByAccount);
        if (scopedReachRequestId.current !== requestId) return; // superseded by a newer filter change
        setScopedReachResult(result);
        setScopedReachStatus("ready");
      } catch {
        if (scopedReachRequestId.current !== requestId) return;
        setScopedReachResult(null);
        setScopedReachStatus("error");
      }
    })();
  }, [isReachNarrowed, period, compare, narrowedCampaignIdsByAccount]);

  // Never silently falls back to the whole-account number once narrowed:
  // "ok" only once the scoped call actually confirms a value for every
  // narrowed account; otherwise the KPI shows a loading or explicit
  // unavailable state instead of a wrong-but-plausible-looking one.
  const totalReachOutcome = useMemo((): { value: number | null; status: "ok" | "loading" | "error" } => {
    if (!isReachNarrowed) return { value: wholeAccountTotalReach, status: "ok" };
    if (scopedReachStatus !== "ready" || !scopedReachResult) {
      return { value: null, status: scopedReachStatus === "error" ? "error" : "loading" };
    }
    const failed = new Set(scopedReachResult.failedAccountIds);
    if (Object.keys(narrowedCampaignIdsByAccount).some((id) => failed.has(id))) return { value: null, status: "error" };
    const scopedMap = new Map(scopedReachResult.currentReach.map((r) => [r.accountId, r.reach]));
    let sum = 0;
    for (const accountId of accountIds) {
      sum +=
        narrowedCampaignIdsByAccount[accountId] !== undefined
          ? (scopedMap.get(accountId) ?? 0)
          : (scopedAccountReach.find((r) => r.accountId === accountId)?.reach ?? 0);
    }
    return { value: sum, status: "ok" };
  }, [isReachNarrowed, wholeAccountTotalReach, scopedReachStatus, scopedReachResult, narrowedCampaignIdsByAccount, accountIds, scopedAccountReach]);

  const comparisonReachOutcome = useMemo((): { value: number | null; status: "ok" | "loading" | "error" } => {
    if (!compare) return { value: null, status: "ok" };
    if (!isReachNarrowed) return { value: wholeAccountComparisonReach, status: "ok" };
    if (scopedReachStatus !== "ready" || !scopedReachResult || !scopedReachResult.previousReach) {
      return { value: null, status: scopedReachStatus === "error" ? "error" : "loading" };
    }
    const failed = new Set(scopedReachResult.failedAccountIds);
    if (Object.keys(narrowedCampaignIdsByAccount).some((id) => failed.has(id))) return { value: null, status: "error" };
    const scopedMap = new Map(scopedReachResult.previousReach.map((r) => [r.accountId, r.reach]));
    let sum = 0;
    for (const accountId of accountIds) {
      sum +=
        narrowedCampaignIdsByAccount[accountId] !== undefined
          ? (scopedMap.get(accountId) ?? 0)
          : (scopedComparisonAccountReach?.find((r) => r.accountId === accountId)?.reach ?? 0);
    }
    return { value: sum, status: "ok" };
  }, [
    compare,
    isReachNarrowed,
    wholeAccountComparisonReach,
    scopedReachStatus,
    scopedReachResult,
    narrowedCampaignIdsByAccount,
    accountIds,
    scopedComparisonAccountReach,
  ]);

  // Gates ad-hoc PDF generation while the scoped reach recalculation for the
  // current campaign/ad set/objective/status filters is still in flight —
  // the server route recomputes reach itself from the submitted filters, so
  // this only prevents firing a request while this screen's own filters are
  // still settling, never a stand-in for the server's own computation.
  const reachPending = isReachNarrowed && scopedReachStatus === "loading";

  const totalCtr = ctr(totals);
  const totalCpc = cpc(totals);
  const totalCpm = cpm(totals);
  const totalCostPerConversation = costPerConversation(totals);

  const insights = useMemo(
    () =>
      computeStrategicInsights({
        campaigns: filteredCampaigns,
        comparisonCampaigns,
        daily: dailyFiltered,
        resolvedRange: data.resolvedRange,
        partialAccountNames: data.partialAccounts.map((a) => a.name),
      }),
    [filteredCampaigns, comparisonCampaigns, dailyFiltered, data.resolvedRange, data.partialAccounts]
  );

  function focusCampaign(campaignId: string | null) {
    setCampaignIds(campaignId ? new Set([campaignId]) : new Set(campaignOptions.map((o) => o.id)));
  }

  // Never navigates to a section this client's permissions hid — the
  // sidebar already only offers visible sections, but these are also
  // reachable from cross-links (e.g. "Ver análise completa" on Overview).
  function goToSection(id: SectionId) {
    if (hiddenSectionIds.has(id)) return;
    setSection(id);
  }

  function showFlaggedCampaigns(ids: string[]) {
    if (ids.length === 0) return;
    setCampaignIds(new Set(ids));
    goToSection("campaigns");
  }

  const kpis: Array<{
    id: KpiId;
    label: string;
    value: string;
    unavailableReason?: string;
    delta?: number | null;
    deltaPolarity: DeltaPolarity;
    sparkline?: number[];
    tooltip: string;
  }> = [
    {
      id: "spend",
      label: "Investimento",
      value: formatCurrencyBRL(totals.spend),
      delta: compare && !isPending ? (comparisonTotals ? pctChange(totals.spend, comparisonTotals.spend) : null) : undefined,
      deltaPolarity: "neutral",
      sparkline: sparklineFor(dailyFiltered, "spend"),
      tooltip: "Soma do investimento de todas as campanhas que atendem aos filtros ativos. Investir mais não é, por si só, um resultado positivo ou negativo.",
    },
    {
      id: "impressions",
      label: "Impressões",
      value: formatInteger(totals.impressions),
      delta: compare && !isPending ? (comparisonTotals ? pctChange(totals.impressions, comparisonTotals.impressions) : null) : undefined,
      deltaPolarity: "neutral",
      sparkline: sparklineFor(dailyFiltered, "impressions"),
      tooltip: "Total de impressões (exibições do anúncio) somadas entre as campanhas filtradas.",
    },
    {
      id: "clicks",
      label: "Cliques",
      value: formatInteger(totals.clicks),
      delta: compare && !isPending ? (comparisonTotals ? pctChange(totals.clicks, comparisonTotals.clicks) : null) : undefined,
      deltaPolarity: "higher-better",
      sparkline: sparklineFor(dailyFiltered, "clicks"),
      tooltip: "Campo “clicks” da Meta: todo tipo de clique no anúncio, não apenas cliques no link de destino.",
    },
    {
      id: "linkClicks",
      label: "Cliques no link",
      value: formatInteger(totals.linkClicks),
      delta: compare && !isPending ? (comparisonTotals ? pctChange(totals.linkClicks, comparisonTotals.linkClicks) : null) : undefined,
      deltaPolarity: "higher-better",
      sparkline: sparklineFor(dailyFiltered, "linkClicks"),
      tooltip:
        "Campo inline_link_clicks da Meta: cliques que levam ao destino do anúncio. Não é o mesmo que uma conversa iniciada — veja o indicador “Conversa iniciada” para isso.",
    },
    {
      id: "conversations",
      label: "Conversa iniciada",
      value: totals.conversations === null ? "Não disponível" : formatInteger(totals.conversations),
      unavailableReason:
        totals.conversations === null
          ? "Nenhuma campanha filtrada reporta esta métrica (objetivo sem suporte a conversas por mensagem, ou destino incompatível)."
          : undefined,
      delta:
        compare && !isPending && totals.conversations !== null
          ? comparisonTotals
            ? comparisonTotals.conversations === null
              ? null
              : pctChange(totals.conversations, comparisonTotals.conversations)
            : null
          : undefined,
      deltaPolarity: "higher-better",
      sparkline: sparklineFor(dailyFiltered, "conversations"),
      tooltip:
        "Campo actions da Meta, action_type onsite_conversion.messaging_conversation_started_7d (atribuição de 7 dias após clique): conversas por mensagem efetivamente iniciadas. Disponível apenas para campanhas com objetivo de mensagens; “Não disponível” não significa zero.",
    },
    {
      id: "costPerConversation",
      label: "Custo/Conversa",
      value: totalCostPerConversation === null ? "—" : formatCurrencyBRL(totalCostPerConversation),
      unavailableReason:
        totalCostPerConversation === null
          ? totals.conversations === null
            ? "Conversa iniciada não disponível para os filtros atuais"
            : "Sem conversas iniciadas no período"
          : undefined,
      delta:
        compare && !isPending && totalCostPerConversation !== null
          ? comparisonTotals
            ? (() => {
                const prev = costPerConversation(comparisonTotals);
                return prev === null ? null : pctChange(totalCostPerConversation, prev);
              })()
            : null
          : undefined,
      deltaPolarity: "lower-better",
      sparkline: sparklineFor(dailyFiltered, "costPerConversation"),
      tooltip:
        "Custo por conversa iniciada = investimento total ÷ total de conversas iniciadas válidas (onsite_conversion.messaging_conversation_started_7d), usando apenas o investimento do mesmo escopo filtrado.",
    },
    {
      id: "ctr",
      label: "CTR",
      value: totalCtr === null ? "—" : formatPercent(totalCtr),
      unavailableReason: totalCtr === null ? "Sem impressões no período" : undefined,
      delta:
        compare && !isPending && totalCtr !== null
          ? comparisonTotals
            ? (() => {
                const prevCtr = ctr(comparisonTotals);
                return prevCtr === null ? null : pctChange(totalCtr, prevCtr);
              })()
            : null
          : undefined,
      deltaPolarity: "higher-better",
      sparkline: sparklineFor(dailyFiltered, "ctr"),
      tooltip: "CTR = total de cliques ÷ total de impressões × 100. Calculado sobre os totais, não pela média das taxas de cada campanha.",
    },
    {
      id: "cpc",
      label: "CPC",
      value: totalCpc === null ? "—" : formatCurrencyBRL(totalCpc),
      unavailableReason: totalCpc === null ? "Sem cliques no período" : undefined,
      delta:
        compare && !isPending && totalCpc !== null
          ? comparisonTotals
            ? (() => {
                const prevCpc = cpc(comparisonTotals);
                return prevCpc === null ? null : pctChange(totalCpc, prevCpc);
              })()
            : null
          : undefined,
      deltaPolarity: "lower-better",
      sparkline: sparklineFor(dailyFiltered, "cpc"),
      tooltip: "CPC = investimento total ÷ total de cliques.",
    },
    {
      id: "cpm",
      label: "CPM",
      value: totalCpm === null ? "—" : formatCurrencyBRL(totalCpm),
      unavailableReason: totalCpm === null ? "Sem impressões no período" : undefined,
      delta:
        compare && !isPending && totalCpm !== null
          ? comparisonTotals
            ? (() => {
                const prevCpm = cpm(comparisonTotals);
                return prevCpm === null ? null : pctChange(totalCpm, prevCpm);
              })()
            : null
          : undefined,
      deltaPolarity: "lower-better",
      sparkline: sparklineFor(dailyFiltered, "cpm"),
      tooltip: "CPM = investimento total ÷ total de impressões × 1.000.",
    },
    {
      id: "reach",
      label: "Alcance",
      value:
        totalReachOutcome.status === "ok" && totalReachOutcome.value !== null
          ? formatInteger(totalReachOutcome.value)
          : totalReachOutcome.status === "loading"
            ? "…"
            : "—",
      unavailableReason:
        totalReachOutcome.status === "loading"
          ? "Recalculando o alcance deduplicado para os filtros atuais…"
          : totalReachOutcome.status === "error"
            ? "Não foi possível apurar o alcance para esta combinação de filtros. O alcance consolidado da conta não é uma aproximação válida aqui."
            : undefined,
      delta:
        !isPending && compare && totalReachOutcome.status === "ok" && totalReachOutcome.value !== null
          ? comparisonReachOutcome.status === "ok" && comparisonReachOutcome.value !== null
            ? pctChange(totalReachOutcome.value, comparisonReachOutcome.value)
            : null
          : undefined,
      deltaPolarity: "neutral",
      // Each point here is that single day's own independent whole-account
      // reach value — never summed into the card's total above (which comes
      // from the separate, correctly-deduplicated whole-period fetch).
      // Plotting a trend this way can't double-count anyone; only adding two
      // days' numbers together would. Once a campaign filter has narrowed
      // the scope, the daily series is still whole-account-only and would
      // misrepresent the filtered total, so it's omitted rather than shown
      // as if it tracked the same number as the card above.
      sparkline: isReachNarrowed ? undefined : sparklineFor(dailyFiltered, "reach"),
      tooltip: isReachNarrowed
        ? "Pessoas únicas estimadas pela Meta para exatamente esta seleção de campanhas, recalculado a partir da origem para preservar a deduplicação — não é uma soma de alcances individuais. Ainda deduplicado apenas dentro de cada conta, não entre contas diferentes."
        : "Pessoas únicas estimadas pela Meta, somadas entre as contas selecionadas. É deduplicado dentro de cada conta, mas não entre contas diferentes — a mesma pessoa pode contar mais de uma vez se aparecer em mais de uma conta selecionada.",
    },
  ];

  // Which 4 indicators lead depends on what the filtered campaigns are
  // actually optimizing for (falls back to general delivery indicators the
  // moment objectives are mixed) — never a conversion metric presented as
  // universal. The rest stay fully visible in a smaller second row, never
  // removed, just organized by importance. Ordered by primaryKpiIds' own
  // ranking (e.g. Alcance leads for an awareness objective), not by the
  // kpis array's fixed declaration order.
  const kpisById = new Map(kpis.map((k) => [k.id, k]));
  const primaryOrder = primaryKpiIds(filteredCampaigns);
  const primaryKpis = primaryOrder.map((id) => kpisById.get(id)!).filter(Boolean);
  const primaryIds = new Set(primaryOrder);
  const secondaryKpis = kpis.filter((k) => !primaryIds.has(k.id));

  const trendCurrent = dailyFiltered;
  const trendComparison = compare ? comparisonDailyFiltered : null;

  const sectionLabel = SECTIONS.find((s) => s.id === section)?.label ?? "Legado Intelligence";
  const connectionState: "ok" | "partial" | "down" =
    data.accounts.length === 0 ? "down" : data.partialAccounts.length > 0 ? "partial" : "ok";

  return (
    <div className="flex min-h-screen bg-intel-ambient bg-intel-grid overflow-x-hidden">
      <IntelligenceSidebar
        active={section}
        onSelect={setSection}
        isAdmin={isAdmin}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
        hiddenSectionIds={hiddenSectionIds}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <IntelligenceTopBar
          sectionLabel={sectionLabel}
          clientLabel={clientLabel}
          accountsCount={data.accounts.length}
          lastSyncIso={data.generatedAt}
          connectionState={connectionState}
          onOpenMobileMenu={() => setMobileNavOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1500px] w-full mx-auto">
          {data.partialAccounts.length > 0 && (
            <div className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-300">
              {data.partialAccounts.length === 1 ? "1 conta não pôde" : `${data.partialAccounts.length} contas não puderam`}{" "}
              ser carregada(s) agora ({data.partialAccounts.map((a) => a.name).join(", ")}). Os números acima estão
              incompletos, não zerados — tente atualizar a página em instantes.
            </div>
          )}

          {error && (
            <div className="mb-5 rounded-xl border border-intel-red/25 bg-intel-red/[0.06] px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-[13px] text-intel-red" role="alert">
                {error}
              </p>
              <button
                type="button"
                onClick={() => refetch(period, compare)}
                className="shrink-0 text-[12px] tracking-[0.06em] uppercase text-intel-red hover:brightness-125 transition-[filter] duration-200"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {data.accounts.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-intel-surface-1 p-10 text-center max-w-xl mx-auto">
              <p className="font-sans text-lg font-semibold text-intel-text mb-2">Nenhuma conta de anúncios disponível</p>
              <p className="text-sm text-intel-text-dim leading-relaxed">
                Este acesso não está associado a nenhuma conta de anúncios ativa. Fale com o administrador para
                verificar as contas liberadas no Business Manager.
              </p>
            </div>
          ) : (
            <>
              <FilterBar
                accountOptions={accountOptions}
                accountIds={accountIds}
                onAccountIdsChange={setAccountIds}
                period={period}
                onPeriodChange={(p) => refetch(p, compare)}
                defaultPeriod={defaultPeriod}
                compare={compare}
                onCompareChange={(c) => refetch(period, c)}
                comparisonRange={data.comparison?.period ?? null}
                campaignOptions={campaignOptions}
                campaignIds={campaignIds}
                onCampaignIdsChange={setCampaignIds}
                adSetOptions={adSetOptions}
                adSetIds={adSetIds}
                onAdSetIdsChange={setAdSetIds}
                objectiveOptions={objectiveOptions}
                objectiveIds={objectiveIds}
                onObjectiveIdsChange={setObjectiveIds}
                statusOptions={statusOptions}
                statusIds={statusIds}
                onStatusIdsChange={setStatusIds}
                hiddenFilterIds={hiddenFilterIds}
                disabled={isPending}
              />

              {isPending && (
                <div className="mb-4 flex items-center gap-2 text-[12.5px] text-intel-text-dim" role="status" aria-live="polite">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  Atualizando dados do período selecionado...
                </div>
              )}

              <div className={`transition-opacity duration-200 ${isPending ? "opacity-60" : "opacity-100"}`}>
                {section === "overview" && (
                  <div className="space-y-5">
                    {!hiddenSectionIds.has("insights") && (
                      <m.div custom={0} initial="hidden" animate="visible" variants={fadeUp}>
                        <ExecutiveSummary insights={insights} compare={compare} />
                      </m.div>
                    )}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {primaryKpis.map((kpi, i) => (
                        <m.div key={kpi.label} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
                          <KpiCard {...kpi} size="primary" />
                        </m.div>
                      ))}
                    </div>

                    <div>
                      <p className="text-[10.5px] tracking-[0.12em] uppercase text-intel-text-dim mb-2.5">
                        Outros indicadores
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {secondaryKpis.map((kpi, i) => (
                          <m.div key={kpi.label} custom={i + 4} initial="hidden" animate="visible" variants={fadeUp}>
                            <KpiCard {...kpi} size="secondary" />
                          </m.div>
                        ))}
                      </div>
                    </div>

                    <div
                      className={
                        hiddenSectionIds.has("insights")
                          ? "grid grid-cols-1 gap-4"
                          : "grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-stretch"
                      }
                    >
                      <m.div custom={7} initial="hidden" animate="visible" variants={fadeUp}>
                        <TrendChart
                          current={trendCurrent}
                          comparison={trendComparison}
                          metric={trendMetric}
                          onMetricChange={setTrendMetric}
                        />
                      </m.div>
                      {!hiddenSectionIds.has("insights") && (
                        <m.div custom={8} initial="hidden" animate="visible" variants={fadeUp}>
                          <StrategicInsightsCompact
                            insights={insights}
                            onViewAll={() => goToSection("insights")}
                            onShowFlaggedCampaigns={showFlaggedCampaigns}
                            isProcessing={isPending}
                          />
                        </m.div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <m.div custom={9} initial="hidden" animate="visible" variants={fadeUp}>
                        <SpendDistributionChart
                          campaigns={filteredCampaigns}
                          focusedCampaignId={campaignIds.size === 1 ? [...campaignIds][0] : null}
                          onFocusCampaign={focusCampaign}
                        />
                      </m.div>
                      <m.div custom={10} initial="hidden" animate="visible" variants={fadeUp}>
                        <RankingChart campaigns={filteredCampaigns} />
                      </m.div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <m.div custom={11} initial="hidden" animate="visible" variants={fadeUp}>
                        <BreakdownAnalysis
                          title="Público por idade"
                          barColor="var(--color-intel-cyan)"
                          segments={filteredAudience}
                          bucketKey={(s) => s.age}
                          bucketLabel={unknownAsNaoInformado}
                          order={AGE_ORDER}
                          defaultMetric="conversations"
                        />
                      </m.div>
                      <m.div custom={12} initial="hidden" animate="visible" variants={fadeUp}>
                        <BreakdownAnalysis
                          title="Público por gênero"
                          barColor="var(--color-intel-violet)"
                          segments={filteredAudience}
                          bucketKey={(s) => s.gender}
                          bucketLabel={(k) => GENDER_LABEL[k] ?? k}
                          order={GENDER_ORDER}
                          defaultMetric="conversations"
                        />
                      </m.div>
                    </div>

                    <m.div custom={13} initial="hidden" animate="visible" variants={fadeUp}>
                      <BreakdownAnalysis
                        title="Público por região"
                        barColor="var(--color-intel-cyan)"
                        segments={filteredRegions}
                        bucketKey={(s) => s.region}
                        defaultMetric="reach"
                      />
                    </m.div>
                  </div>
                )}

                {section === "campaigns" && !hiddenSectionIds.has("campaigns") && (
                  <div className="space-y-5">
                    <CampaignsTable
                      campaigns={filteredCampaigns}
                      adSets={filteredAdSets}
                      ads={filteredAds}
                      comparisonByCampaignId={comparisonByCampaignId}
                      hiddenColumnIds={hiddenColumnIds}
                    />
                    <RankedEntityTable title="Conjuntos" nameLabel="Conjunto" rows={adSetRows} csvFilePrefix="conjuntos" />
                    <RankedEntityTable title="Melhores anúncios" nameLabel="Anúncio" rows={adRows} csvFilePrefix="anuncios" />
                  </div>
                )}

                {section === "insights" && !hiddenSectionIds.has("insights") && (
                  <StrategicInsightsPanel
                    insights={insights}
                    onShowFlaggedCampaigns={showFlaggedCampaigns}
                    isProcessing={isPending}
                  />
                )}

                {section === "reports" && !hiddenSectionIds.has("reports") && (
                  <ReportsPanel
                    campaigns={filteredCampaigns}
                    periodLabel={insights.periodLabel}
                    clientLabel={clientLabel}
                    isAdmin={isAdmin}
                    dbConfigured={dbConfigured}
                    period={period}
                    resolvedRange={data.resolvedRange}
                    compare={compare}
                    reachPending={reachPending}
                    accountIds={accountIds}
                    accountOptions={accountOptions}
                    campaignIds={campaignIds}
                    campaignOptions={campaignOptions}
                    adSetIds={adSetIds}
                    adSetOptions={adSetOptions}
                    objectiveIds={objectiveIds}
                    objectiveOptions={objectiveOptions}
                    statusIds={statusIds}
                    statusOptions={statusOptions}
                  />
                )}

                {section === "integrations" && !hiddenSectionIds.has("integrations") && (
                  <IntegrationsPanel
                    accountsCount={data.accounts.length}
                    partialAccountsCount={data.partialAccounts.length}
                    generatedAt={data.generatedAt}
                    dbConfigured={dbConfigured}
                    isInternal={isInternal}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
