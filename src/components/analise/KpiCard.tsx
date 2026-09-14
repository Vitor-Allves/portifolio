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

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 64;
  const h = 24;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = points.split(" ").at(-1)!.split(",").map(Number);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke="var(--color-navy-400)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill="var(--color-navy-700)" />
    </svg>
  );
}

export default function KpiCard({ label, value, unavailableReason, delta, sparkline, tooltip }: KpiCardProps) {
  const isUnavailable = value === "—";
  const deltaColor =
    delta === undefined || delta === null
      ? "text-navy-400"
      : delta > 0
        ? "text-emerald-700"
        : delta < 0
          ? "text-red-700"
          : "text-navy-500";

  return (
    <div className="rounded-2xl border border-navy-700/10 bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] tracking-[0.12em] uppercase text-navy-500">{label}</p>
        <div className="group relative">
          <button
            type="button"
            aria-label={`O que é ${label}`}
            title={tooltip}
            className="flex h-4 w-4 items-center justify-center rounded-full border border-navy-700/20 text-[10px] text-navy-500 hover:border-navy-600/50 hover:text-navy-700 transition-colors"
          >
            i
          </button>
          <div className="pointer-events-none absolute right-0 top-6 z-20 w-56 rounded-lg border border-navy-700/10 bg-navy-950 px-3 py-2 text-[11px] leading-relaxed text-silver-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
            {tooltip}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p
          className={`font-sans text-[26px] leading-none font-semibold tabular-nums ${
            isUnavailable ? "text-navy-400" : "text-navy-950"
          }`}
        >
          {value}
        </p>
        {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} />}
      </div>

      {isUnavailable && unavailableReason && <p className="mt-1 text-[11px] text-navy-400">{unavailableReason}</p>}

      {delta !== undefined && (
        <p className={`mt-1.5 text-[12px] tabular-nums ${deltaColor}`}>
          {delta === null ? "Sem período anterior para comparar" : `${formatSignedPercent(delta)} vs. período anterior`}
        </p>
      )}
    </div>
  );
}
