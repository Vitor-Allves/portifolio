"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CLOSE_GROUPS, reasonGroup, type LostCloseGroup } from "@/lib/crm-catalog";
import { CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL } from "./crm-styles";
import { Mascot } from "./crm-brand";
import { useCatalog } from "./crm-catalog-context";

/** What the tabulação sends along with the move to "Venda perdida". */
export type CrmCloseFields = { lostReason: string; lostNote: string; returnOn?: string; reopenReason?: string };

const GROUP_HINT: Record<LostCloseGroup, string> = {
  negativo: "Negociou e não fechou (preço, concorrente, orçamento…).",
  sem_conversao: "Não chegou a negociar (sem retorno, contato inválido…).",
  futuro: "Não é agora: volta para a agenda na data marcada.",
};

const todayBr = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

/**
 * Tabulação obrigatória (evolução v1.0, item 5) to close an opportunity
 * without a sale: the group (perda comercial, sem conversão, oportunidade
 * futura), the reason, an observation and — for a future opportunity — the
 * date to pick it up again. Whoever confirms is recorded as who closed it.
 * When the opportunity was already closed (a sale changed into a loss), it
 * also asks for the justification of the change.
 */
export default function CrmLostDialog({
  dealTitle,
  reopening = false,
  onConfirm,
  onCancel,
}: {
  dealTitle: string;
  /** The opportunity is closed (Venda fechada): changing the result needs a justification. */
  reopening?: boolean;
  onConfirm: (fields: CrmCloseFields) => void;
  onCancel: () => void;
}) {
  const { options } = useCatalog();
  const [group, setGroup] = useState<LostCloseGroup | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [returnOn, setReturnOn] = useState("");
  const [justification, setJustification] = useState("");
  const reasons = group ? options("lost_reason").filter((o) => reasonGroup(o) === group) : [];

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const missing = [
    !group && "o tipo de encerramento",
    group && !reason && "o motivo",
    !note.trim() && "a observação",
    group === "futuro" && !returnOn && "a data para retomar",
    reopening && !justification.trim() && "a justificativa",
  ].filter((m): m is string => Boolean(m));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (missing.length > 0) return;
    onConfirm({
      lostReason: reason,
      lostNote: note,
      ...(group === "futuro" ? { returnOn } : {}),
      ...(reopening ? { reopenReason: justification } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-lost-title"
        className="w-full max-w-md max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl border border-crm-line bg-crm-raised text-crm-text p-5 shadow-[var(--crm-shadow-lg)] space-y-4"
      >
        <div className="flex items-center gap-3">
          <Mascot name="legacyDoubt" decorative className="h-16 w-auto -my-1 shrink-0" />
          <div className="min-w-0">
            <h2 id="crm-lost-title" className="crm-display text-[17px]">
              Encerrar sem venda
            </h2>
            <p className="text-[12px] text-crm-dim truncate">{dealTitle}</p>
          </div>
        </div>

        {reopening && (
          <label className="block">
            <span className={CRM_LABEL}>Justificativa da mudança</span>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={2}
              placeholder="Por que a venda fechada passa a ser encerrada sem venda?"
              aria-label="Justificativa da mudança"
              className={`${CRM_INPUT} mt-1 resize-y`}
            />
          </label>
        )}

        <fieldset className="space-y-1.5">
          <legend className={CRM_LABEL}>Tipo de encerramento</legend>
          {CLOSE_GROUPS.filter((g) => g.id !== "positivo").map((g) => (
            <label
              key={g.id}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                group === g.id ? "border-crm-accent bg-crm-accent/[0.06]" : "border-crm-line hover:border-crm-line-strong"
              }`}
            >
              <input
                type="radio"
                name="close-group"
                value={g.id}
                checked={group === g.id}
                onChange={() => {
                  setGroup(g.id as LostCloseGroup);
                  setReason("");
                }}
                className="mt-1 accent-[var(--crm-accent)]"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{g.label}</span>
                <span className="block text-[11.5px] text-crm-dim">{GROUP_HINT[g.id as LostCloseGroup]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {group && (
          <label className="block">
            <span className={CRM_LABEL}>Motivo</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo do encerramento" className={`${CRM_INPUT} mt-1`}>
              <option value="">Escolha o motivo</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {group === "futuro" && (
          <label className="block">
            <span className={CRM_LABEL}>Retomar em</span>
            <input type="date" value={returnOn} min={todayBr()} onChange={(e) => setReturnOn(e.target.value)} aria-label="Retomar em" className={`${CRM_INPUT} mt-1`} />
          </label>
        )}

        <label className="block">
          <span className={CRM_LABEL}>Observações</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="O que aconteceu, em poucas palavras"
            aria-label="Observações do encerramento"
            className={`${CRM_INPUT} mt-1 resize-y`}
          />
        </label>

        <div className="flex items-center justify-end gap-2">
          {missing.length > 0 && <span className="mr-auto text-[11.5px] text-crm-faint">Falta {missing[0]}</span>}
          <button type="button" onClick={onCancel} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
            Cancelar
          </button>
          <button type="submit" disabled={missing.length > 0} className={CRM_BTN_PRIMARY}>
            Encerrar
          </button>
        </div>
      </form>
    </div>
  );
}
