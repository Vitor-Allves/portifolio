"use client";

import { useMemo, useState } from "react";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr } from "@/lib/metrics";

export const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown"];
export const GENDER_ORDER = ["female", "male", "unknown"];
export const GENDER_LABEL: Record<string, string> = { male: "Masculino", female: "Feminino", unknown: "Não informado" };

export const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
};

export const DEVICE_LABEL: Record<string, string> = {
  desktop: "Desktop",
  mobile_app: "App mobile",
  mobile_web: "Web mobile",
};

// Meta returns each hour bucket as "HH:00:00 - HH:59:59" in the account's
// own timezone.
export const hourShortLabel = (key: string) => key.slice(0, 2) + "h";

export type BreakdownRankMetric = "spend" | "clicks" | "ctr" | "reach" | "conversations";

const RANK_METRICS: { id: BreakdownRankMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "clicks", label: "Cliques" },
  { id: "ctr", label: "CTR" },
  { id: "reach", label: "Alcance" },
  { id: "conversations", label: "Conversa iniciada" },
];

type BucketTotals = { spend: number; impressions: number; clicks: number; reach: number; conversations: number | null };

function rankValue(totals: BucketTotals, metric: BreakdownRankMetric): number | null {
  switch (metric) {
    case "spend":
      return totals.spend;
    case "clicks":
      return totals.clicks;
    case "ctr":
      return ctr(totals);
    case "reach":
      return totals.reach;
    case "conversations":
      return totals.conversations;
  }
}

type BreakdownAnalysisProps<T extends BucketTotals> = {
  title: string;
  bucketColumnLabel: string;
  segments: T[];
  bucketKey: (segment: T) => string;
  bucketLabel?: (key: string) => string;
  /** Fixed display order (e.g. chronological age brackets) — hides the "ordenar por" picker in favor of this order. Omit to let the person choose which metric to rank buckets by instead (there's no inherent order for region/platform/device). */
  order?: string[];
  defaultRankMetric?: BreakdownRankMetric;
};

// Same "columns, not a metric switcher" logic as TopHoursTable: every
// breakdown answers "which buckets are actually worth acting on" better as
// a ranked table with every core metric shown side by side than as a bar
// list you switch one metric at a time. Buckets from the same underlying
// Meta breakdown are always mutually exclusive per person (age, gender,
// region, platform, device each assign exactly one value per reached
// person), so summing spend/impressions/clicks/reach across rows here is
// safe. "unknown" (Meta couldn't determine the value for a row) is excluded
// outright — not an actionable segment to read a decision from.
export default function BreakdownAnalysis<T extends BucketTotals>({
  title,
  bucketColumnLabel,
  segments,
  bucketKey,
  bucketLabel,
  order,
  defaultRankMetric = "spend",
}: BreakdownAnalysisProps<T>) {
  const [rankMetric, setRankMetric] = useState<BreakdownRankMetric>(defaultRankMetric);

  const { rows, hasConversations } = useMemo(() => {
    const byBucket = new Map<string, BucketTotals>();
    for (const seg of segments) {
      const key = bucketKey(seg);
      if (key === "unknown") continue;
      const entry = byBucket.get(key) ?? { spend: 0, impressions: 0, clicks: 0, reach: 0, conversations: null };
      entry.spend += seg.spend;
      entry.impressions += seg.impressions;
      entry.clicks += seg.clicks;
      entry.reach += seg.reach;
      if (seg.conversations !== null) entry.conversations = (entry.conversations ?? 0) + seg.conversations;
      byBucket.set(key, entry);
    }

    const anyConversations = [...byBucket.values()].some((t) => t.conversations !== null);

    let keys: string[];
    if (order) {
      keys = [...byBucket.keys()].sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
      });
    } else {
      keys = [...byBucket.entries()]
        .map(([key, totals]) => ({ key, rank: rankValue(totals, rankMetric) }))
        .filter((row): row is { key: string; rank: number } => row.rank !== null)
        .sort((a, b) => b.rank - a.rank)
        .map((row) => row.key);
    }

    return { rows: keys.map((key) => ({ key, totals: byBucket.get(key)! })), hasConversations: anyConversations };
  }, [segments, bucketKey, order, rankMetric]);

  if (segments.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">{title}</h3>
        <p className="text-sm text-intel-text-dim mt-3">Sem dados no período para os filtros atuais.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-[13px] font-medium text-intel-text">{title}</h3>
        {!order && (
          <div className="flex flex-wrap gap-1" role="group" aria-label={`Ordenar ${title} por`}>
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
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-intel-text-dim">Sem dados para esse indicador no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">
                  {bucketColumnLabel}
                </th>
                <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">Investimento</th>
                <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">Cliques</th>
                <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">CTR</th>
                <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">Alcance</th>
                {hasConversations && (
                  <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2 px-3">
                    Conversa iniciada
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowCtr = ctr(row.totals);
                return (
                  <tr key={row.key} className="border-t border-white/[0.05]">
                    <td className="py-2.5 px-3 text-[13px] text-intel-text">{bucketLabel ? bucketLabel(row.key) : row.key}</td>
                    <td className="py-2.5 px-3 text-[13px] tabular-nums text-intel-text text-right">{formatCurrencyBRL(row.totals.spend)}</td>
                    <td className="py-2.5 px-3 text-[13px] tabular-nums text-intel-text text-right">{formatInteger(row.totals.clicks)}</td>
                    <td className="py-2.5 px-3 text-[13px] tabular-nums text-intel-text text-right">{rowCtr === null ? "—" : formatPercent(rowCtr)}</td>
                    <td className="py-2.5 px-3 text-[13px] tabular-nums text-intel-text text-right">{formatInteger(row.totals.reach)}</td>
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
