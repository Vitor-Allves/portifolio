"use client";

import { useMemo } from "react";
import type { AudienceSegment } from "@/lib/meta-ads-types";
import { formatInteger, formatPercent } from "@/lib/format";

const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown"];
const GENDER_LABEL: Record<string, string> = { male: "Masculino", female: "Feminino", unknown: "Não informado" };
const GENDER_COLOR: Record<string, string> = {
  male: "var(--color-intel-cyan)",
  female: "var(--color-intel-violet)",
  unknown: "rgba(241,245,249,0.25)",
};

type AudienceBreakdownProps = { audience: AudienceSegment[] };

// Age and gender are mutually exclusive per person — every reached person
// falls into exactly one bucket — so, unlike per-campaign or per-day reach,
// summing these segments together (for the age-row totals, the overall
// gender split) doesn't double-count anyone. See AudienceSegment's own
// comment in meta-ads-types.ts.
export default function AudienceBreakdown({ audience }: AudienceBreakdownProps) {
  const { rows, totalReach, genderTotals } = useMemo(() => {
    const byAge = new Map<string, Map<string, number>>();
    let totalReach = 0;
    const genderTotals = new Map<string, number>();
    for (const seg of audience) {
      const ageMap = byAge.get(seg.age) ?? new Map<string, number>();
      ageMap.set(seg.gender, (ageMap.get(seg.gender) ?? 0) + seg.reach);
      byAge.set(seg.age, ageMap);
      totalReach += seg.reach;
      genderTotals.set(seg.gender, (genderTotals.get(seg.gender) ?? 0) + seg.reach);
    }
    const ages = [...byAge.keys()].sort((a, b) => {
      const ia = AGE_ORDER.indexOf(a);
      const ib = AGE_ORDER.indexOf(b);
      return (ia === -1 ? AGE_ORDER.length : ia) - (ib === -1 ? AGE_ORDER.length : ib);
    });
    const rows = ages.map((age) => {
      const genders = byAge.get(age)!;
      const ageTotal = [...genders.values()].reduce((s, v) => s + v, 0);
      return { age, ageTotal, genders };
    });
    return { rows, totalReach, genderTotals };
  }, [audience]);

  if (audience.length === 0 || totalReach === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Público alcançado</h3>
        <p className="text-sm text-intel-text-dim mt-3">Sem dados demográficos no período para os filtros atuais.</p>
      </div>
    );
  }

  const maxAgeTotal = Math.max(...rows.map((r) => r.ageTotal), 1);
  const genderKeys = [...genderTotals.keys()].sort((a, b) => (genderTotals.get(b) ?? 0) - (genderTotals.get(a) ?? 0));

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-[13px] font-medium text-intel-text">Público alcançado</h3>
        <div className="flex flex-wrap gap-3 text-[11px] text-intel-text-dim">
          {genderKeys.map((g) => (
            <span key={g} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: GENDER_COLOR[g] ?? GENDER_COLOR.unknown }} />
              {GENDER_LABEL[g] ?? g}: {formatPercent(((genderTotals.get(g) ?? 0) / totalReach) * 100, 0)}
            </span>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-intel-text-dim/70 mb-5">
        Distribuição por idade e gênero entre as pessoas alcançadas (contas selecionadas).
      </p>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.age}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[13px] text-intel-text-dim">{row.age === "unknown" ? "Não informado" : row.age}</span>
              <span className="text-[13px] tabular-nums text-intel-text">{formatInteger(row.ageTotal)}</span>
            </div>
            <div className="h-3 rounded-full bg-white/[0.05] overflow-hidden flex">
              {genderKeys.map((g) => {
                const value = row.genders.get(g) ?? 0;
                if (value === 0) return null;
                const widthPct = (value / maxAgeTotal) * 100;
                return (
                  <div
                    key={g}
                    className="h-full"
                    style={{ width: `${widthPct}%`, backgroundColor: GENDER_COLOR[g] ?? GENDER_COLOR.unknown }}
                    title={`${GENDER_LABEL[g] ?? g}: ${formatInteger(value)}`}
                  />
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
