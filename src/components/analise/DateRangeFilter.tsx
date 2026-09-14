"use client";

import { useEffect, useRef, useState } from "react";
import { DATE_PRESETS, isValidDateRange, MAX_CUSTOM_RANGE_DAYS, type Period } from "@/lib/meta-ads-types";
import { formatShortDate } from "@/lib/format";

type DateRangeFilterProps = {
  value: Period;
  onChange: (period: Period) => void;
  disabled?: boolean;
};

const pillClass = (selected: boolean) =>
  `shrink-0 text-[13px] tracking-[0.06em] px-4 py-2 rounded-full border transition-colors duration-200 disabled:opacity-60 disabled:cursor-wait ${
    selected
      ? "bg-navy-950 border-navy-950 text-white"
      : "bg-white border-navy-700/15 text-navy-700 hover:border-navy-600/40"
  }`;

const fieldClass =
  "w-full rounded-lg border border-navy-700/20 bg-white px-3 py-2 text-sm text-navy-950 focus:border-navy-600 focus:outline-none transition-colors";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DateRangeFilter({ value, onChange, disabled }: DateRangeFilterProps) {
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
      setError(
        `Escolha um início antes do fim, com no máximo ${MAX_CUSTOM_RANGE_DAYS} dias de intervalo.`
      );
      return;
    }
    setError(null);
    setOpen(false);
    onChange({ kind: "custom", range: { since, until } });
  }

  const customLabel =
    value.kind === "custom"
      ? `${formatShortDate(value.range.since)} – ${formatShortDate(value.range.until)}`
      : "Período personalizado";

  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto items-start" role="group" aria-label="Período">
      <div role="radiogroup" aria-label="Período" className="flex flex-wrap gap-2">
        {DATE_PRESETS.map((preset) => {
          const selected = value.kind === "preset" && value.preset === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange({ kind: "preset", preset: preset.value })}
              className={pillClass(selected)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="relative" ref={rootRef}>
        <button
          type="button"
          aria-pressed={value.kind === "custom"}
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={pillClass(value.kind === "custom")}
        >
          {customLabel}
        </button>

        {open && (
          <div className="absolute z-20 mt-2 w-72 rounded-xl border border-navy-700/10 bg-white shadow-lg p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="date-since" className="block text-[11px] tracking-[0.1em] uppercase text-navy-500 mb-1.5">
                  Início
                </label>
                <input
                  id="date-since"
                  type="date"
                  value={since}
                  max={until || todayIso()}
                  onChange={(e) => setSince(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="date-until" className="block text-[11px] tracking-[0.1em] uppercase text-navy-500 mb-1.5">
                  Fim
                </label>
                <input
                  id="date-until"
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
              <p className="mt-3 text-xs text-red-700" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={applyCustomRange}
              className="mt-4 w-full inline-flex items-center justify-center bg-navy-950 text-white text-[13px] tracking-[0.08em] uppercase font-medium px-4 py-2.5 rounded-full hover:bg-navy-800 transition-colors duration-300"
            >
              Aplicar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
