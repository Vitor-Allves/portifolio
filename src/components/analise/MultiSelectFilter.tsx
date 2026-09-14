"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { INTEL_PILL_BASE, INTEL_PILL_INACTIVE, INTEL_PILL_ACTIVE, INTEL_POPOVER, INTEL_INPUT } from "./intel-styles";

export type FilterOption = { id: string; label: string };

type MultiSelectFilterProps = {
  placeholder: string;
  allLabel: string;
  options: FilterOption[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  searchable?: boolean;
  disabled?: boolean;
};

export default function MultiSelectFilter({
  placeholder,
  allLabel,
  options,
  selectedIds,
  onChange,
  searchable,
  disabled,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(options.map((o) => o.id)));
  }

  function clearAll() {
    onChange(new Set());
  }

  const allSelected = options.length > 0 && selectedIds.size === options.length;
  const narrowed = !allSelected && options.length > 0 && selectedIds.size > 0;
  const label =
    options.length === 0
      ? placeholder
      : allSelected
        ? allLabel
        : selectedIds.size === 0
          ? "Nenhum selecionado"
          : `${selectedIds.size} de ${options.length}`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled || options.length === 0}
        className={`${INTEL_PILL_BASE} disabled:cursor-not-allowed ${narrowed ? INTEL_PILL_ACTIVE : INTEL_PILL_INACTIVE}`}
      >
        <span>{allSelected || options.length === 0 ? placeholder : label}</span>
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
        <div role="listbox" aria-multiselectable="true" className={`absolute z-30 mt-2 w-64 py-2 ${INTEL_POPOVER}`}>
          {searchable && (
            <div className="px-3 pb-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className={INTEL_INPUT}
              />
            </div>
          )}
          <div className="flex items-center justify-between px-4">
            <button
              type="button"
              onClick={selectAll}
              className="py-1.5 text-[11px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-cyan transition-colors duration-200"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="py-1.5 text-[11px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-red transition-colors duration-200"
            >
              Desmarcar todos
            </button>
          </div>
          <div className="my-1 border-t border-white/[0.06]" />
          <ul className="max-h-64 overflow-y-auto">
            {filteredOptions.length === 0 && (
              <li className="px-4 py-2 text-[13px] text-intel-text-dim">Nenhum resultado.</li>
            )}
            {filteredOptions.map((option) => {
              const checked = selectedIds.has(option.id);
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(option.id)}
                    className="w-full flex items-center gap-3 text-left px-4 py-2 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text transition-colors duration-150"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                        checked ? "bg-intel-cyan border-intel-cyan" : "border-white/20"
                      }`}
                      aria-hidden="true"
                    >
                      {checked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="#070d1a"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
