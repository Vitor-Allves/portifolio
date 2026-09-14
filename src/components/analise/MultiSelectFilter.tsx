"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

  const allSelected = options.length > 0 && selectedIds.size === options.length;
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
        className="flex items-center gap-2 text-[13px] px-4 py-2 rounded-full border border-navy-700/15 bg-white text-navy-700 hover:border-navy-600/40 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span>{allSelected || options.length === 0 ? placeholder : label}</span>
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
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-2 w-64 rounded-xl border border-navy-700/10 bg-white shadow-lg py-2"
        >
          {searchable && (
            <div className="px-3 pb-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded-lg border border-navy-700/15 px-3 py-1.5 text-[13px] focus:border-navy-600 focus:outline-none"
              />
            </div>
          )}
          <button
            type="button"
            onClick={selectAll}
            className="w-full text-left px-4 py-1.5 text-[12px] tracking-[0.06em] uppercase text-navy-500 hover:text-navy-950 transition-colors"
          >
            Selecionar todos
          </button>
          <div className="my-1 border-t border-navy-700/8" />
          <ul className="max-h-64 overflow-y-auto">
            {filteredOptions.length === 0 && (
              <li className="px-4 py-2 text-[13px] text-navy-500">Nenhum resultado.</li>
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
                    className="w-full flex items-center gap-3 text-left px-4 py-2 text-[13px] text-navy-800 hover:bg-silver-100 transition-colors"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        checked ? "bg-navy-950 border-navy-950" : "border-navy-700/25"
                      }`}
                      aria-hidden="true"
                    >
                      {checked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.5"
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
