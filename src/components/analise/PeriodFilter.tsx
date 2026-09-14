"use client";

import { useEffect, useRef, useState } from "react";
import { DATE_PRESETS, isValidDateRange, MAX_CUSTOM_RANGE_DAYS, type Period } from "@/lib/meta-ads-types";
import { formatShortDate } from "@/lib/format";
import { INTEL_PILL_BASE, INTEL_PILL_INACTIVE, INTEL_PILL_ACTIVE, INTEL_POPOVER, INTEL_INPUT, INTEL_LABEL } from "./intel-styles";

type PeriodFilterProps = {
  value: Period;
  onChange: (period: Period) => void;
  disabled?: boolean;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PeriodFilter({ value, onChange, disabled }: PeriodFilterProps) {
  const [open, setOpen] = useState(false);
  const [since, setSince] = useState(value.kind === "custom" ? value.range.since : "");
  const [until, setUntil] = useState(value.kind === "custom" ? value.range.until : todayIso());
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function applyCustomRange() {
    if (!since || !until || !isValidDateRange({ since, until })) {
      setError(`Escolha um início antes do fim, com no máximo ${MAX_CUSTOM_RANGE_DAYS} dias de intervalo.`);
      return;
    }
    setError(null);
    setOpen(false);
    onChange({ kind: "custom", range: { since, until } });
  }

  const label =
    value.kind === "preset"
      ? DATE_PRESETS.find((p) => p.value === value.preset)?.label ?? "Período"
      : `${formatShortDate(value.range.since)} – ${formatShortDate(value.range.until)}`;
  const isCustom = value.kind === "custom";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`${INTEL_PILL_BASE} ${isCustom ? INTEL_PILL_ACTIVE : INTEL_PILL_INACTIVE}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>{label}</span>
        <svg
          width="9"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          aria-hidden="true"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className={`absolute z-30 mt-2 w-[19rem] overflow-hidden ${INTEL_POPOVER}`}>
          <ul role="radiogroup" aria-label="Atalhos de período" className="py-2 max-h-56 overflow-y-auto">
            {DATE_PRESETS.map((preset) => {
              const selected = value.kind === "preset" && value.preset === preset.value;
              return (
                <li key={preset.value}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      onChange({ kind: "preset", preset: preset.value });
                      setOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-[13px] transition-colors duration-150 ${
                      selected ? "bg-intel-cyan/10 text-intel-cyan" : "text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text"
                    }`}
                  >
                    {preset.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-white/[0.06] p-4">
            <p className={`${INTEL_LABEL} mb-2.5`}>Período personalizado</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="period-since" className="block text-[10px] tracking-[0.08em] uppercase text-intel-text-dim mb-1">
                  Início
                </label>
                <input
                  id="period-since"
                  type="date"
                  value={since}
                  max={until || todayIso()}
                  onChange={(e) => setSince(e.target.value)}
                  className={`${INTEL_INPUT} [color-scheme:dark]`}
                />
              </div>
              <div>
                <label htmlFor="period-until" className="block text-[10px] tracking-[0.08em] uppercase text-intel-text-dim mb-1">
                  Fim
                </label>
                <input
                  id="period-until"
                  type="date"
                  value={until}
                  min={since}
                  max={todayIso()}
                  onChange={(e) => setUntil(e.target.value)}
                  className={`${INTEL_INPUT} [color-scheme:dark]`}
                />
              </div>
            </div>

            {error && (
              <p className="mt-2.5 text-xs text-intel-red" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={applyCustomRange}
              className="mt-3 w-full inline-flex items-center justify-center bg-intel-cyan text-[#04121a] text-[13px] tracking-[0.06em] uppercase font-semibold px-4 py-2.5 rounded-full hover:brightness-110 transition-[filter] duration-200"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
