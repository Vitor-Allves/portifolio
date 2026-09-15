"use client";

import { useMemo, useState } from "react";
import type { CampaignInsight } from "@/lib/meta-ads-types";
import { objectiveLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatCompactNumber, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation } from "@/lib/metrics";

type RankingMetric = "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "linkClicks" | "costPerConversation";

const METRICS: { id: RankingMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques" },
  { id: "linkClicks", label: "Conversa iniciada" },
  { id: "costPerConversation", label: "Custo/Conversa" },
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
    case "linkClicks":
      return c.linkClicks;
    case "costPerConversation":
      return costPerConversation(c);
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
    case "costPerConversation":
      return formatCurrencyBRL(value);
    case "impressions":
    case "clicks":
    case "linkClicks":
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
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-[13px] font-medium text-intel-text">Ranking de campanhas</h3>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Selecionar métrica do ranking">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metric === m.id}
              onClick={() => setMetric(m.id)}
              className={`text-[11.5px] px-3 py-1.5 rounded-full transition-colors duration-200 ${
                metric === m.id ? "bg-intel-cyan/[0.14] text-intel-cyan" : "text-intel-text-dim hover:bg-white/[0.05] hover:text-intel-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {objectiveOptions.length > 1 && (
        <div className="mb-4">
          <label htmlFor="ranking-objective" className="block text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim mb-1.5">
            Comparar dentro do mesmo objetivo
          </label>
          <select
            id="ranking-objective"
            value={objectiveFilter}
            onChange={(e) => setObjectiveFilter(e.target.value)}
            className="w-full max-w-full sm:w-auto rounded-lg border border-white/10 bg-intel-surface-2 px-3 py-1.5 text-[13px] text-intel-text focus:border-intel-cyan/50 focus:outline-none transition-colors duration-200 [color-scheme:dark]"
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
        <p className="text-sm text-intel-text-dim">Sem campanhas com esse indicador disponível no período.</p>
      ) : (
        <ol className="space-y-3">
          {ranked.map((row, i) => (
            <li key={row.campaign.campaignId} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-[12px] tabular-nums text-intel-text-dim">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="min-w-0 truncate text-[13px] text-intel-text-dim">
                    {row.campaign.campaignName}
                    {objectiveFilter === "all" && (
                      <span className="ml-2 text-[10px] tracking-[0.04em] uppercase text-intel-text-dim/70">
                        {objectiveLabel(row.campaign.objective)}
                      </span>
                    )}
                  </span>
                  <span className="text-[13px] tabular-nums text-intel-text shrink-0">{formatValue(row.value, metric)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max((row.value / maxValue) * 100, 2)}%`, backgroundColor: "var(--color-intel-violet)" }}
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
