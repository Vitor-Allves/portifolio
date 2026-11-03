"use client";

import { useEffect, useMemo, useState } from "react";
import type { Period } from "@/lib/meta-ads-types";
import type { GoogleAdsDashboardData, GoogleCampaignInsight, GoogleDailyMetrics } from "@/lib/google-ads-types";
import { GOOGLE_CHANNEL_LABEL } from "@/lib/google-ads-types";
import { statusLabel, buildDisplayNameMap } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { pctChange } from "@/lib/metrics";
import KpiCard, { type DeltaPolarity } from "./KpiCard";
import TrendChart, { type TrendMetric, type TrendPoint } from "./TrendChart";
import MultiSelectFilter from "./MultiSelectFilter";
import PeriodFilter from "./PeriodFilter";
import ComparisonToggle from "./ComparisonToggle";
import { MascotTabBanner, MascotState } from "./Mascot";

class GoogleAdsFetchError extends Error {}

async function fetchGoogleAdsData(period: Period, compare: boolean): Promise<GoogleAdsDashboardData> {
  const params = new URLSearchParams();
  if (period.kind === "preset") {
    params.set("date_preset", period.preset);
  } else {
    params.set("since", period.range.since);
    params.set("until", period.range.until);
  }
  if (compare) params.set("compare", "1");

  const res = await fetch(`/api/google-ads/campaigns/?${params.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new GoogleAdsFetchError(body?.error ?? "Não foi possível carregar os dados do Google Ads.");
  }
  return (await res.json()) as GoogleAdsDashboardData;
}

const TREND_METRICS: { id: TrendMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques" },
  { id: "conversations", label: "Conversões" },
  { id: "costPerConversation", label: "Custo/Conversão" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
  { id: "cpm", label: "CPM" },
];

type Totals = { spend: number; impressions: number; clicks: number; conversions: number; conversionsValue: number };

function sumTotals(rows: { spend: number; impressions: number; clicks: number; conversions: number; conversionsValue: number }[]): Totals {
  return rows.reduce(
    (t, r) => ({
      spend: t.spend + r.spend,
      impressions: t.impressions + r.impressions,
      clicks: t.clicks + r.clicks,
      conversions: t.conversions + r.conversions,
      conversionsValue: t.conversionsValue + r.conversionsValue,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 }
  );
}

/** Google's conversions are fractional under data-driven attribution — show up to 2 decimals instead of silently rounding "12,5" to "13". */
function formatConversions(n: number): string {
  return Number.isInteger(n) ? formatInteger(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Google omits days with no delivery at all; the chart needs every day of the range, zeros included, so a gap reads as "nothing happened" rather than a missing point. */
function dailySeries(daily: GoogleDailyMetrics[], since: string, until: string): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  for (const d of daily) {
    const entry = byDate.get(d.date) ?? { date: d.date, spend: 0, impressions: 0, clicks: 0, linkClicks: 0, conversations: 0 };
    entry.spend += d.spend;
    entry.impressions += d.impressions;
    entry.clicks += d.clicks;
    entry.linkClicks += d.clicks;
    entry.conversations = (entry.conversations ?? 0) + d.conversions;
    byDate.set(d.date, entry);
  }
  const points: TrendPoint[] = [];
  const cursor = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    points.push(byDate.get(date) ?? { date, spend: 0, impressions: 0, clicks: 0, linkClicks: 0, conversations: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

type GoogleAdsPanelProps = {
  period: Period;
  compare: boolean;
  onPeriodChange: (period: Period) => void;
  onCompareChange: (compare: boolean) => void;
  /** Internal Legado viewer — sees raw campaign names and setup instructions; a client sees cleaned names and a plain "not available" message. */
  isInternal: boolean;
  hideCompare: boolean;
};

export default function GoogleAdsPanel({ period, compare, onPeriodChange, onCompareChange, isInternal, hideCompare }: GoogleAdsPanelProps) {
  const [data, setData] = useState<GoogleAdsDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [accountIds, setAccountIds] = useState<Set<string> | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("spend");

  const effectiveCompare = compare && !hideCompare;
  const periodKey = period.kind === "preset" ? period.preset : `${period.range.since}_${period.range.until}`;
  const requestKey = `${periodKey}|${effectiveCompare ? 1 : 0}|${reloadKey}`;
  // Derived rather than set at the top of the effect: loading is simply
  // "the latest request hasn't settled yet".
  const loading = settledKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    fetchGoogleAdsData(period, effectiveCompare)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
        // Keep the account selection across period changes, dropping only
        // ids that no longer exist; first load selects everything.
        setAccountIds((prev) => {
          const available = new Set(next.accounts.map((a) => a.id));
          if (!prev) return available;
          const kept = new Set([...prev].filter((id) => available.has(id)));
          return kept.size > 0 ? kept : available;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof GoogleAdsFetchError ? err.message : "Falha de conexão ao buscar os dados do Google Ads.");
      })
      .finally(() => {
        if (!cancelled) setSettledKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [period, effectiveCompare, requestKey]);

  const selected = useMemo(() => accountIds ?? new Set(data?.accounts.map((a) => a.id) ?? []), [accountIds, data]);

  const campaigns = useMemo(() => {
    const rows = (data?.campaigns ?? []).filter((c) => selected.has(c.accountId));
    if (isInternal) return rows;
    const names = buildDisplayNameMap(rows.map((c) => ({ id: c.campaignId, rawName: c.campaignName, objective: null, accountName: c.accountName })));
    return rows.map((c) => ({ ...c, campaignName: names.get(c.campaignId) ?? c.campaignName }));
  }, [data, selected, isInternal]);

  const comparisonCampaigns = useMemo(
    () => (data?.comparison?.campaigns ?? []).filter((c) => selected.has(c.accountId)),
    [data, selected]
  );

  const trendCurrent = useMemo(
    () => (data ? dailySeries(data.daily.filter((d) => selected.has(d.accountId)), data.resolvedRange.since, data.resolvedRange.until) : []),
    [data, selected]
  );
  const trendComparison = useMemo(
    () =>
      data?.comparison
        ? dailySeries(data.comparison.daily.filter((d) => selected.has(d.accountId)), data.comparison.period.since, data.comparison.period.until)
        : null,
    [data, selected]
  );

  const banner = (
    <MascotTabBanner
      pose="titan-indicadores"
      alt="Titan, mascote da Legado, apresentando os indicadores do Google Ads"
      title="Google Ads"
      description="Investimento, cliques e conversões das campanhas no Google (Pesquisa, Performance Max, YouTube e Display)."
    />
  );

  if (loading && !data) {
    return (
      <div className="space-y-5">
        {banner}
        <MascotState pose="titan-carregando" alt="Titan, mascote da Legado, carregando os dados" message="Carregando os dados do Google Ads..." className="py-10" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-5">
        {banner}
        <div className="rounded-xl border border-intel-red/25 bg-intel-red/[0.06] px-4">
          <MascotState
            pose="titan-duvida"
            alt="Titan, mascote da Legado, em dúvida após uma falha ao carregar os dados"
            tone="error"
            message={error ?? "Não foi possível carregar os dados do Google Ads."}
            action={
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="text-[12px] tracking-[0.06em] uppercase text-intel-red hover:brightness-125 transition-[filter] duration-200"
              >
                Tentar novamente
              </button>
            }
            className="py-5"
          />
        </div>
      </div>
    );
  }

  if (!data.configured || data.accounts.length === 0) {
    return (
      <div className="space-y-5">
        {banner}
        <div className="rounded-2xl border border-white/[0.08] bg-intel-surface-1 p-8 max-w-xl">
          <p className="font-sans text-lg font-semibold text-intel-text mb-2">
            {!data.configured ? "Google Ads ainda não conectado" : "Nenhuma conta do Google Ads disponível"}
          </p>
          <p className="text-sm text-intel-text-dim leading-relaxed">
            {!data.configured
              ? isInternal
                ? "Cadastre as variáveis GOOGLE_ADS_* no Vercel seguindo o passo a passo em docs/google-ads-setup.md e faça um novo deploy."
                : "Os dados do Google Ads ainda não estão disponíveis para este acesso. Fale com o seu consultor da Legado."
              : isInternal
                ? "As credenciais estão configuradas, mas nenhuma conta do Google Ads está liberada para este acesso. Vincule as contas em Usuários e acessos."
                : "Nenhuma conta do Google Ads está vinculada a este acesso. Fale com o seu consultor da Legado."}
          </p>
        </div>
      </div>
    );
  }

  const totals = sumTotals(campaigns);
  const prevTotals = data.comparison ? sumTotals(comparisonCampaigns) : null;
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : null;
  const costPerConversion = totals.conversions > 0 ? totals.spend / totals.conversions : null;
  const prevCtr = prevTotals && prevTotals.impressions > 0 ? (prevTotals.clicks / prevTotals.impressions) * 100 : null;
  const prevCpc = prevTotals && prevTotals.clicks > 0 ? prevTotals.spend / prevTotals.clicks : null;
  const prevCostPerConversion = prevTotals && prevTotals.conversions > 0 ? prevTotals.spend / prevTotals.conversions : null;

  // undefined = comparison off; null = no usable baseline (KpiCard's own contract).
  const delta = (current: number | null, previous: number | null | undefined) => {
    if (!prevTotals) return undefined;
    if (current === null || previous === null || previous === undefined) return null;
    return pctChange(current, previous);
  };

  const kpis: { label: string; value: string; delta?: number | null; polarity: DeltaPolarity; tooltip: string }[] = [
    { label: "Investimento", value: formatCurrencyBRL(totals.spend), delta: delta(totals.spend, prevTotals?.spend), polarity: "neutral", tooltip: "Custo total das campanhas do Google Ads no período." },
    { label: "Impressões", value: formatInteger(totals.impressions), delta: delta(totals.impressions, prevTotals?.impressions), polarity: "higher-better", tooltip: "Quantas vezes os anúncios foram exibidos." },
    { label: "Cliques", value: formatInteger(totals.clicks), delta: delta(totals.clicks, prevTotals?.clicks), polarity: "higher-better", tooltip: "Cliques nos anúncios." },
    {
      label: "Conversões",
      value: formatConversions(totals.conversions),
      delta: delta(totals.conversions, prevTotals?.conversions),
      polarity: "higher-better",
      tooltip: "Conversões das ações marcadas como principais na conta do Google Ads (podem ser fracionadas pela atribuição baseada em dados).",
    },
    {
      label: "Custo por conversão",
      value: costPerConversion === null ? "—" : formatCurrencyBRL(costPerConversion),
      delta: delta(costPerConversion, prevCostPerConversion),
      polarity: "lower-better",
      tooltip: "Investimento ÷ conversões.",
    },
    { label: "CTR", value: ctr === null ? "—" : formatPercent(ctr), delta: delta(ctr, prevCtr), polarity: "higher-better", tooltip: "Cliques ÷ impressões." },
    { label: "CPC médio", value: cpc === null ? "—" : formatCurrencyBRL(cpc), delta: delta(cpc, prevCpc), polarity: "lower-better", tooltip: "Investimento ÷ cliques." },
  ];
  if (totals.conversionsValue > 0 || (prevTotals?.conversionsValue ?? 0) > 0) {
    kpis.push({
      label: "Valor de conversão",
      value: formatCurrencyBRL(totals.conversionsValue),
      delta: delta(totals.conversionsValue, prevTotals?.conversionsValue),
      polarity: "higher-better",
      tooltip: "Valor atribuído às conversões (ex.: vendas) na conta do Google Ads.",
    });
  }

  const accountOptions = data.accounts.map((a) => ({ id: a.id, label: a.name }));
  const ranked = [...campaigns].sort((a, b) => b.spend - a.spend);

  return (
    <div className="space-y-5">
      {banner}

      <div className="flex flex-wrap items-center gap-2">
        {accountOptions.length > 1 && (
          <MultiSelectFilter
            placeholder="Todas as contas"
            allLabel="Todas as contas"
            options={accountOptions}
            selectedIds={selected}
            onChange={setAccountIds}
            disabled={loading}
            searchable={accountOptions.length > 8}
          />
        )}
        <PeriodFilter value={period} onChange={onPeriodChange} disabled={loading} />
        {!hideCompare && <ComparisonToggle checked={compare} onChange={onCompareChange} disabled={loading} />}
        {loading && <span className="text-[12.5px] text-intel-text-dim" role="status">Atualizando...</span>}
      </div>

      {data.partialAccounts.length > 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-300">
          {data.partialAccounts.length === 1 ? "1 conta não pôde" : `${data.partialAccounts.length} contas não puderam`} ser carregada(s)
          agora ({data.partialAccounts.map((a) => a.name).join(", ")}). Os números estão incompletos, não zerados — tente
          atualizar em instantes.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-intel-red/25 bg-intel-red/[0.06] px-4 py-3 text-[13px] text-intel-red" role="alert">
          {error}
        </div>
      )}

      <div className={`space-y-5 transition-opacity duration-200 ${loading ? "opacity-60" : "opacity-100"}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              delta={kpi.delta}
              deltaPolarity={kpi.polarity}
              tooltip={kpi.tooltip}
              size="secondary"
            />
          ))}
        </div>

        <TrendChart
          current={trendCurrent}
          comparison={trendComparison}
          metric={trendMetric}
          onMetricChange={setTrendMetric}
          metricOptions={TREND_METRICS}
        />

        <CampaignTable campaigns={ranked} />
      </div>
    </div>
  );
}

