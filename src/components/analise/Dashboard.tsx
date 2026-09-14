"use client";

import { useMemo, useState, useTransition } from "react";
import { m, type Variants } from "framer-motion";
import type { CampaignInsight, DashboardData, DailyMetrics, Period } from "@/lib/meta-ads-types";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { sumTotals, ctr, cpc, cpm, pctChange } from "@/lib/metrics";
import { computeStrategicInsights } from "@/lib/strategic-insights";
import IntelligenceSidebar, { SECTIONS, type SectionId } from "./IntelligenceSidebar";
import IntelligenceTopBar from "./IntelligenceTopBar";
import FilterBar from "./FilterBar";
import KpiCard from "./KpiCard";
import TrendChart, { type TrendMetric } from "./TrendChart";
import SpendDistributionChart from "./SpendDistributionChart";
import RankingChart from "./RankingChart";
import CampaignsTable from "./CampaignsTable";
import StrategicInsightsPanel from "./StrategicInsightsPanel";
import StrategicInsightsCompact from "./StrategicInsightsCompact";
import ReportsPanel from "./ReportsPanel";
import IntegrationsPanel from "./IntegrationsPanel";

type DashboardProps = {
  initialData: DashboardData;
  isAdmin: boolean;
  clientLabel: string | null;
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

const NONE_KEY = "__none__";

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

function aggregateDaily(daily: DailyMetrics[], accountIds: Set<string>) {
  const byDate = new Map<string, { spend: number; impressions: number; clicks: number }>();
  for (const row of daily) {
    if (!accountIds.has(row.accountId)) continue;
    const entry = byDate.get(row.date) ?? { spend: 0, impressions: 0, clicks: 0 };
    entry.spend += row.spend;
    entry.impressions += row.impressions;
    entry.clicks += row.clicks;
    byDate.set(row.date, entry);
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sparklineFor(daily: { spend: number; impressions: number; clicks: number }[], metric: "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm") {
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
    }
  });
}

