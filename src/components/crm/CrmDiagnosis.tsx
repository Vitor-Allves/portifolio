"use client";

// Diagnóstico comercial on the contact (evolução v1.0, item 2.3): the latest
// version, a form to save a new one (prefilled from the latest; nothing is
// overwritten), and the earlier versions to read.

import { useEffect, useState } from "react";
import { DIAGNOSIS_FIELDS, URGENCIES, type CrmDiagnosis, type DiagnosisData, type DiagnosisFieldId } from "@/lib/crm-diagnosis-fields";
import { formatBRL, type CrmDeal } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN } from "./crm-styles";
import { dateTime } from "./crm-format";
import { centsToInput } from "./crm-fields";

function show(id: DiagnosisFieldId, v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const f = DIAGNOSIS_FIELDS.find((x) => x.id === id)!;
  if (f.kind === "money") return formatBRL(Number(v)) || "—";
  if (f.kind === "urgency") return URGENCIES.find((u) => u.id === v)?.label ?? String(v);
  return String(v);
}

function View({ d }: { d: CrmDiagnosis }) {
  // Only what was filled in (the need always is).
  const filled = DIAGNOSIS_FIELDS.filter((f) => d.data[f.id] !== null && d.data[f.id] !== undefined && d.data[f.id] !== "");
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
      {filled.map((f) => (
        <div key={f.id} className={f.kind === "text" ? "sm:col-span-2" : ""}>
          <dt className="text-[11px] text-crm-faint">{f.label}</dt>
          <dd className="text-crm-text whitespace-pre-wrap break-words">{show(f.id, d.data[f.id])}</dd>
        </div>
      ))}
    </dl>
  );
}

type Draft = Record<DiagnosisFieldId, string> & { dealId: string };
const toDraft = (d: CrmDiagnosis | null, dealId: string): Draft =>
  Object.fromEntries([
    ...DIAGNOSIS_FIELDS.map((f) => {
      const v = d?.data[f.id];
      return [f.id, v === null || v === undefined ? "" : f.kind === "money" ? centsToInput(Number(v)) : String(v)];
    }),
    ["dealId", d?.dealId ?? dealId],
  ]) as Draft;

export default function CrmDiagnosisSection({
  contactId,
  deals,
  canEdit,
  onSaved,
}: {
  contactId: string;
  deals: CrmDeal[];
  canEdit: boolean;
  onSaved?: () => void;
}) {
  const [list, setList] = useState<CrmDiagnosis[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openDeal = deals.find((d) => d.stage !== "ganho" && d.stage !== "perdido")?.id ?? "";

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/contacts/${contactId}/diagnoses/`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { diagnoses?: CrmDiagnosis[]; error?: string } | null;
        if (cancelled) return;
        setList(body?.diagnoses ?? []);
        if (!res.ok) setError(body?.error ?? "Não foi possível carregar o diagnóstico.");
      })
      .catch(() => !cancelled && setError("Não foi possível falar com o CRM agora."));
    return () => {
      cancelled = true;
    };
  }, [contactId, version]);

  const latest = list?.[0] ?? null;

  async function save() {
    if (!draft) return;
    setBusy(true);
    const res = await fetch(`/api/crm/contacts/${contactId}/diagnoses/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    if (!res.ok) return setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
    setError(null);
    setDraft(null);
    setVersion((v) => v + 1);
    onSaved?.();
  }

  return (
    <section aria-label="Diagnóstico comercial" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className={CRM_LABEL}>
          Diagnóstico comercial{latest ? <span className="normal-case tracking-normal font-normal text-crm-faint"> · versão {latest.version}</span> : null}
        </h3>
        {canEdit && !draft && (
          <button type="button" onClick={() => setDraft(toDraft(latest, openDeal))} className={CRM_LINK_BTN}>
            {latest ? "Atualizar diagnóstico" : "+ Fazer diagnóstico"}
          </button>
        )}
      </div>
      {error && <p className={CRM_ALERT}>{error}</p>}
      {draft ? (
        <div className="rounded-xl border border-crm-line bg-crm-sunken p-3 space-y-2" role="form" aria-label="Novo diagnóstico">
          {deals.length > 0 && (
            <label className="block">
              <span className={CRM_LABEL}>Oportunidade</span>
              <select
                value={draft.dealId}
                onChange={(e) => setDraft({ ...draft, dealId: e.target.value })}
                aria-label="Oportunidade do diagnóstico"
                className={`${CRM_INPUT} mt-1`}
              >
                <option value="">Só o contato</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DIAGNOSIS_FIELDS.map((f) => (
              <label key={f.id} className={`block ${f.kind === "text" ? "sm:col-span-2" : ""}`}>
                <span className={CRM_LABEL}>
                  {f.label}
                  {f.id === "need" ? " *" : ""}
                </span>
                {f.kind === "urgency" ? (
                  <select
                    value={draft[f.id]}
                    onChange={(e) => setDraft({ ...draft, [f.id]: e.target.value })}
                    aria-label={f.label}
                    className={`${CRM_INPUT} mt-1`}
                  >
                    <option value="">Não informada</option>
                    {URGENCIES.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                ) : f.kind === "text" ? (
                  <textarea
                    value={draft[f.id]}
                    onChange={(e) => setDraft({ ...draft, [f.id]: e.target.value })}
                    rows={2}
                    aria-label={f.label}
                    className={`${CRM_INPUT} mt-1 resize-y`}
                  />
                ) : (
                  <input
                    value={draft[f.id]}
                    onChange={(e) => setDraft({ ...draft, [f.id]: e.target.value })}
                    inputMode={f.kind === "money" ? "decimal" : undefined}
                    placeholder={f.kind === "money" ? "Ex.: 2.500" : undefined}
                    aria-label={f.label}
                    className={`${CRM_INPUT} mt-1`}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || !draft.need.trim()} onClick={() => void save()} className={CRM_BTN_PRIMARY}>
              {latest ? `Salvar versão ${latest.version + 1}` : "Salvar diagnóstico"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-[12.5px] px-2 text-crm-dim hover:text-crm-text">
              Cancelar
            </button>
            {latest && <span className="text-[11.5px] text-crm-faint">A versão {latest.version} continua guardada.</span>}
          </div>
        </div>
      ) : list === null ? (
        <p className="text-[12px] text-crm-faint">Carregando...</p>
      ) : latest ? (
        <div className="rounded-xl border border-crm-line bg-crm-card p-3 space-y-2">
          <p className="text-[11.5px] text-crm-faint">
            Por {latest.createdByName ?? "—"} em {dateTime(latest.createdAt)}
            {latest.dealTitle ? ` · oportunidade ${latest.dealTitle}` : ""}
          </p>
          <View d={latest} />
        </div>
      ) : (
        <p className="text-[12.5px] text-crm-dim">Nenhum diagnóstico ainda.</p>
      )}
      {!draft && list && list.length > 1 && (
        <details className="text-[12.5px]">
          <summary className="cursor-pointer text-crm-dim hover:text-crm-text">Versões anteriores ({list.length - 1})</summary>
          <ul className="mt-2 space-y-2">
            {list.slice(1).map((d) => (
              <li key={d.id} className="rounded-xl border border-crm-line bg-crm-sunken p-3 space-y-2" aria-label={`Diagnóstico versão ${d.version}`}>
                <p className="text-[11.5px] text-crm-faint">
                  Versão {d.version} · {d.createdByName ?? "—"} · {dateTime(d.createdAt)}
                </p>
                <View d={d} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export type { DiagnosisData };
