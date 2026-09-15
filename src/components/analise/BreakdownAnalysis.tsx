"use client";

import { useMemo, useState } from "react";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation } from "@/lib/metrics";

export type BreakdownMetric =
  | "spend"
  | "impressions"
  | "clicks"
  | "linkClicks"
  | "conversations"
  | "costPerConversation"
  | "ctr"
  | "cpc"
  | "cpm"
  | "reach";

const METRICS: { id: BreakdownMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques totais" },
  { id: "linkClicks", label: "Cliques no link" },
  { id: "conversations", label: "Conversa iniciada" },
  { id: "costPerConversation", label: "Custo/Conversa" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
  { id: "cpm", label: "CPM" },
  { id: "reach", label: "Alcance" },
];

type BucketTotals = { spend: number; impressions: number; clicks: number; linkClicks: number; conversations: number | null; reach: number };

function metricValue(totals: BucketTotals, metric: BreakdownMetric): number | null {
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
    case "reach":
      return totals.reach;
  }
}

function formatValue(value: number, metric: BreakdownMetric): string {
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
    case "reach":
      return formatInteger(value);
    case "ctr":
      return formatPercent(value);
  }
}

export const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown"];
export const GENDER_ORDER = ["female", "male", "unknown"];
export const GENDER_LABEL: Record<string, string> = { male: "Masculino", female: "Feminino", unknown: "Não informado" };
export const unknownAsNaoInformado = (key: string) => (key === "unknown" ? "Não informado" : key);

type BreakdownAnalysisProps<T extends BucketTotals> = {
  title: string;
  barColor: string;
  segments: T[];
  bucketKey: (segment: T) => string;
  bucketLabel?: (key: string) => string;
  /** Fixed display order (e.g. chronological age brackets). Omit to rank buckets by the selected metric's value instead — the natural choice when there's no inherent order (region, for instance). */
  order?: string[];
  defaultMetric?: BreakdownMetric;
  maxRows?: number;
};

// Generic "one metric, broken down by one dimension" panel — used for
// Público por idade/gênero/região. Each caller supplies which field of its
// own segment type is the bucket key; the metric picker and bar rendering
// are shared. Buckets from the same underlying Meta breakdown are always
// mutually exclusive per person (age, gender, and region each assign
// exactly one value per reached person), so summing spend/impressions/
// clicks/reach across rows here is safe — unlike per-campaign or per-day
// reach, which the AccountReach type's own comment warns against summing.
export default function BreakdownAnalysis<T extends BucketTotals>({
  title,
  barColor,
  segments,
  bucketKey,
  bucketLabel,
  order,
  defaultMetric = "reach",
  maxRows,
}: BreakdownAnalysisProps<T>) {
  const [metric, setMetric] = useState<BreakdownMetric>(defaultMetric);

  const rows = useMemo(() => {
    const byBucket = new Map<string, BucketTotals>();
    for (const seg of segments) {
      const key = bucketKey(seg);
      const entry = byBucket.get(key) ?? { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, conversations: null, reach: 0 };
      entry.spend += seg.spend;
      entry.impressions += seg.impressions;
      entry.clicks += seg.clicks;
      entry.linkClicks += seg.linkClicks;
      if (seg.conversations !== null) entry.conversations = (entry.conversations ?? 0) + seg.conversations;
      entry.reach += seg.reach;
      byBucket.set(key, entry);
    }

    const keys = [...byBucket.keys()];
    if (order) {
      keys.sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
      });
    }

    let mapped = keys
      .map((key) => ({ key, value: metricValue(byBucket.get(key)!, metric) }))
      .filter((row): row is { key: string; value: number } => row.value !== null);

    if (!order) {
      mapped = mapped.sort((a, b) => b.value - a.value);
    }
    if (maxRows) {
      mapped = mapped.slice(0, maxRows);
    }
    return mapped;
  }, [segments, bucketKey, metric, order, maxRows]);

  if (segments.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">{title}</h3>
        <p className="text-sm text-intel-text-dim mt-3">Sem dados no período para os filtros atuais.</p>
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-[13px] font-medium text-intel-text">{title}</h3>
        <div className="flex flex-wrap gap-1" role="group" aria-label={`Selecionar métrica para ${title}`}>
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

      {rows.length === 0 ? (
        <p className="text-sm text-intel-text-dim">Sem dados para esse indicador no período.</p>
      ) : (
        <ul className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[13px] text-intel-text-dim">{bucketLabel ? bucketLabel(row.key) : row.key}</span>
                <span className="text-[13px] tabular-nums text-intel-text">{formatValue(row.value, metric)}</span>
              </div>
              <div className="h-3 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max((row.value / maxValue) * 100, 2)}%`, backgroundColor: barColor }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
