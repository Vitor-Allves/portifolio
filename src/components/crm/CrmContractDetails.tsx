"use client";

// A contract's extra details (evolução v1.0, item 8): number and origin
// proposal, payment terms, due day, term, renewal, cancellation rules, sales
// and operations owners, the signed document (one of the client's files),
// and the contract as a PDF to review and sign.

import { useState } from "react";
import { CONTRACT_RENEWALS } from "@/lib/crm-operation-types";
import type { CrmClientDetail, CrmContract, CrmTeamMember } from "@/lib/crm-types";
import { CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN } from "./crm-styles";
import { brDay } from "./crm-fields";

type Draft = {
  paymentTerms: string;
  dueDay: string;
  termMonths: string;
  renewal: string;
  cancellationRules: string;
  salesOwnerId: string;
  opsOwnerId: string;
  signedFileId: string;
  signedOn: string;
};
const toDraft = (k: CrmContract): Draft => ({
  paymentTerms: k.paymentTerms ?? "",
  dueDay: k.dueDay ? String(k.dueDay) : "",
  termMonths: k.termMonths ? String(k.termMonths) : "",
  renewal: k.renewal ?? "",
  cancellationRules: k.cancellationRules ?? "",
  salesOwnerId: k.salesOwnerId ?? "",
  opsOwnerId: k.opsOwnerId ?? "",
  signedFileId: k.signedFileId ?? "",
  signedOn: k.signedOn ?? "",
});

export const contractNumber = (n: number) => String(n).padStart(4, "0");

