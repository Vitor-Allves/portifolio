import { formatSignedPercent } from "@/lib/format";

type KpiCardProps = {
  label: string;
  value: string;
  unavailableReason?: string;
  /** undefined = comparison not enabled; null = no previous-period baseline to compare against; number = % change */
  delta?: number | null;
  sparkline?: number[];
  tooltip: string;
};

// Fixed viewBox coordinate space, but the <svg> itself fills whatever width
// the card gives it — a full-width strip under the value rather than a
// fixed-size box squeezed in beside variable-width text.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 22;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = points.split(" ").at(-1)!.split(",").map(Number);
  const areaPath = `M${points.split(" ")[0]} L${points.replace(/ /g, " L")} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className="w-full h-6 mt-2">
      <defs>
        <linearGradient id="kpi-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-intel-cyan)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-intel-cyan)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#kpi-spark-fill)" stroke="none" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-intel-cyan)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r="2" fill="var(--color-intel-cyan)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function KpiCard({ label, value, unavailableReason, delta, sparkline, tooltip }: KpiCardProps) {
  const isUnavailable = value === "—";
  const deltaColor =
    delta === undefined || delta === null
      ? "text-intel-text-dim"
      : delta > 0
        ? "text-intel-green"
        : delta < 0
          ? "text-intel-red"
          : "text-intel-text-dim";

  return (
    <div className="group relative rounded-2xl border border-white/[0.07] bg-intel-surface-1 px-5 py-4 overflow-hidden transition-colors duration-200 hover:border-white/[0.14]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-intel-cyan/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      />

      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10.5px] tracking-[0.12em] uppercase text-intel-text-dim">{label}</p>
        <div className="group/tip relative">
          <button
            type="button"
            aria-label={`O que é ${label}`}
            title={tooltip}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-white/15 text-[10px] text-intel-text-dim hover:border-intel-cyan/50 hover:text-intel-cyan transition-colors duration-200"
          >
            i
          </button>
          <div className="pointer-events-none absolute right-0 top-6 z-20 w-56 rounded-lg border border-white/10 bg-intel-surface-2 px-3 py-2 text-[11px] leading-relaxed text-intel-text-dim opacity-0 shadow-[0_16px_32px_-12px_rgba(0,0,0,0.7)] transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100">
            {tooltip}
          </div>
        </div>
      </div>

      <p
        className={`relative mt-2 font-sans text-[26px] leading-none font-semibold tabular-nums ${
          isUnavailable ? "text-intel-text-dim" : "text-intel-text"
        }`}
      >
        {value}
      </p>

      {sparkline && sparkline.length > 1 && (
        <div className="relative">
          <Sparkline values={sparkline} />
        </div>
      )}

      {isUnavailable && unavailableReason && (
        <p className="relative mt-1 text-[11px] text-intel-text-dim">{unavailableReason}</p>
      )}

      {delta !== undefined && (
        <p className={`relative mt-1.5 text-[12px] tabular-nums ${deltaColor}`}>
          {delta === null ? "Sem período anterior para comparar" : `${formatSignedPercent(delta)} vs. período anterior`}
        </p>
      )}
    </div>
  );
}
