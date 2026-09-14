"use client";

import { useMemo, useState } from "react";
import type { CampaignInsight } from "@/lib/meta-ads-types";
import { objectiveLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatCompactNumber, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm } from "@/lib/metrics";

type RankingMetric = "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm";

const METRICS: { id: RankingMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
  { id: "cpm", label: "CPM" },
];

function rankingValue(c: CampaignInsight, metric: RankingMetric): number | null {
  switch (metric) {
    case "spend":
      return c.spend;
    case "impressions":
      return c.impressions;
    case "clicks":
      return c.clicks;
    case "ctr":
      return ctr(c);
    case "cpc":
      return cpc(c);
    case "cpm":
      return cpm(c);
  }
}

function formatValue(value: number, metric: RankingMetric): string {
  switch (metric) {
    case "spend":
    case "cpc":
    case "cpm":
      return formatCurrencyBRL(value);
    case "impressions":
    case "clicks":
      return formatCompactNumber(value);
    case "ctr":
      return formatPercent(value);
  }
}

type RankingChartProps = { campaigns: CampaignInsight[] };

const MAX_ROWS = 8;

export default function RankingChart({ campaigns }: RankingChartProps) {
  const [metric, setMetric] = useState<RankingMetric>("spend");
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");

  const objectiveOptions = useMemo(() => {
    const set = new Set(campaigns.map((c) => c.objective ?? "__none__"));
    return [...set];
  }, [campaigns]);

  const scoped = objectiveFilter === "all" ? campaigns : campaigns.filter((c) => (c.objective ?? "__none__") === objectiveFilter);

  const ranked = useMemo(() => {
    return scoped
      .map((c) => ({ campaign: c, value: rankingValue(c, metric) }))
      .filter((r): r is { campaign: CampaignInsight; value: number } => r.value !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_ROWS);
  }, [scoped, metric]);

  const maxValue = Math.max(...ranked.map((r) => r.value), 1);

  return (
    <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-medium text-navy-950">Ranking de campanhas</h3>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Selecionar métrica do ranking">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metric === m.id}
              onClick={() => setMetric(m.id)}
              className={`text-[12px] px-3 py-1.5 rounded-full transition-colors duration-150 ${
                metric === m.id ? "bg-navy-950 text-white" : "text-navy-600 hover:bg-silver-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {objectiveOptions.length > 1 && (
        <div className="mb-4">
          <label htmlFor="ranking-objective" className="block text-[11px] tracking-[0.08em] uppercase text-navy-500 mb-1.5">
            Comparar dentro do mesmo objetivo
          </label>
          <select
            id="ranking-objective"
            value={objectiveFilter}
            onChange={(e) => setObjectiveFilter(e.target.value)}
            className="rounded-lg border border-navy-700/20 bg-white px-3 py-1.5 text-[13px] text-navy-800 focus:border-navy-600 focus:outline-none"
          >
            <option value="all">Todos os objetivos (mostrando o objetivo de cada campanha)</option>
            {objectiveOptions.map((o) => (
              <option key={o} value={o}>
                {objectiveLabel(o === "__none__" ? null : o)}
              </option>
            ))}
          </select>
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="text-sm text-navy-500">Sem campanhas com esse indicador disponível no período.</p>
      ) : (
        <ol className="space-y-3">
          {ranked.map((row, i) => (
            <li key={row.campaign.campaignId} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-[12px] tabular-nums text-navy-400">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-[13px] truncate text-navy-700">
                    {row.campaign.campaignName}
                    {objectiveFilter === "all" && (
                      <span className="ml-2 text-[10px] tracking-[0.04em] uppercase text-navy-400">
                        {objectiveLabel(row.campaign.objective)}
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] tabular-nums text-navy-950 shrink-0">{formatValue(row.value, metric)}</span>
                </div>
                <div className="h-2 rounded-full bg-silver-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max((row.value / maxValue) * 100, 2)}%`, backgroundColor: "var(--color-navy-700)" }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
