"use client";

import { useState } from "react";
import type { StrategicInsights, InsightItem } from "@/lib/strategic-insights";

type TabId = "summary" | "attention" | "opportunities" | "actions";

const TABS: { id: TabId; label: string }[] = [
  { id: "summary", label: "Resumo do período" },
  { id: "attention", label: "Pontos de atenção" },
  { id: "opportunities", label: "Oportunidades" },
  { id: "actions", label: "Próximas ações" },
];

function ItemList({ items, emptyLabel }: { items: InsightItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-intel-text-dim">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-4">
      {items.map((item, i) => (
        <li key={i} className="border-l-2 border-intel-violet/25 pl-4">
          <p className="text-[13px] text-intel-text leading-relaxed">{item.text}</p>
          {item.evidence.length > 0 && (
            <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {item.evidence.map((e) => (
                <div key={e.label} className="flex items-baseline gap-1.5">
                  <dt className="text-[10px] uppercase tracking-[0.06em] text-intel-text-dim/70">{e.label}</dt>
                  <dd className="text-[11px] tabular-nums text-intel-text-dim">{e.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProcessingSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-3.5 rounded bg-intel-shimmer bg-white/[0.04]" style={{ width: `${88 - i * 14}%` }} />
      ))}
    </div>
  );
}

type StrategicInsightsPanelProps = {
  insights: StrategicInsights;
  onShowFlaggedCampaigns: (campaignIds: string[]) => void;
  isProcessing?: boolean;
};

export default function StrategicInsightsPanel({ insights, onShowFlaggedCampaigns, isProcessing }: StrategicInsightsPanelProps) {
  const [tab, setTab] = useState<TabId>("summary");

  const quickPrompts: { label: string; action: () => void }[] = [
    { label: "Resuma os resultados deste período", action: () => setTab("summary") },
    {
      label: "Quais campanhas precisam de atenção?",
      action: () => {
        setTab("attention");
        if (insights.flaggedCampaignIds.length > 0) onShowFlaggedCampaigns(insights.flaggedCampaignIds);
      },
    },
    { label: "Como o investimento está distribuído?", action: () => setTab("opportunities") },
    { label: "O que mudou em relação ao período anterior?", action: () => setTab("summary") },
  ];

  return (
    <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-intel-violet/20 via-white/[0.06] to-transparent">
      <div className="rounded-2xl bg-intel-surface-1 p-6 h-full">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-intel-violet/12 text-intel-violet"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Zm-2 18h4a1 1 0 0 1-1 2h-2a1 1 0 0 1-1-2Z" />
              </svg>
            </span>
            <h3 className="font-sans text-[15px] font-semibold text-intel-text">Inteligência estratégica</h3>
          </div>
        </div>
        <p className="text-[11.5px] text-intel-text-dim mb-4 ml-[34px]">
          Análise automática (baseada em regras) · {insights.periodLabel}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              onClick={prompt.action}
              className="text-[11.5px] px-3 py-1.5 rounded-full border border-white/10 bg-intel-surface-2 text-intel-text-dim hover:border-intel-violet/40 hover:text-intel-text focus-visible:border-intel-violet/50 transition-colors duration-200"
            >
              {prompt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1 border-b border-white/[0.06] pb-3 mb-4" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`text-[11.5px] px-3 py-1.5 rounded-full transition-colors duration-200 ${
                tab === t.id ? "bg-intel-violet/[0.14] text-intel-violet" : "text-intel-text-dim hover:bg-white/[0.05] hover:text-intel-text"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {isProcessing ? (
            <ProcessingSkeleton />
          ) : (
            <>
              {tab === "summary" && <ItemList items={insights.summary} emptyLabel="Sem dados suficientes para um resumo." />}
              {tab === "attention" && (
                <ItemList items={insights.attention} emptyLabel="Nenhum desvio relevante identificado nos dados do período." />
              )}
              {tab === "opportunities" && (
                <ItemList items={insights.opportunities} emptyLabel="Nenhuma hipótese de oportunidade identificada no período." />
              )}
              {tab === "actions" && (
                <ItemList items={insights.nextActions} emptyLabel="Sem sugestões automáticas para este período." />
              )}
            </>
          )}
        </div>

        <p className="mt-5 pt-4 border-t border-white/[0.06] text-[11px] leading-relaxed text-intel-text-dim/80">
          {insights.limitations}
        </p>
      </div>
    </div>
  );
}
