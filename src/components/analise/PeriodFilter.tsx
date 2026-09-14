"use client";

import { useEffect, useRef, useState } from "react";
import { DATE_PRESETS, isValidDateRange, MAX_CUSTOM_RANGE_DAYS, type Period } from "@/lib/meta-ads-types";
import { formatShortDate } from "@/lib/format";

type PeriodFilterProps = {
  value: Period;
  onChange: (period: Period) => void;
  disabled?: boolean;
};

const fieldClass =
  "w-full rounded-lg border border-navy-700/20 bg-white px-3 py-2 text-sm text-navy-950 focus:border-navy-600 focus:outline-none transition-colors";

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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[13px] px-4 py-2 rounded-full border border-navy-700/15 bg-white text-navy-700 hover:border-navy-600/40 transition-colors duration-200 disabled:opacity-60 disabled:cursor-wait"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>{label}</span>
        <svg
          width="10"
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
        <div className="absolute z-30 mt-2 w-[19rem] rounded-xl border border-navy-700/10 bg-white shadow-lg overflow-hidden">
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
                    className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${
                      selected ? "bg-silver-100 text-navy-950 font-medium" : "text-navy-700 hover:bg-silver-100"
                    }`}
                  >
                    {preset.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-navy-700/8 p-4">
            <p className="text-[11px] tracking-[0.1em] uppercase text-navy-500 mb-2.5">Período personalizado</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="period-since" className="block text-[10px] tracking-[0.08em] uppercase text-navy-500 mb-1">
                  Início
                </label>
                <input
                  id="period-since"
                  type="date"
                  value={since}
                  max={until || todayIso()}
                  onChange={(e) => setSince(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="period-until" className="block text-[10px] tracking-[0.08em] uppercase text-navy-500 mb-1">
                  Fim
                </label>
                <input
                  id="period-until"
                  type="date"
                  value={until}
                  min={since}
                  max={todayIso()}
                  onChange={(e) => setUntil(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>

            {error && (
              <p className="mt-2.5 text-xs text-red-700" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={applyCustomRange}
              className="mt-3 w-full inline-flex items-center justify-center bg-navy-950 text-white text-[13px] tracking-[0.06em] uppercase font-medium px-4 py-2.5 rounded-full hover:bg-navy-800 transition-colors duration-300"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
