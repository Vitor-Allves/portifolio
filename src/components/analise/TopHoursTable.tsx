"use client";

import { useMemo, useState } from "react";
import type { HourSegment } from "@/lib/meta-ads-types";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr } from "@/lib/metrics";
import { hourShortLabel } from "./BreakdownAnalysis";

// Deliberately its own component, not a BreakdownAnalysis instance: every
// other breakdown answers "how is the period distributed across every
// bucket" with a bar list, but for hour-of-day the useful question is
// "which handful of hours are actually worth acting on" — a ranked table
// of the best few, every metric shown side by side as columns rather than
// switched one at a time. Also never folded into the PDF/CSV reports'
// generic breakdown section — see drawTopHoursTable in pdf-report-core.ts,
// which mirrors this same ranking and column set.

type RankMetric = "spend" | "clicks" | "ctr" | "conversations";

const RANK_METRICS: { id: RankMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "clicks", label: "Cliques" },
  { id: "ctr", label: "CTR" },
  { id: "conversations", label: "Conversa iniciada" },
];

const COUNT_OPTIONS = [6, 12, 24] as const;

type HourTotals = { spend: number; impressions: number; clicks: number; conversations: number | null };

function rankValue(totals: HourTotals, metric: RankMetric): number | null {
  switch (metric) {
    case "spend":
      return totals.spend;
    case "clicks":
      return totals.clicks;
    case "ctr":
      return ctr(totals);
    case "conversations":
      return totals.conversations;
  }
}

export default function TopHoursTable({ segments }: { segments: HourSegment[] }) {
  const [rankMetric, setRankMetric] = useState<RankMetric>("spend");
  const [count, setCount] = useState<number>(6);

  const { rows, hasConversations } = useMemo(() => {
    const byHour = new Map<string, HourTotals>();
    for (const seg of segments) {
      const entry = byHour.get(seg.hour) ?? { spend: 0, impressions: 0, clicks: 0, conversations: null };
      entry.spend += seg.spend;
      entry.impressions += seg.impressions;
      entry.clicks += seg.clicks;
      if (seg.conversations !== null) entry.conversations = (entry.conversations ?? 0) + seg.conversations;
      byHour.set(seg.hour, entry);
    }

    const anyConversations = [...byHour.values()].some((t) => t.conversations !== null);

    const ranked = [...byHour.entries()]
      .map(([hour, totals]) => ({ hour, totals, rank: rankValue(totals, rankMetric) }))
      .filter((row): row is { hour: string; totals: HourTotals; rank: number } => row.rank !== null)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, count);

    return { rows: ranked, hasConversations: anyConversations };
  }, [segments, rankMetric, count]);

  if (segments.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Melhores horários do período</h3>
        <p className="text-sm text-intel-text-dim mt-3">Sem dados no período para os filtros atuais.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[13px] font-medium text-intel-text">Melhores horários do período</h3>
          <p className="text-[11.5px] text-intel-text-dim mt-0.5">Horário local de cada conta · rankeado, não distribuído por hora corrida.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5" role="group" aria-label="Quantidade de horários exibidos">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={count === n}
                onClick={() => setCount(n)}
                className={`text-[11px] px-2.5 py-1.5 rounded-full transition-colors duration-200 ${
                  count === n ? "bg-intel-violet/[0.16] text-intel-violet" : "text-intel-text-dim hover:bg-white/[0.05] hover:text-intel-text"
                }`}
              >
                Top {n}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Ordenar melhores horários por">
            {RANK_METRICS.filter((m) => m.id !== "conversations" || hasConversations).map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={rankMetric === m.id}
                onClick={() => setRankMetric(m.id)}
                className={`text-[11px] px-2.5 py-1.5 rounded-full transition-colors duration-200 ${
                  rankMetric === m.id ? "bg-intel-cyan/[0.14] text-intel-cyan" : "text-intel-text-dim hover:bg-white/[0.05] hover:text-intel-text"
                }`}
              >
                Ordenar por {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-intel-text-dim">Sem dados para esse indicador no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">#</th>
                <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">Horário</th>
                <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">Investimento</th>
                <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">Cliques</th>
                <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">CTR</th>
                {hasConversations && (
                  <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">
                    Conversa iniciada
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rowCtr = ctr(row.totals);
                return (
                  <tr key={row.hour} className="border-t border-white/[0.05]">
                    <td className="py-2.5 px-3 text-[13px] text-intel-text-dim/70 tabular-nums">{i + 1}º</td>
                    <td className="py-2.5 px-3 text-[13px] text-intel-text">{hourShortLabel(row.hour)}</td>
                    <td className="py-2.5 px-3 text-[13px] tabular-nums text-intel-text text-right">{formatCurrencyBRL(row.totals.spend)}</td>
                    <td className="py-2.5 px-3 text-[13px] tabular-nums text-intel-text text-right">{formatInteger(row.totals.clicks)}</td>
                    <td className="py-2.5 px-3 text-[13px] tabular-nums text-intel-text text-right">{rowCtr === null ? "—" : formatPercent(rowCtr)}</td>
                    {hasConversations && (
                      <td className="py-2.5 px-3 text-[13px] tabular-nums text-intel-text text-right">
                        {row.totals.conversations === null ? "Não disponível" : formatInteger(row.totals.conversations)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
