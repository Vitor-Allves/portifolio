"use client";

import { useMemo, useState } from "react";
import type { HourSegment } from "@/lib/meta-ads-types";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation } from "@/lib/metrics";
import { hourShortLabel } from "./BreakdownAnalysis";

// Deliberately its own component, not a BreakdownAnalysis instance: every
// other breakdown answers "how is the period distributed across every
// bucket" with a bar list, but for hour-of-day the useful question is
// "which handful of hours are actually worth acting on" — a ranked table
// of the best few, not a 24-row bar chart. Also never folded into the PDF/
// CSV reports' generic breakdown section — see drawTopHoursTable in
// pdf-report-core.ts, which mirrors this same ranking.

type HourMetric = "spend" | "impressions" | "clicks" | "linkClicks" | "conversations" | "costPerConversation" | "ctr" | "cpc" | "cpm";

// "reach" is deliberately absent — same caveat as the hour BreakdownAnalysis
// panel this replaces: a person reached in more than one hour bucket the
// same day is counted in each, so summing it across hours isn't a real total.
const METRICS: { id: HourMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques totais" },
  { id: "linkClicks", label: "Cliques no link" },
  { id: "conversations", label: "Conversa iniciada" },
  { id: "costPerConversation", label: "Custo/Conversa" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
  { id: "cpm", label: "CPM" },
];

const COUNT_OPTIONS = [6, 12, 24] as const;

type HourTotals = { spend: number; impressions: number; clicks: number; linkClicks: number; conversations: number | null };

function metricValue(totals: HourTotals, metric: HourMetric): number | null {
  switch (metric) {
    case "spend":
      return totals.spend;
    case "impressions":
      return totals.impressions;
    case "clicks":
      return totals.clicks;
    case "linkClicks":
      return totals.linkClicks;
    case "conversations":
      return totals.conversations;
    case "costPerConversation":
      return costPerConversation(totals);
    case "ctr":
      return ctr(totals);
    case "cpc":
      return cpc(totals);
    case "cpm":
      return cpm(totals);
  }
}

function formatValue(value: number, metric: HourMetric): string {
  switch (metric) {
    case "spend":
    case "cpc":
    case "cpm":
    case "costPerConversation":
      return formatCurrencyBRL(value);
    case "impressions":
    case "clicks":
    case "linkClicks":
    case "conversations":
      return formatInteger(value);
    case "ctr":
      return formatPercent(value);
  }
}

export default function TopHoursTable({ segments }: { segments: HourSegment[] }) {
  const [metric, setMetric] = useState<HourMetric>("spend");
  const [count, setCount] = useState<number>(6);

  const rows = useMemo(() => {
    const byHour = new Map<string, HourTotals>();
    for (const seg of segments) {
      const entry = byHour.get(seg.hour) ?? { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, conversations: null };
      entry.spend += seg.spend;
      entry.impressions += seg.impressions;
      entry.clicks += seg.clicks;
      entry.linkClicks += seg.linkClicks;
      if (seg.conversations !== null) entry.conversations = (entry.conversations ?? 0) + seg.conversations;
      byHour.set(seg.hour, entry);
    }

    return [...byHour.entries()]
      .map(([hour, totals]) => ({ hour, value: metricValue(totals, metric) }))
      .filter((row): row is { hour: string; value: number } => row.value !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, count);
  }, [segments, metric, count]);

  if (segments.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Melhores horários do período</h3>
        <p className="text-sm text-intel-text-dim mt-3">Sem dados no período para os filtros atuais.</p>
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((r) => r.value), 1);

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
          <div className="flex flex-wrap gap-1" role="group" aria-label="Selecionar métrica para melhores horários">
            {METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={metric === m.id}
                onClick={() => setMetric(m.id)}
                className={`text-[11px] px-2.5 py-1.5 rounded-full transition-colors duration-200 ${
                  metric === m.id ? "bg-intel-cyan/[0.14] text-intel-cyan" : "text-intel-text-dim hover:bg-white/[0.05] hover:text-intel-text"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-intel-text-dim">Sem dados para esse indicador no período.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">#</th>
              <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">Horário</th>
              <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">
                {METRICS.find((m) => m.id === metric)?.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.hour} className="border-t border-white/[0.05]">
                <td className="py-2.5 px-3 text-[13px] text-intel-text-dim/70 tabular-nums">{i + 1}º</td>
                <td className="py-2.5 px-3 text-[13px] text-intel-text">{hourShortLabel(row.hour)}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center justify-end gap-3">
                    <div className="h-2 w-24 rounded-full bg-white/[0.05] overflow-hidden hidden sm:block">
                      <div
                        className="h-full rounded-full bg-intel-cyan"
                        style={{ width: `${Math.max((row.value / maxValue) * 100, 4)}%` }}
                      />
                    </div>
                    <span className="text-[13px] tabular-nums text-intel-text">{formatValue(row.value, metric)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
