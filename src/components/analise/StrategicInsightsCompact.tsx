"use client";

import type { StrategicInsights } from "@/lib/strategic-insights";

type StrategicInsightsCompactProps = {
  insights: StrategicInsights;
  onViewAll: () => void;
  onShowFlaggedCampaigns: (campaignIds: string[]) => void;
  isProcessing?: boolean;
};

const QUICK_PROMPTS = [
  "Resuma os resultados deste período",
  "Quais campanhas precisam de atenção?",
  "Como o investimento está distribuído?",
  "O que mudou em relação ao período anterior?",
];

function Shimmer({ width }: { width: string }) {
  return <div aria-hidden="true" className="h-3.5 rounded bg-intel-shimmer bg-white/[0.04]" style={{ width }} />;
}

export default function StrategicInsightsCompact({
  insights,
  onViewAll,
  onShowFlaggedCampaigns,
  isProcessing,
}: StrategicInsightsCompactProps) {
  const hero = insights.summary[0];
  const secondary = [...insights.attention.slice(0, 1), ...insights.opportunities.slice(0, 1)];

  return (
    <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-intel-violet/35 via-white/[0.06] to-transparent h-full">
      <div className="rounded-2xl bg-intel-surface-1 p-5 h-full flex flex-col">
        <div className="flex items-center gap-2.5 mb-1">
          <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-intel-violet/12 text-intel-violet">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Zm-2 18h4a1 1 0 0 1-1 2h-2a1 1 0 0 1-1-2Z" />
            </svg>
          </span>
          <h3 className="font-sans text-[14px] font-semibold text-intel-text">Análises estratégicas</h3>
        </div>
        <p className="text-[10.5px] text-intel-text-dim/70 mb-3 ml-[34px]">Origem: estatística (regras), sem IA generativa</p>

        <div className="flex-1">
          {isProcessing ? (
            <div className="space-y-3">
              <Shimmer width="100%" />
              <Shimmer width="80%" />
              <Shimmer width="60%" />
            </div>
          ) : (
            <>
              {hero && (
                <div className="rounded-lg bg-intel-violet/[0.06] border border-intel-violet/15 px-3.5 py-3 mb-3">
                  <p className="text-[13px] text-intel-text leading-relaxed">{hero.text}</p>
                </div>
              )}

              {secondary.length > 0 && (
                <ul className="space-y-2.5 mb-1">
                  {secondary.map((item, i) => (
                    <li key={i} className="text-[12px] text-intel-text-dim leading-relaxed border-l-2 border-white/10 pl-3">
                      {item.text}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-4 mb-4">
          {QUICK_PROMPTS.slice(0, 2).map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (label === QUICK_PROMPTS[1] && insights.flaggedCampaignIds.length > 0) {
                  onShowFlaggedCampaigns(insights.flaggedCampaignIds);
                }
                onViewAll();
              }}
              className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-intel-surface-2 text-intel-text-dim hover:border-intel-violet/40 hover:text-intel-text focus-visible:border-intel-violet/50 transition-colors duration-200"
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onViewAll}
          className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] tracking-[0.04em] text-intel-violet hover:text-intel-text border border-intel-violet/25 hover:border-intel-violet/50 rounded-full py-2 transition-colors duration-200"
        >
          Ver análise completa
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
