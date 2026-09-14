"use client";

import { useMemo, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { formatCurrencyBRL, formatCompactNumber, formatShortDate } from "@/lib/format";

type SpendTrendChartProps = {
  // Already aggregated (summed per date) by the caller for whichever
  // accounts are currently selected in the client filter.
  dailySpend: { date: string; spend: number }[];
};

const LINE_COLOR = "var(--color-petrol-800)";
const WIDTH = 800;
const HEIGHT = 240;
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

export default function SpendTrendChart({ dailySpend }: SpendTrendChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { points, xFor, yFor, yTicks, xLabelIndexes } = useMemo(() => {
    const n = dailySpend.length;
    const maxSpend = niceMax(Math.max(...dailySpend.map((d) => d.spend), 0));
    const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const xFor = (i: number) => PAD_LEFT + (n <= 1 ? 0 : (i / (n - 1)) * plotWidth);
    const yFor = (value: number) => PAD_TOP + plotHeight - (value / maxSpend) * plotHeight;

    const points = dailySpend.map((d, i) => ({ x: xFor(i), y: yFor(d.spend), ...d }));

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => (maxSpend / tickCount) * i);

    const labelStep = Math.max(1, Math.ceil(n / 6));
    const xLabelIndexes = dailySpend
      .map((_, i) => i)
      .filter((i) => i % labelStep === 0 || i === n - 1);

    return { points, xFor, yFor, yTicks, xLabelIndexes };
  }, [dailySpend]);

  if (dailySpend.length === 0) {
    return (
      <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
        <p className="text-sm text-navy-500">Sem dados diários para o período selecionado.</p>
      </div>
    );
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${yFor(0)} L${points[0].x},${yFor(0)} Z`;

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
  const tooltipRight = active ? active.x > WIDTH - 160 : false;

  return (
    <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
      <h3 className="text-sm font-medium text-navy-950 mb-2">Investimento por dia</h3>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto touch-none outline-none"
          role="img"
          aria-label="Gráfico de investimento diário"
          tabIndex={0}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActiveIndex(null)}
          onKeyDown={handleKeyDown}
          onFocus={() => setActiveIndex((i) => i ?? points.length - 1)}
          onBlur={() => setActiveIndex(null)}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={yFor(tick)}
                y2={yFor(tick)}
                stroke="var(--color-silver-300)"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 8}
                y={yFor(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-navy-400"
                fontSize={11}
              >
                {formatCompactNumber(tick)}
              </text>
            </g>
          ))}

          {xLabelIndexes.map((i) => (
            <text
              key={i}
              x={xFor(i)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-navy-400"
              fontSize={11}
            >
              {formatShortDate(dailySpend[i].date)}
            </text>
          ))}

          <path d={areaPath} fill={LINE_COLOR} opacity={0.1} stroke="none" />
          <path d={linePath} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={4}
            fill={LINE_COLOR}
            stroke="white"
            strokeWidth={2}
          />
          <text
            x={points[points.length - 1].x}
            y={points[points.length - 1].y - 10}
            textAnchor="end"
            className="fill-navy-950"
            fontSize={12}
            fontWeight={600}
          >
            {formatCurrencyBRL(points[points.length - 1].spend)}
          </text>

          {active && (
            <>
              <line
                x1={active.x}
                x2={active.x}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke="var(--color-navy-400)"
                strokeWidth={1}
              />
              <circle cx={active.x} cy={active.y} r={4} fill={LINE_COLOR} stroke="white" strokeWidth={2} />
            </>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-navy-700/10 bg-white px-3 py-2 shadow-lg"
            style={{
              left: tooltipRight ? undefined : `${(active.x / WIDTH) * 100}%`,
              right: tooltipRight ? `${100 - (active.x / WIDTH) * 100}%` : undefined,
              transform: tooltipRight ? "translateX(8px)" : "translateX(8px)",
            }}
          >
            <p className="text-[11px] uppercase tracking-[0.08em] text-navy-500">
              {formatShortDate(active.date)}
            </p>
            <p className="text-sm font-semibold text-navy-950 tabular-nums">
              {formatCurrencyBRL(active.spend)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