function CampaignTable({ campaigns }: { campaigns: GoogleCampaignInsight[] }) {
  if (campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <p className="text-sm text-intel-text-dim">Nenhuma campanha do Google Ads com entrega no período selecionado.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-[13px] font-medium text-intel-text">Campanhas</h3>
        <p className="text-[12px] text-intel-text-dim mt-0.5">Ordenadas por investimento no período.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim border-b border-white/[0.06]">
              <th className="px-5 py-2.5 font-medium">Campanha</th>
              <th className="px-3 py-2.5 font-medium">Tipo</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium text-right">Investimento</th>
              <th className="px-3 py-2.5 font-medium text-right">Impressões</th>
              <th className="px-3 py-2.5 font-medium text-right">Cliques</th>
              <th className="px-3 py-2.5 font-medium text-right">CTR</th>
              <th className="px-3 py-2.5 font-medium text-right">CPC</th>
              <th className="px-3 py-2.5 font-medium text-right">Conversões</th>
              <th className="px-5 py-2.5 font-medium text-right">Custo/conv.</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={`${c.accountId}:${c.campaignId}`} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                <td className="px-5 py-2.5 text-intel-text max-w-[320px] truncate" title={c.campaignName}>
                  {c.campaignName}
                </td>
                <td className="px-3 py-2.5 text-intel-text-dim whitespace-nowrap">{c.channelType ? GOOGLE_CHANNEL_LABEL[c.channelType] ?? c.channelType : "—"}</td>
                <td className="px-3 py-2.5 text-intel-text-dim whitespace-nowrap">{statusLabel(c.status)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-intel-text">{formatCurrencyBRL(c.spend)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-intel-text">{formatInteger(c.impressions)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-intel-text">{formatInteger(c.clicks)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-intel-text">{c.impressions > 0 ? formatPercent((c.clicks / c.impressions) * 100) : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-intel-text">{c.clicks > 0 ? formatCurrencyBRL(c.spend / c.clicks) : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-intel-text">{formatConversions(c.conversions)}</td>
                <td className="px-5 py-2.5 text-right tabular-nums text-intel-text">{c.conversions > 0 ? formatCurrencyBRL(c.spend / c.conversions) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
