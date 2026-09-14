"use client";

import { useMemo, useState } from "react";
import type { AudienceSegment } from "@/lib/meta-ads-types";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation } from "@/lib/metrics";

type DemographicMetric = "spend" | "impressions" | "clicks" | "linkClicks" | "costPerConversation" | "ctr" | "cpc" | "cpm" | "reach";

const METRICS: { id: DemographicMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques" },
  { id: "linkClicks", label: "Conversa iniciada" },
  { id: "costPerConversation", label: "Custo/Conversa" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
  { id: "cpm", label: "CPM" },
  { id: "reach", label: "Alcance" },
];

type BucketTotals = { spend: number; impressions: number; clicks: number; linkClicks: number; reach: number };

function metricValue(totals: BucketTotals, metric: DemographicMetric): number | null {
  switch (metric) {
    case "spend":
      return totals.spend;
    case "impressions":
      return totals.impressions;
    case "clicks":
      return totals.clicks;
    case "linkClicks":
      return totals.linkClicks;
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

function formatValue(value: number, metric: DemographicMetric): string {
  switch (metric) {
    case "spend":
    case "cpc":
    case "cpm":
    case "costPerConversation":
      return formatCurrencyBRL(value);
    case "impressions":
    case "clicks":
    case "linkClicks":
    case "reach":
      return formatInteger(value);
    case "ctr":
      return formatPercent(value);
  }
}

const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown"];
const GENDER_ORDER = ["female", "male", "unknown"];
const GENDER_LABEL: Record<string, string> = { male: "Masculino", female: "Feminino", unknown: "Não informado" };

type DemographicAnalysisProps = {
  title: string;
  dimension: "age" | "gender";
  audience: AudienceSegment[];
  barColor: string;
};

// Age and gender are mutually exclusive per person (everyone falls into
// exactly one bucket of each), so collapsing the age×gender breakdown down
// to just age (summing across genders) or just gender (summing across
// ages) is safe — it's still summing within one consistent partition, not
// across days or campaigns the way AccountReach's own doc comment warns
// against.
export default function DemographicAnalysis({ title, dimension, audience, barColor }: DemographicAnalysisProps) {
  const [metric, setMetric] = useState<DemographicMetric>("reach");

  const rows = useMemo(() => {
    const byBucket = new Map<string, BucketTotals>();
    for (const seg of audience) {
      const key = dimension === "age" ? seg.age : seg.gender;
      const entry = byBucket.get(key) ?? { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: 0 };
      entry.spend += seg.spend;
      entry.impressions += seg.impressions;
      entry.clicks += seg.clicks;
      entry.linkClicks += seg.linkClicks;
      entry.reach += seg.reach;
      byBucket.set(key, entry);
    }
    const order = dimension === "age" ? AGE_ORDER : GENDER_ORDER;
    const keys = [...byBucket.keys()].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
    });
    return keys
      .map((key) => ({ key, value: metricValue(byBucket.get(key)!, metric) }))
      .filter((row): row is { key: string; value: number } => row.value !== null);
  }, [audience, dimension, metric]);

  const bucketLabel = (key: string) => {
    if (dimension === "gender") return GENDER_LABEL[key] ?? key;
    return key === "unknown" ? "Não informado" : key;
  };

  if (audience.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">{title}</h3>
        <p className="text-sm text-intel-text-dim mt-3">Sem dados demográficos no período para os filtros atuais.</p>
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
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[13px] text-intel-text-dim">{bucketLabel(row.key)}</span>
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