export default function Dashboard({ initialData, isAdmin, clientLabel, dbConfigured }: DashboardProps) {
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
  const [objectiveIds, setObjectiveIds] = useState(
    () => new Set(initialData.campaigns.map((c) => c.objective ?? NONE_KEY))
  );
  const [statusIds, setStatusIds] = useState<Set<string>>(() => new Set(initialData.campaigns.map((c) => c.status)));

  const defaultPeriod: Period = initialData.period;

  function resetFilters(nextData: DashboardData) {
    setAccountIds(allIds(nextData.accounts.map((a) => ({ id: a.id }))));
    setCampaignIds(new Set(nextData.campaigns.map((c) => c.campaignId)));
    setObjectiveIds(new Set(nextData.campaigns.map((c) => c.objective ?? NONE_KEY)));
    setStatusIds(new Set(nextData.campaigns.map((c) => c.status)));
  }

  function refetch(nextPeriod: Period, nextCompare: boolean) {
    setPeriod(nextPeriod);
    setCompare(nextCompare);
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (nextPeriod.kind === "preset") {
          params.set("date_preset", nextPeriod.preset);
        } else {
          params.set("since", nextPeriod.range.since);
          params.set("until", nextPeriod.range.until);
        }
        if (nextCompare) params.set("compare", "1");

        const res = await fetch(`/api/meta-ads/campaigns/?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? "Não foi possível carregar os dados.");
          return;
        }
        const nextData = (await res.json()) as DashboardData;
        setData(nextData);
        resetFilters(nextData);
      } catch {
        setError("Falha de conexão ao buscar os dados.");
      }
    });
  }

  const accountOptions = useMemo(() => data.accounts.map((a) => ({ id: a.id, label: a.name })), [data.accounts]);
  const campaignOptions = useMemo(
    () => uniqueOptions(data.campaigns, (c) => c.campaignId, (c) => c.campaignName),
    [data.campaigns]
  );
  const objectiveOptions = useMemo(
    () => uniqueOptions(data.campaigns, (c) => c.objective ?? NONE_KEY, (c) => objectiveLabel(c.objective)),
    [data.campaigns]
  );
  const statusOptions = useMemo(
    () => uniqueOptions(data.campaigns, (c) => c.status, (c) => statusLabel(c.status)),
    [data.campaigns]
  );

  const filteredCampaigns = useMemo(
    () =>
      data.campaigns.filter(
        (c) =>
          accountIds.has(c.accountId) &&
          campaignIds.has(c.campaignId) &&
          objectiveIds.has(c.objective ?? NONE_KEY) &&
          statusIds.has(c.status)
      ),
    [data.campaigns, accountIds, campaignIds, objectiveIds, statusIds]
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

  const dailyFiltered = useMemo(() => aggregateDaily(data.daily, accountIds), [data.daily, accountIds]);
  const comparisonDailyFiltered = useMemo(
    () => (data.comparison ? aggregateDaily(data.comparison.daily, accountIds) : null),
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
  // again for every campaign or day that reached them.
  const totalReach = useMemo(
    () =>
      data.accountReach.filter((r) => accountIds.has(r.accountId)).reduce((sum, r) => sum + r.reach, 0),
    [data.accountReach, accountIds]
  );
  const comparisonReach = useMemo(
    () =>
      data.comparison
        ? data.comparison.accountReach.filter((r) => accountIds.has(r.accountId)).reduce((sum, r) => sum + r.reach, 0)
        : null,
    [data.comparison, accountIds]
  );

  const totalCtr = ctr(totals);
  const totalCpc = cpc(totals);
  const totalCpm = cpm(totals);

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

  function showFlaggedCampaigns(ids: string[]) {
    if (ids.length === 0) return;
    setCampaignIds(new Set(ids));
    setSection("campaigns");
  }

  const kpis = [
    {
      label: "Investimento",
      value: formatCurrencyBRL(totals.spend),
      delta: compare ? (comparisonTotals ? pctChange(totals.spend, comparisonTotals.spend) : null) : undefined,
      sparkline: sparklineFor(dailyFiltered, "spend"),
      tooltip: "Soma do investimento de todas as campanhas que atendem aos filtros ativos.",
    },
    {
      label: "Impressões",
      value: formatInteger(totals.impressions),
      delta: compare ? (comparisonTotals ? pctChange(totals.impressions, comparisonTotals.impressions) : null) : undefined,
      sparkline: sparklineFor(dailyFiltered, "impressions"),
      tooltip: "Total de impressões (exibições do anúncio) somadas entre as campanhas filtradas.",
    },
    {
      label: "Cliques",
      value: formatInteger(totals.clicks),
      delta: compare ? (comparisonTotals ? pctChange(totals.clicks, comparisonTotals.clicks) : null) : undefined,
      sparkline: sparklineFor(dailyFiltered, "clicks"),
      tooltip: "Campo “clicks” da Meta: todo tipo de clique no anúncio, não apenas cliques no link de destino.",
    },
    {
      label: "CTR",
      value: totalCtr === null ? "—" : formatPercent(totalCtr),
      unavailableReason: totalCtr === null ? "Sem impressões no período" : undefined,
      delta:
        compare && totalCtr !== null
          ? comparisonTotals
            ? (() => {
                const prevCtr = ctr(comparisonTotals);
                return prevCtr === null ? null : pctChange(totalCtr, prevCtr);
              })()
            : null
          : undefined,
      sparkline: sparklineFor(dailyFiltered, "ctr"),
      tooltip: "CTR = total de cliques ÷ total de impressões × 100. Calculado sobre os totais, não pela média das taxas de cada campanha.",
    },
    {
      label: "CPC",
      value: totalCpc === null ? "—" : formatCurrencyBRL(totalCpc),
      unavailableReason: totalCpc === null ? "Sem cliques no período" : undefined,
      delta:
        compare && totalCpc !== null
          ? comparisonTotals
            ? (() => {
                const prevCpc = cpc(comparisonTotals);
                return prevCpc === null ? null : pctChange(totalCpc, prevCpc);
              })()
            : null
          : undefined,
      sparkline: sparklineFor(dailyFiltered, "cpc"),
      tooltip: "CPC = investimento total ÷ total de cliques.",
    },
    {
      label: "CPM",
      value: totalCpm === null ? "—" : formatCurrencyBRL(totalCpm),
      unavailableReason: totalCpm === null ? "Sem impressões no período" : undefined,
      delta:
        compare && totalCpm !== null
          ? comparisonTotals
            ? (() => {
                const prevCpm = cpm(comparisonTotals);
                return prevCpm === null ? null : pctChange(totalCpm, prevCpm);
              })()
            : null
          : undefined,
      sparkline: sparklineFor(dailyFiltered, "cpm"),
      tooltip: "CPM = investimento total ÷ total de impressões × 1.000.",
    },
    {
      label: "Alcance",
      value: formatInteger(totalReach),
      delta: compare ? (comparisonReach !== null ? pctChange(totalReach, comparisonReach) : null) : undefined,
      tooltip:
        "Pessoas únicas estimadas pela Meta, somadas entre as contas selecionadas. É deduplicado dentro de cada conta, mas não entre contas diferentes — a mesma pessoa pode contar mais de uma vez se aparecer em mais de uma conta selecionada.",
    },
  ];

  const trendCurrent = dailyFiltered;
  const trendComparison = compare ? comparisonDailyFiltered : null;

  const sectionLabel = SECTIONS.find((s) => s.id === section)?.label ?? "Legado Intelligence";
  const connectionState: "ok" | "partial" | "down" =
    data.accounts.length === 0 ? "down" : data.partialAccounts.length > 0 ? "partial" : "ok";

  return (
    <div className="flex min-h-screen bg-intel-ambient bg-intel-grid">
      <IntelligenceSidebar
        active={section}
        onSelect={setSection}
        isAdmin={isAdmin}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
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
                campaignOptions={campaignOptions}
                campaignIds={campaignIds}
                onCampaignIdsChange={setCampaignIds}
                objectiveOptions={objectiveOptions}
                objectiveIds={objectiveIds}
                onObjectiveIdsChange={setObjectiveIds}
                statusOptions={statusOptions}
                statusIds={statusIds}
                onStatusIdsChange={setStatusIds}
                disabled={isPending}
              />

              <div className={`transition-opacity duration-200 ${isPending ? "opacity-60" : "opacity-100"}`}>
                {section === "overview" && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
                      {kpis.map((kpi, i) => (
                        <m.div key={kpi.label} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
                          <KpiCard {...kpi} />
                        </m.div>
                      ))}
                    </div>

                    <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-stretch">
                      <m.div custom={7} initial="hidden" animate="visible" variants={fadeUp}>
                        <TrendChart
                          current={trendCurrent}
                          comparison={trendComparison}
                          metric={trendMetric}
                          onMetricChange={setTrendMetric}
                        />
                      </m.div>
                      <m.div custom={8} initial="hidden" animate="visible" variants={fadeUp}>
                        <StrategicInsightsCompact
                          insights={insights}
                          onViewAll={() => setSection("insights")}
                          onShowFlaggedCampaigns={showFlaggedCampaigns}
                          isProcessing={isPending}
                        />
                      </m.div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-4">
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
                  </div>
                )}

                {section === "campaigns" && (
                  <CampaignsTable
                    campaigns={filteredCampaigns}
                    comparisonByCampaignId={comparisonByCampaignId}
                    period={period}
                  />
                )}

                {section === "insights" && (
                  <StrategicInsightsPanel
                    insights={insights}
                    onShowFlaggedCampaigns={showFlaggedCampaigns}
                    isProcessing={isPending}
                  />
                )}

                {section === "reports" && (
                  <ReportsPanel campaigns={filteredCampaigns} periodLabel={insights.periodLabel} />
                )}

                {section === "integrations" && (
                  <IntegrationsPanel
                    accountsCount={data.accounts.length}
                    partialAccountsCount={data.partialAccounts.length}
                    generatedAt={data.generatedAt}
                    dbConfigured={dbConfigured}
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
