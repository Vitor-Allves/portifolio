"use client";

import { useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { formatCurrencyBRL, formatCompactNumber, formatPercent, formatShortDate } from "@/lib/format";

export type TrendPoint = { date: string; spend: number; impressions: number; clicks: number };
export type TrendMetric = "spend" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm";

const METRICS: { id: TrendMetric; label: string }[] = [
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
  { id: "cpm", label: "CPM" },
];

function metricValue(p: TrendPoint, metric: TrendMetric): number {
  switch (metric) {
    case "spend":
      return p.spend;
    case "impressions":
      return p.impressions;
    case "clicks":
      return p.clicks;
    case "ctr":
      return p.impressions > 0 ? (p.clicks / p.impressions) * 100 : 0;
    case "cpc":
      return p.clicks > 0 ? p.spend / p.clicks : 0;
    case "cpm":
      return p.impressions > 0 ? (p.spend / p.impressions) * 1000 : 0;
  }
}

function formatMetric(value: number, metric: TrendMetric): string {
  switch (metric) {
    case "spend":
    case "cpc":
    case "cpm":
      return formatCurrencyBRL(value);
    case "impressions":
    case "clicks":
      return formatCompactNumber(value);
    case "ctr":
      return formatPercent(value);
  }
}

const LINE_COLOR = "var(--color-petrol-800)";
const COMPARISON_COLOR = "var(--color-silver-500)";
const WIDTH = 800;
const HEIGHT = 260;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

type TrendChartProps = {
  current: TrendPoint[];
  comparison: TrendPoint[] | null;
  metric: TrendMetric;
  onMetricChange: (metric: TrendMetric) => void;
};

export default function TrendChart({ current, comparison, metric, onMetricChange }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { points, comparisonPoints, xFor, yFor, yTicks, xLabelIndexes } = useMemo(() => {
    const n = current.length;
    const currentValues = current.map((p) => metricValue(p, metric));
    const comparisonValues = comparison?.map((p) => metricValue(p, metric)) ?? [];
    const maxValue = niceMax(Math.max(...currentValues, ...comparisonValues, 0));
    const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const xFor = (i: number, total: number) => PAD_LEFT + (total <= 1 ? 0 : (i / (total - 1)) * plotWidth);
    const yFor = (value: number) => PAD_TOP + plotHeight - (value / maxValue) * plotHeight;

    const points = current.map((p, i) => ({ x: xFor(i, n), y: yFor(currentValues[i]), value: currentValues[i], date: p.date }));
    const comparisonPoints = comparison
      ? comparison.map((p, i) => ({ x: xFor(i, comparison.length), y: yFor(comparisonValues[i]), value: comparisonValues[i], date: p.date }))
      : [];

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (maxValue / tickCount) * i);

    const labelStep = Math.max(1, Math.ceil(n / 6));
    const xLabelIndexes = current.map((_, i) => i).filter((i) => i % labelStep === 0 || i === n - 1);

    return { points, comparisonPoints, xFor, yFor, yTicks, xLabelIndexes };
  }, [current, comparison, metric]);

  if (current.length === 0) {
    return (
      <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
        <p className="text-sm text-navy-500">Sem dados diários para o período selecionado.</p>
      </div>
    );
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${yFor(0)} L${points[0].x},${yFor(0)} Z`;
  const comparisonPath = comparisonPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  function updateFromClientX(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = WIDTH / rect.width;
    const svgX = (clientX - rect.left) * scale;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - svgX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setActiveIndex(nearest);
  }

  function handlePointerMove(e: PointerEvent<SVGSVGElement>) {
    updateFromClientX(e.clientX);
  }

  function handleKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActiveIndex((i) => Math.min((i ?? -1) + 1, points.length - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActiveIndex((i) => Math.max((i ?? 1) - 1, 0));
    } else if (e.key === "Escape") {
      setActiveIndex(null);
    }
  }

  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeComparison = activeIndex !== null ? comparisonPoints[activeIndex] : null;
  const tooltipRight = active ? active.x > WIDTH - 180 : false;
  const metricLabel = METRICS.find((m) => m.id === metric)?.label ?? "";

  return (
    <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-medium text-navy-950">Evolução no período</h3>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Selecionar métrica">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metric === m.id}
              onClick={() => onMetricChange(m.id)}
              className={`text-[12px] px-3 py-1.5 rounded-full transition-colors duration-150 ${
                metric === m.id ? "bg-navy-950 text-white" : "text-navy-600 hover:bg-silver-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {comparison && (
        <div className="flex items-center gap-4 mb-3 text-[11px] text-navy-500">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: LINE_COLOR }} />
            Período atual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full border-t border-dashed" style={{ borderColor: COMPARISON_COLOR }} />
            Período anterior (alinhado por dia do período, não por data)
          </span>
        </div>
      )}

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto touch-none outline-none"
          role="img"
          aria-label={`Gráfico de ${metricLabel.toLowerCase()} por dia`}
          tabIndex={0}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActiveIndex(null)}
          onKeyDown={handleKeyDown}
          onFocus={() => setActiveIndex((i) => i ?? points.length - 1)}
          onBlur={() => setActiveIndex(null)}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(tick)} y2={yFor(tick)} stroke="var(--color-silver-300)" strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle" className="fill-navy-400" fontSize={11}>
                {metric === "spend" || metric === "cpc" || metric === "cpm"
                  ? formatCompactNumber(tick)
                  : metric === "ctr"
                    ? `${tick.toFixed(0)}%`
                    : formatCompactNumber(tick)}
              </text>
            </g>
          ))}

          {xLabelIndexes.map((i) => (
            <text key={i} x={xFor(i, current.length)} y={HEIGHT - 8} textAnchor="middle" className="fill-navy-400" fontSize={11}>
              {formatShortDate(current[i].date)}
            </text>
          ))}

          {comparisonPath && (
            <path d={comparisonPath} fill="none" stroke={COMPARISON_COLOR} strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" strokeLinecap="round" />
          )}

          <path d={areaPath} fill={LINE_COLOR} opacity={0.08} stroke="none" />
          <path d={linePath} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {active && (
            <>
              <line x1={active.x} x2={active.x} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="var(--color-navy-400)" strokeWidth={1} />
              <circle cx={active.x} cy={active.y} r={4} fill={LINE_COLOR} stroke="white" strokeWidth={2} />
              {activeComparison && (
                <circle cx={activeComparison.x} cy={activeComparison.y} r={3.5} fill={COMPARISON_COLOR} stroke="white" strokeWidth={1.5} />
              )}
            </>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-navy-700/10 bg-white px-3 py-2 shadow-lg"
            style={{
              left: tooltipRight ? undefined : `${(active.x / WIDTH) * 100}%`,
              right: tooltipRight ? `${100 - (active.x / WIDTH) * 100}%` : undefined,
              transform: "translateX(8px)",
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.08em] text-navy-500">{formatShortDate(active.date)}</p>
            <p className="text-sm font-semibold text-navy-950 tabular-nums">{formatMetric(active.value, metric)}</p>
            {activeComparison && (
              <p className="text-[11px] text-navy-500 tabular-nums mt-0.5">
                Anterior: {formatMetric(activeComparison.value, metric)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
