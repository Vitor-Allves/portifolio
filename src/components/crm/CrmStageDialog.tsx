"use client";

import { useEffect, useState, type FormEvent } from "react";
import { STAGE_REQUIREMENT_LABEL, joinPt, missingForStage, parseMoneyToCents, stageLabel, type CrmDeal } from "@/lib/crm-types";
import { CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL } from "./crm-styles";
import { Mascot } from "./crm-brand";
import { useCatalog } from "./crm-catalog-context";
import { ServiceSelect, centsToInput } from "./crm-fields";

/** What the dialog sends along with the stage. */
export type CrmStageFields = { service?: string; value?: string; negotiatedValue?: string; wonReason?: string; wonNote?: string };

type DealLike = Pick<CrmDeal, "title" | "service" | "valueCents" | "negotiatedCents" | "wonReason">;

/** Whether moving `deal` to `stage` needs this dialog: "Ganho" always (motivo), "Proposta enviada" when something is missing. */
export function needsStageDialog(deal: DealLike, stage: string): boolean {
  if (stage === "ganho") return true;
  return missingForStage(stage, { ...deal, wonReason: null }).length > 0;
}

function money(v: string): number | null | "invalid" {
  try {
    return parseMoneyToCents(v);
  } catch {
    return "invalid";
  }
}

/**
 * Exigência que cresce com a etapa: before a move to "Proposta enviada" it
 * asks for the service and the estimated value; before "Ganho", the service,
 * the negotiated value and why it was won. The server checks the same rules.
 */
export default function CrmStageDialog({
  deal,
  stage,
  onConfirm,
  onCancel,
  canCustomize = false,
}: {
  deal: DealLike;
  stage: "proposta" | "ganho";
  onConfirm: (fields: CrmStageFields) => void;
  onCancel: () => void;
  /** Administrador: the empty-services hint points to Personalização. */
  canCustomize?: boolean;
}) {
  const { options } = useCatalog();
  const won = stage === "ganho";
  const [service, setService] = useState(deal.service ?? "");
  const [value, setValue] = useState(centsToInput(deal.valueCents));
  const [negotiated, setNegotiated] = useState(centsToInput(deal.negotiatedCents ?? deal.valueCents));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const noServices = options("service", deal.service).length === 0;

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const valueCents = money(value);
  const negotiatedCents = money(negotiated);
  const missing = missingForStage(stage, {
    service: service || null,
    valueCents: valueCents === "invalid" ? null : valueCents,
    negotiatedCents: negotiatedCents === "invalid" ? null : negotiatedCents,
    wonReason: reason || null,
  });
  const invalid = (!won && valueCents === "invalid") || (won && negotiatedCents === "invalid");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (missing.length > 0 || invalid) return;
    onConfirm(
      won
        ? { service, negotiatedValue: negotiated, wonReason: reason, wonNote: note }
        : { service, value }
    );
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 px-4" onClick={onCancel}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-stage-title"
        className="w-full max-w-md max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl border border-crm-line bg-crm-raised text-crm-text p-5 shadow-[var(--crm-shadow-lg)] space-y-4"
      >
        <div className="flex items-center gap-3">
          <Mascot name={won ? "titanWin" : "legacyHello"} decorative className="h-16 w-auto -my-1 shrink-0" />
          <div className="min-w-0">
            <h2 id="crm-stage-title" className="crm-display text-[17px]">
              {won ? "Negócio ganho!" : `Ir para ${stageLabel(stage)}`}
            </h2>
            <p className="text-[12px] text-crm-dim truncate">{deal.title}</p>
          </div>
        </div>
        <p className="text-[12.5px] text-crm-dim">
          {won ? "Para registrar o ganho, confirme o serviço, o valor fechado e o motivo." : "Para enviar a proposta, a oportunidade precisa do serviço e do valor estimado."}
        </p>

        <label className="block">
          <span className={CRM_LABEL}>Serviço</span>
          <ServiceSelect value={service} onChange={setService} label="Serviço da oportunidade" emptyLabel="Escolha o serviço" className={`${CRM_INPUT} mt-1`} />
          {noServices && (
            <span className="mt-1 block text-[11.5px] text-crm-amber">
              Nenhum serviço cadastrado.{" "}
              {canCustomize ? "Cadastre em Administração → Personalização → Serviços." : "Peça a um administrador para cadastrar em Personalização → Serviços."}
            </span>
          )}
        </label>

        {won ? (
          <>
            <label className="block">
              <span className={CRM_LABEL}>Valor negociado (R$)</span>
              <input
                value={negotiated}
                onChange={(e) => setNegotiated(e.target.value)}
                inputMode="decimal"
                placeholder="Ex.: 2.500"
                aria-label="Valor negociado"
                className={`${CRM_INPUT} mt-1`}
              />
              {negotiatedCents === "invalid" && <span className="mt-1 block text-[11.5px] text-crm-red">Valor inválido — use, por exemplo, 2.500 ou 2.500,00.</span>}
            </label>
            <fieldset className="space-y-1.5">
              <legend className={CRM_LABEL}>Motivo do ganho</legend>
              {options("won_reason").map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] cursor-pointer transition-colors ${
                    reason === r.id ? "border-crm-accent bg-crm-accent/[0.06]" : "border-crm-line hover:border-crm-line-strong"
                  }`}
                >
                  <input type="radio" name="won-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-[var(--crm-accent)]" />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <label className="block">
              <span className={CRM_LABEL}>Detalhe (opcional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: fechou o plano anual" className={`${CRM_INPUT} mt-1`} />
            </label>
          </>
        ) : (
          <label className="block">
            <span className={CRM_LABEL}>Valor estimado (R$)</span>
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="Ex.: 2.500" aria-label="Valor estimado" className={`${CRM_INPUT} mt-1`} />
            {valueCents === "invalid" && <span className="mt-1 block text-[11.5px] text-crm-red">Valor inválido — use, por exemplo, 2.500 ou 2.500,00.</span>}
          </label>
        )}

        <div className="flex items-center justify-end gap-2">
          {missing.length > 0 && <span className="mr-auto text-[11.5px] text-crm-faint">Falta: {joinPt(missing.map((m) => STAGE_REQUIREMENT_LABEL[m]))}</span>}
          <button type="button" onClick={onCancel} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
            Cancelar
          </button>
          <button type="submit" disabled={missing.length > 0 || invalid} className={CRM_BTN_PRIMARY}>
            {won ? "Marcar como ganho" : "Mover"}
          </button>
        </div>
      </form>
    </div>
  );
}
