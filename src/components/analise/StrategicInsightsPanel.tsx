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
    return <p className="text-[13px] text-navy-500">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-4">
      {items.map((item, i) => (
        <li key={i} className="border-l-2 border-navy-700/15 pl-4">
          <p className="text-[13px] text-navy-800 leading-relaxed">{item.text}</p>
          {item.evidence.length > 0 && (
            <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {item.evidence.map((e) => (
                <div key={e.label} className="flex items-baseline gap-1.5">
                  <dt className="text-[10px] uppercase tracking-[0.06em] text-navy-400">{e.label}</dt>
                  <dd className="text-[11px] tabular-nums text-navy-600">{e.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

type StrategicInsightsPanelProps = {
  insights: StrategicInsights;
  onShowFlaggedCampaigns: (campaignIds: string[]) => void;
};

export default function StrategicInsightsPanel({ insights, onShowFlaggedCampaigns }: StrategicInsightsPanelProps) {
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
    <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="font-sans text-base font-semibold text-navy-950">Leitura estratégica</h3>
          <p className="text-[12px] text-navy-500 mt-0.5">
            Análise automática (baseada em regras) · {insights.periodLabel}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 my-4">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt.label}
            type="button"
            onClick={prompt.action}
            className="text-[12px] px-3 py-1.5 rounded-full border border-navy-700/15 text-navy-600 hover:border-navy-600/40 hover:text-navy-950 transition-colors"
          >
            {prompt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-navy-700/10 pb-3 mb-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`text-[12px] px-3 py-1.5 rounded-full transition-colors duration-150 ${
              tab === t.id ? "bg-navy-950 text-white" : "text-navy-600 hover:bg-silver-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
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
      </div>

      <p className="mt-5 pt-4 border-t border-navy-700/8 text-[11px] leading-relaxed text-navy-400">{insights.limitations}</p>
    </div>
  );
}
