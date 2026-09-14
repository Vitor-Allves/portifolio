"use client";

import { useState } from "react";
import type { CampaignInsight } from "@/lib/meta-ads-types";
import { formatCurrencyBRL } from "@/lib/format";

type SpendDistributionChartProps = {
  campaigns: CampaignInsight[];
  focusedCampaignId: string | null;
  onFocusCampaign: (campaignId: string | null) => void;
};

const MAX_ROWS = 7;
// Single-series magnitude comparison across nominal categories (campaign
// names) — per the dataviz method this takes one hue, not the 8-slot
// categorical ramp (that's reserved for charts that overlay several series
// at once). Brand navy doubles as that one hue here.
const BAR_COLOR = "var(--color-navy-700)";

export default function SpendDistributionChart({
  campaigns,
  focusedCampaignId,
  onFocusCampaign,
}: SpendDistributionChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
        <p className="text-sm text-navy-500">Nenhuma campanha com investimento no período.</p>
      </div>
    );
  }

  const top = campaigns.slice(0, MAX_ROWS);
  const rest = campaigns.slice(MAX_ROWS);
  const restSpend = rest.reduce((sum, c) => sum + c.spend, 0);

  const rows = [
    ...top.map((c) => ({ id: c.campaignId, label: c.campaignName, spend: c.spend, clickable: true })),
    ...(rest.length > 0
      ? [{ id: null, label: `Outras campanhas (${rest.length})`, spend: restSpend, clickable: false }]
      : []),
  ];

  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  return (
    <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-navy-950">Investimento por campanha</h3>
        {focusedCampaignId && (
          <button
            type="button"
            onClick={() => onFocusCampaign(null)}
            className="text-[11px] tracking-[0.06em] uppercase text-navy-500 hover:text-navy-950 transition-colors"
          >
            Limpar seleção
          </button>
        )}
      </div>
      <ul className="space-y-3">
        {rows.map((row, i) => {
          const widthPct = Math.max((row.spend / maxSpend) * 100, 2);
          const isHovered = hovered === i;
          const isFocused = row.id !== null && row.id === focusedCampaignId;
          return (
            <li key={row.id ?? row.label}>
              <div
                role={row.clickable ? "button" : "img"}
                tabIndex={0}
                aria-pressed={row.clickable ? isFocused : undefined}
                aria-label={`${row.label}: ${formatCurrencyBRL(row.spend)}`}
                onClick={row.clickable ? () => onFocusCampaign(isFocused ? null : row.id) : undefined}
                onKeyDown={
                  row.clickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onFocusCampaign(isFocused ? null : row.id);
                        }
                      }
                    : undefined
                }
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                className={`group outline-none w-full text-left ${row.clickable ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span
                    className={`text-[13px] truncate transition-colors ${
                      isHovered || isFocused ? "text-navy-950" : "text-navy-700"
                    }`}
                  >
                    {row.label}
                  </span>
                  <span className="text-[13px] tabular-nums text-navy-950 shrink-0">
                    {formatCurrencyBRL(row.spend)}
                  </span>
                </div>
                <div className="h-5 rounded-r bg-silver-100 focus-visible:ring-2 focus-visible:ring-navy-600">
                  <div
                    className={`h-full rounded-r-[4px] transition-[width,opacity] duration-300 ${
                      isHovered || isFocused ? "opacity-100" : "opacity-90"
                    }`}
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: BAR_COLOR,
                      outline: isFocused ? "2px solid var(--color-navy-950)" : undefined,
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {top.length > 0 && (
        <p className="mt-4 text-[11px] text-navy-400">Clique em uma campanha para filtrar o restante do painel por ela.</p>
      )}
    </div>
  );
}
