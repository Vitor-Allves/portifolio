"use client";

import { useEffect, useState } from "react";
import type { CrmTeamMember } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL } from "./crm-styles";

type Counts = { contacts: number; deals: number; tasks: number; toName: string | null };

/**
 * Distribuir carteira: gives the ticked contacts (or every contact of the
 * current filter) to one person, with their open opportunities and pending
 * tasks if wanted. Shows what will change before confirming.
 */
export default function CrmAssignDialog({
  ids,
  filters,
  count,
  team,
  onClose,
  onDone,
}: {
  ids?: string[];
  filters?: Record<string, string>;
  /** How many contacts were picked (for the title). */
  count: number;
  team: CrmTeamMember[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [ownerId, setOwnerId] = useState("");
  const [picked, setPicked] = useState(false);
  const [moveDeals, setMoveDeals] = useState(true);
  const [moveTasks, setMoveTasks] = useState(true);
  const [preview, setPreview] = useState<{ key: string; counts: Counts | null; error: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = { ...(ids ? { ids } : { filters }), ownerId: ownerId || null, moveDeals, moveTasks };
  const key = JSON.stringify(body);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    fetch("/api/crm/contacts/assign/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(key), preview: true }) })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as (Counts & { error?: string }) | null;
        if (cancelled) return;
        setPreview(res.ok && data ? { key, counts: data, error: null } : { key, counts: null, error: data?.error ?? "Não foi possível calcular." });
      })
      .catch(() => !cancelled && setPreview({ key, counts: null, error: "Não foi possível calcular." }));
    return () => {
      cancelled = true;
    };
  }, [key, picked]);

  const ready = picked && preview?.key === key && preview.counts;
  const nothing = ready && preview.counts!.contacts + preview.counts!.deals + preview.counts!.tasks === 0;

  async function confirm() {
    setSaving(true);
    const res = await fetch("/api/crm/contacts/assign/", { method: "POST", headers: { "Content-Type": "application/json" }, body: key });
    setSaving(false);
    const data = (await res.json().catch(() => null)) as (Counts & { error?: string }) | null;
    if (!res.ok || !data) return setError(data?.error ?? "Não foi possível trocar o responsável.");
    onDone(
      `${data.contacts} contato${data.contacts === 1 ? "" : "s"}, ${data.deals} oportunidade${data.deals === 1 ? "" : "s"} e ${data.tasks} tarefa${data.tasks === 1 ? "" : "s"} agora com ${data.toName ?? "ninguém (sem responsável)"}.`
    );
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-assign-title"
        className="w-full max-w-md max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl border border-crm-line bg-crm-raised text-crm-text p-5 shadow-[var(--crm-shadow-lg)] space-y-4"
      >
        <div>
          <h2 id="crm-assign-title" className="crm-display text-[17px]">
            Trocar responsável
          </h2>
          <p className="text-[12px] text-crm-dim">
            {ids ? `${count} contato${count === 1 ? "" : "s"} selecionado${count === 1 ? "" : "s"}` : `Todos os ${count.toLocaleString("pt-BR")} contatos do filtro atual`}
          </p>
        </div>
        <label className="block">
          <span className={CRM_LABEL}>Novo responsável</span>
          <select
            value={picked ? ownerId : "__pick"}
            onChange={(e) => {
              setPicked(true);
              setOwnerId(e.target.value === "__none" ? "" : e.target.value);
            }}
            aria-label="Novo responsável"
            className={`${CRM_INPUT} mt-1`}
          >
            <option value="__pick" disabled>
              Escolha…
            </option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="__none">Sem responsável</option>
          </select>
        </label>
        <div className="space-y-1.5 text-[13px]">
          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={moveDeals} onChange={(e) => setMoveDeals(e.target.checked)} className="h-4 w-4 accent-[var(--crm-accent)]" />
            Levar junto as oportunidades abertas
          </label>
          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={moveTasks} onChange={(e) => setMoveTasks(e.target.checked)} className="h-4 w-4 accent-[var(--crm-accent)]" />
            Levar junto as tarefas pendentes
          </label>
        </div>
        {picked && (
          <p className="rounded-xl border border-crm-line bg-crm-sunken px-3 py-2.5 text-[12.5px]" role="status">
            {preview?.key !== key
              ? "Calculando…"
              : preview.error
                ? preview.error
                : `Vai mudar: ${preview.counts!.contacts} contato${preview.counts!.contacts === 1 ? "" : "s"}, ${preview.counts!.deals} oportunidade${preview.counts!.deals === 1 ? "" : "s"} aberta${preview.counts!.deals === 1 ? "" : "s"} e ${preview.counts!.tasks} tarefa${preview.counts!.tasks === 1 ? "" : "s"} pendente${preview.counts!.tasks === 1 ? "" : "s"}. Cada mudança fica no histórico do contato.`}
          </p>
        )}
        {error && (
          <p className={CRM_ALERT} role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
            Cancelar
          </button>
          <button type="button" disabled={!ready || nothing || saving} onClick={() => void confirm()} className={CRM_BTN_PRIMARY}>
            {saving ? "Trocando..." : "Trocar responsável"}
          </button>
        </div>
      </div>
    </div>
  );
}