export default function CrmContractDetails({
  clientId,
  contract: k,
  team,
  canEdit,
  onSaved,
}: {
  clientId: string;
  contract: CrmContract;
  team: CrmTeamMember[];
  canEdit: boolean;
  onSaved: (client: CrmClientDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [files, setFiles] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEditing() {
    setDraft(toDraft(k));
    if (files === null) {
      const res = await fetch(`/api/crm/files/?clientId=${encodeURIComponent(clientId)}`).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { files?: { id: string; name: string }[] } | null;
      setFiles(body?.files ?? []);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    const res = await fetch(`/api/crm/clients/${clientId}/contracts/${k.id}/details/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        dueDay: draft.dueDay || null,
        termMonths: draft.termMonths || null,
        renewal: draft.renewal || null,
        salesOwnerId: draft.salesOwnerId || null,
        opsOwnerId: draft.opsOwnerId || null,
        signedFileId: draft.signedFileId || null,
        signedOn: draft.signedOn || null,
      }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { client?: CrmClientDetail; error?: string } | null;
    if (!res?.ok || !body?.client) return setError(body?.error ?? "Não foi possível salvar.");
    setError(null);
    setDraft(null);
    onSaved(body.client);
  }

  const renewal = CONTRACT_RENEWALS.find((r) => r.id === k.renewal)?.label;
  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        <span className="text-crm-faint">{`Contrato nº ${contractNumber(k.number)}${k.proposalNumber ? ` · proposta nº ${contractNumber(k.proposalNumber)}` : ""}`}</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={CRM_LINK_BTN}
          aria-expanded={open}
          aria-label={`Detalhes do contrato nº ${contractNumber(k.number)}`}
        >
          {open ? "Ocultar detalhes" : "Detalhes"}
        </button>
        <a href={`/api/crm/clients/${clientId}/contracts/${k.id}/pdf/`} className={CRM_LINK_BTN}>
          Gerar contrato (PDF)
        </a>
        {k.signedFileId && (
          <a href={`/api/crm/files/${k.signedFileId}/`} className="text-crm-green font-semibold hover:opacity-80">
            {`Assinado${k.signedOn ? ` em ${brDay(k.signedOn)}` : ""}`}
          </a>
        )}
      </div>
      {open && !draft && (
        <dl
          className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-crm-sunken px-3 py-2 text-[12px]"
          aria-label={`Detalhes do contrato ${contractNumber(k.number)}`}
        >
          {(
            [
              ["Condições de pagamento", k.paymentTerms],
              ["Dia de vencimento", k.dueDay ? `todo dia ${k.dueDay}` : null],
              ["Prazo de vigência", k.termMonths ? `${k.termMonths} meses` : null],
              ["Renovação", renewal ?? null],
              ["Responsável comercial", k.salesOwnerName],
              ["Responsável operacional", k.opsOwnerName],
              ["Valor único", k.oneTimeCents !== null ? (k.oneTimeCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null],
              ["Documento assinado", k.signedFileName ? `${k.signedFileName}${k.signedOn ? ` (${brDay(k.signedOn)})` : ""}` : null],
            ] as [string, string | null][]
          ).map(([t, v]) => (
            <div key={t}>
              <dt className="text-crm-faint">{t}</dt>
              <dd className="whitespace-pre-wrap">{v ?? "—"}</dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <dt className="text-crm-faint">Regras de cancelamento</dt>
            <dd className="whitespace-pre-wrap">{k.cancellationRules ?? "—"}</dd>
          </div>
          {canEdit && (
            <div className="sm:col-span-2">
              <button type="button" onClick={() => void startEditing()} className={CRM_LINK_BTN}>
                Editar detalhes
              </button>
            </div>
          )}
        </dl>
      )}
      {draft && (
        <div
          className="rounded-lg border border-crm-line bg-crm-sunken p-3 space-y-2"
          role="form"
          aria-label={`Detalhes do contrato nº ${contractNumber(k.number)}`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <label className="block">
              <span className={CRM_LABEL}>Prazo (meses)</span>
              <input
                value={draft.termMonths}
                onChange={(e) => setDraft({ ...draft, termMonths: e.target.value })}
                inputMode="numeric"
                aria-label="Prazo de vigência (meses)"
                className={`${CRM_INPUT} mt-1`}
              />
            </label>
            <label className="block">
              <span className={CRM_LABEL}>Dia de vencimento</span>
              <input
                value={draft.dueDay}
                onChange={(e) => setDraft({ ...draft, dueDay: e.target.value })}
                inputMode="numeric"
                aria-label="Dia de vencimento"
                className={`${CRM_INPUT} mt-1`}
              />
            </label>
            <label className="block">
              <span className={CRM_LABEL}>Renovação</span>
              <select
                value={draft.renewal}
                onChange={(e) => setDraft({ ...draft, renewal: e.target.value })}
                aria-label="Renovação"
                className={`${CRM_INPUT} mt-1`}
              >
                <option value="">A combinar</option>
                {CONTRACT_RENEWALS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={CRM_LABEL}>Responsável comercial</span>
              <select
                value={draft.salesOwnerId}
                onChange={(e) => setDraft({ ...draft, salesOwnerId: e.target.value })}
                aria-label="Responsável comercial"
                className={`${CRM_INPUT} mt-1`}
              >
                <option value="">—</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={CRM_LABEL}>Responsável operacional</span>
              <select
                value={draft.opsOwnerId}
                onChange={(e) => setDraft({ ...draft, opsOwnerId: e.target.value })}
                aria-label="Responsável operacional"
                className={`${CRM_INPUT} mt-1`}
              >
                <option value="">—</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={CRM_LABEL}>Assinado em</span>
              <input
                type="date"
                value={draft.signedOn}
                onChange={(e) => setDraft({ ...draft, signedOn: e.target.value })}
                aria-label="Data da assinatura"
                className={`${CRM_INPUT} mt-1`}
              />
            </label>
          </div>
          <label className="block">
            <span className={CRM_LABEL}>Documento assinado</span>
            <select
              value={draft.signedFileId}
              onChange={(e) => setDraft({ ...draft, signedFileId: e.target.value })}
              aria-label="Documento assinado"
              className={`${CRM_INPUT} mt-1`}
            >
              <option value="">{files && files.length === 0 ? "Anexe o PDF assinado em Histórico → Documentos do cliente" : "Nenhum"}</option>
              {(files ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={CRM_LABEL}>Condições de pagamento</span>
            <textarea
              value={draft.paymentTerms}
              onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })}
              rows={2}
              aria-label="Condições de pagamento do contrato"
              className={`${CRM_INPUT} mt-1 resize-y`}
            />
          </label>
          <label className="block">
            <span className={CRM_LABEL}>Regras de cancelamento</span>
            <textarea
              value={draft.cancellationRules}
              onChange={(e) => setDraft({ ...draft, cancellationRules: e.target.value })}
              rows={2}
              aria-label="Regras de cancelamento"
              className={`${CRM_INPUT} mt-1 resize-y`}
            />
          </label>
          {error && <p className="text-[12px] text-crm-red">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className={CRM_BTN_PRIMARY}>
              Salvar detalhes
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-[12.5px] px-2 text-crm-dim hover:text-crm-text">
              Cancelar
            </button>
          </div>
          <p className="text-[11px] text-crm-faint">Com o prazo em meses, o vencimento do contrato é calculado a partir do início.</p>
        </div>
      )}
    </div>
  );
}
