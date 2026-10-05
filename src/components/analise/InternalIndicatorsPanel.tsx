"use client";

// "Indicadores de uso interno" — global, administrador_geral-only screen
// (Parte 4B do prompt de relatórios). Reachable only from
// /intelligence/admin/, which the page itself already gates to
// administrador_geral, so no further role check is needed here.

import { useState } from "react";
import { INDICATOR_GROUPS, type ReportIndicatorId } from "@/lib/report-indicators";

export default function InternalIndicatorsPanel({ initialIds }: { initialIds: ReportIndicatorId[] }) {
  const [flagged, setFlagged] = useState<Set<ReportIndicatorId>>(() => new Set(initialIds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function persist(next: Set<ReportIndicatorId>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/analise/admin/internal-indicators/", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...next] }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Não foi possível salvar.");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: ReportIndicatorId) {
    const next = new Set(flagged);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFlagged(next);
    setSaved(false);
    void persist(next);
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <p className="text-[13px] font-medium text-intel-text mb-1">Indicadores de uso interno</p>
      <p className="text-[12px] text-intel-text-dim mb-5">
        Marque quais indicadores do relatório são de uso interno da Legado. Eles sempre começam desmarcados no painel &quot;Montar relatório&quot;
        de qualquer usuário, e só quem tem a permissão &quot;Pode incluir indicadores de uso interno&quot; consegue marcá-los.
      </p>

      <div className="rounded-lg border border-white/10 divide-y divide-white/[0.06]">
        {INDICATOR_GROUPS.map((group) => (
          <div key={group.id} className="px-4 py-3">
            <p className="text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim/60 mb-2">{group.label}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {group.options.map((opt) => {
                const marked = flagged.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    className="flex items-center gap-2 text-[13px] text-intel-text-dim hover:text-intel-text transition-colors duration-150"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        marked ? "bg-amber-400 border-amber-400" : "border-white/20"
                      }`}
                      aria-hidden="true"
                    >
                      {marked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#1a1200" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11.5px] text-intel-text-dim/70">
        {saving ? "Salvando..." : saved ? "Salvo." : " "}
      </p>
      {error && (
        <p className="mt-1 text-[12px] text-intel-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
