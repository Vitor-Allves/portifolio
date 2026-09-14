"use client";

import { useEffect, useRef, useState } from "react";
import type { MetaAdAccount } from "@/lib/meta-ads-types";

type ClientFilterProps = {
  accounts: MetaAdAccount[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
};

export default function ClientFilter({ accounts, selectedIds, onChange }: ClientFilterProps) {
  const [open, setOpen] = useState(false);
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

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function selectAll() {
    onChange(new Set(accounts.map((a) => a.id)));
  }

  const allSelected = accounts.length > 0 && selectedIds.size === accounts.length;
  const label =
    accounts.length === 0
      ? "Nenhum cliente"
      : allSelected
        ? "Todos os clientes"
        : selectedIds.size === 0
          ? "Nenhum cliente selecionado"
          : `${selectedIds.size} de ${accounts.length} clientes`;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={accounts.length === 0}
        className="flex items-center gap-2 text-[13px] tracking-[0.02em] px-4 py-2 rounded-full border border-navy-700/15 bg-white text-navy-700 hover:border-navy-600/40 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
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
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-2 w-64 rounded-xl border border-navy-700/10 bg-white shadow-lg py-2"
        >
          <button
            type="button"
            onClick={selectAll}
            className="w-full text-left px-4 py-1.5 text-[12px] tracking-[0.06em] uppercase text-navy-500 hover:text-navy-950 transition-colors"
          >
            Selecionar todos
          </button>
          <div className="my-1 border-t border-navy-700/8" />
          <ul className="max-h-64 overflow-y-auto">
            {accounts.map((account) => {
              const checked = selectedIds.has(account.id);
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(account.id)}
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
                    <span className="truncate">{account.name}</span>
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
