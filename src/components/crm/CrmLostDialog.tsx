"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CrmLostReason } from "@/lib/crm-types";
import { CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL } from "./crm-styles";
import { Mascot } from "./crm-brand";
import { useCatalog } from "./crm-catalog-context";

/** Asks why an opportunity was lost before it moves to "Perdido". */
export default function CrmLostDialog({
  dealTitle,
  onConfirm,
  onCancel,
}: {
  dealTitle: string;
  onConfirm: (reason: CrmLostReason, note: string) => void;
  onCancel: () => void;
}) {
  const { options } = useCatalog();
  const [reason, setReason] = useState<CrmLostReason | "">("");
  const [note, setNote] = useState("");

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (reason) onConfirm(reason, note);
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-lost-title"
        className="w-full max-w-md rounded-2xl border border-crm-line bg-crm-raised text-crm-text p-5 shadow-[var(--crm-shadow-lg)] space-y-4"
      >
        <div className="flex items-center gap-3">
          <Mascot name="legacyDoubt" decorative className="h-16 w-auto -my-1 shrink-0" />
          <div className="min-w-0">
            <h2 id="crm-lost-title" className="crm-display text-[17px]">
              Por que perdemos?
            </h2>
            <p className="text-[12px] text-crm-dim truncate">{dealTitle}</p>
          </div>
        </div>
        <fieldset className="space-y-1.5">
          <legend className={CRM_LABEL}>Motivo</legend>
          {options("lost_reason").map((r) => (
            <label
              key={r.id}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] cursor-pointer transition-colors ${
                reason === r.id ? "border-crm-accent bg-crm-accent/[0.06]" : "border-crm-line hover:border-crm-line-strong"
              }`}
            >
              <input type="radio" name="lost-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-[var(--crm-accent)]" />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label className="block">
          <span className={CRM_LABEL}>Detalhe (opcional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: volta a conversar em março" className={`${CRM_INPUT} mt-1`} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
            Cancelar
          </button>
          <button type="submit" disabled={!reason} className={CRM_BTN_PRIMARY}>
            Marcar como perdido
          </button>
        </div>
      </form>
    </div>
  );
}
